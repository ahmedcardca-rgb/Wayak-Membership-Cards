/**
 * processor.js — Batch card processing engine
 *
 * Responsibilities:
 *  1. Iterate over member rows in configurable batches
 *  2. Draw each card on canvas
 *  3. Export canvas to Blob
 *  4. Upload to Cloudinary
 *  5. Report progress via callbacks
 *  6. Collect results for Excel output
 *  7. Never stop on a single error
 */

import { drawCard, canvasToBlob }         from './canvas.js';
import { uploadToCloudinary }              from './cloudinary.js';
import { yieldToBrowser }                  from './ui.js';
import { shortenUrl }                      from './shortener.js';
import { Storage }                         from './storage.js';

/**
 * @typedef {Object} ProcessorOptions
 * @property {HTMLImageElement}  template       - Pre-loaded card template
 * @property {Object[]}          rows           - All member rows from Excel
 * @property {Object}            colMap         - { nameCol, memberCol, expiryCol }
 * @property {Object}            layout         - Card layout settings
 * @property {Object}            font           - Font settings
 * @property {import('./cloudinary-pool.js').CloudinaryPool} cloudinaryPool - Pool of Cloudinary accounts
 * @property {Object=}           shortioCreds   - Short.io credentials (optional)
 * @property {number}            batchSize      - Cards per batch (default 50)
 * @property {HTMLCanvasElement} canvas         - Reusable canvas element
 * @property {Function}          onProgress     - (stats) => void
 * @property {Function}          onLog          - (level, msg, meta?) => void
 * @property {AbortSignal=}      signal         - For cancellation
 */

/**
 * Process all members and return a results map.
 * @param {ProcessorOptions} opts
 * @returns {Promise<{ urlMap: Map<string,string>, stats: Object }>}
 */
export async function processAllCards(opts) {
  const {
    template,
    rows,
    colMap,
    layout,
    font,
    cloudinaryPool,
    shortioCreds,
    batchSize = 50,
    exportMode = 'cloudinary',
    canvas,
    onProgress,
    onLog,
    signal,
  } = opts;

  const urlMap = new Map();  // rowIndex → Card_URL

  // Inject rowIndex into rows to track them through batches
  const rowsWithIndex = rows.map((r, i) => ({ ...r, __rowIndex: i }));

  // Initialize ZIP if needed
  let zip = null;
  if (exportMode === 'zip' || exportMode === 'both') {
    zip = new window.JSZip();
  }

  const stats = {
    total:     rows.length,
    generated: 0,
    uploaded:  0,
    failed:    0,
    errors:    [],
  };

  onLog('INFO', `Starting processing of ${rows.length} members in batches of ${batchSize}`);

  // Split into batches
  const batches = chunkArray(rowsWithIndex, batchSize);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    if (signal?.aborted) {
      onLog('WARN', 'Processing was cancelled by user');
      break;
    }

    const batch      = batches[batchIdx];
    const batchStart = batchIdx * batchSize + 1;
    const batchEnd   = batchStart + batch.length - 1;
    onLog('INFO', `Processing batch ${batchIdx + 1}/${batches.length} (rows ${batchStart}–${batchEnd})`);

    const uploadTasks = [];

    // ── Phase 1: Draw and Export to Blobs (Sequential to protect shared Canvas context) ──
    for (const row of batch) {
      if (signal?.aborted) break;

      const rowIndex = row.__rowIndex;
      const name     = String(row[colMap.nameCol]   || '').trim();
      const memberId = String(row[colMap.memberCol]  || '').trim();
      const expiry   = String(row[colMap.expiryCol]  || '').trim();
      const phone    = String(row[colMap.phoneCol]   || '').trim();

      if (!memberId && !name) {
        stats.failed++;
        onLog('WARN', `Skipped empty row (Row ${rowIndex + 1})`, { member: '(unknown)' });
        onProgress({ ...stats });
        continue;
      }

      try {
        drawCard(canvas, template, { name, memberId, expiry, phone }, layout, font);
        stats.generated++;
        onLog('INFO', `Generated card for: ${name} (${memberId})`);

        const blob = await canvasToBlob(canvas, 0.65);
        uploadTasks.push({ blob, name, memberId, rowIndex });
      } catch (err) {
        stats.failed++;
        const errMsg = err?.message || String(err);
        stats.errors.push({ member: name, memberId, reason: errMsg });
        onLog('ERROR', `Generation failed: ${name} (${memberId}) — ${errMsg}`, { member: name, reason: errMsg });
        onProgress({ ...stats });
      }
    }

    if (signal?.aborted) break;

    // ── Phase 2: Export/Upload ──
    if (exportMode === 'zip') {
      for (const task of uploadTasks) {
        if (signal?.aborted) break;
        const { blob, name, memberId, rowIndex } = task;
        // Sanitize filename and completely decouple from memberId
        const safeName = String(name || 'Unknown').replace(/[\/\\?%*:|"<>]/g, '_');
        zip.file(`Card_${rowIndex + 1}_${safeName}.webp`, blob);
        stats.uploaded++; // Count it as processed
        urlMap.set(rowIndex, 'Local ZIP');
        onLog('SUCCESS', `Added to ZIP: ${name} (Row ${rowIndex + 1})`);
        onProgress({ ...stats });
      }
    } else {
      // ── Cloudinary Concurrent Upload ──
      const SUB_CHUNK_SIZE = 10; // Upload 10 cards simultaneously
      for (let i = 0; i < uploadTasks.length; i += SUB_CHUNK_SIZE) {
        if (signal?.aborted) break;
        const subChunk = uploadTasks.slice(i, i + SUB_CHUNK_SIZE);

        await Promise.all(subChunk.map(async (task) => {
          if (signal?.aborted) return;
          const { blob, name, memberId, rowIndex } = task;

          // If 'both' mode, add to ZIP first
          if (exportMode === 'both' && zip) {
            const safeName = String(name || 'Unknown').replace(/[\/\\?%*:|"<>]/g, '_');
            zip.file(`Card_${rowIndex + 1}_${safeName}.webp`, blob);
          }

          // ── Smart Failover Upload ──
          // Try each Cloudinary account in sequence until one succeeds.
          const randomString = Math.random().toString(36).substring(2, 8);
          const publicId = `cards/card_${rowIndex + 1}_${Date.now()}_${randomString}`;
          const failedAccountIndices = new Set();
          let url = null;
          let lastUploadErr = null;


          // First attempt: use the round-robin account
          let { account: firstCreds, index: firstIdx } = (() => {
            const idx = cloudinaryPool.currentIndex;
            return { account: cloudinaryPool.getNext(), index: idx };
          })();

          // actualCreds tracks whichever account ultimately succeeded
          let actualCreds = firstCreds;

          try {
            url = await uploadToCloudinary(blob, publicId, firstCreds, signal);
          } catch (firstErr) {
            if (signal?.aborted) throw firstErr;
            lastUploadErr = firstErr;
            failedAccountIndices.add(firstIdx);
            onLog('WARN', `⚠️ الحساب "${firstCreds.cloudName}" فشل، جارٍ تجربة حساب آخر... (${firstErr.message})`);

            // Failover: try remaining accounts
            let fallback;
            while ((fallback = cloudinaryPool.getNextFallback(failedAccountIndices)) !== null) {
              if (signal?.aborted) break;
              try {
                url = await uploadToCloudinary(blob, publicId, fallback.account, signal);
                actualCreds = fallback.account; // ← credit the account that actually worked
                onLog('INFO', `✅ تم الرفع عبر الحساب البديل: "${fallback.account.cloudName}"`);
                lastUploadErr = null;
                break;
              } catch (fbErr) {
                if (signal?.aborted) throw fbErr;
                lastUploadErr = fbErr;
                failedAccountIndices.add(fallback.index);
                onLog('WARN', `⚠️ الحساب البديل "${fallback.account.cloudName}" فشل أيضاً (${fbErr.message})`);
              }
            }
          }

          if (url) {
            stats.uploaded++;
            // Track usage against the account that actually completed the upload
            Storage.trackUpload(actualCreds.cloudName, blob.size);
            onLog('SUCCESS', `Uploaded: ${name || 'N/A'} (Row ${rowIndex + 1}) → ${url}`, { member: name });

            // Shorten if configured
            if (shortioCreds && shortioCreds.apiKey && shortioCreds.domain) {
              try {
                url = await shortenUrl(url, shortioCreds, signal);
                onLog('SUCCESS', `Shortened: ${url}`, { member: name });
              } catch (shErr) {
                onLog('WARN', `Shortener failed, using long URL for ${name || 'N/A'} (${shErr.message})`);
              }
            }
            urlMap.set(rowIndex, url);
          } else {
            // All accounts failed
            stats.failed++;
            const errMsg = lastUploadErr?.message || 'All Cloudinary accounts failed';
            stats.errors.push({ member: name, rowIndex, reason: errMsg });
            onLog('ERROR', `❌ فشل الرفع لكل الحسابات: ${name || 'N/A'} (صف ${rowIndex + 1}) — ${errMsg}`);
          }

          // Report progress after each card finishes uploading
          onProgress({ ...stats });
        }));
      }
    }

    // ── After each batch: yield to browser GC ──
    onLog('INFO', `Batch ${batchIdx + 1} complete. Yielding to browser…`);
    await yieldToBrowser();
    // Small additional pause to let GC breathe on very large sets
    if (rows.length > 500) await sleep(20);
  }

  onLog(
    stats.failed === 0 ? 'SUCCESS' : 'WARN',
    `Processing complete. Generated: ${stats.generated}, Processed: ${stats.uploaded}, Failed: ${stats.failed}`
  );

  if ((exportMode === 'zip' || exportMode === 'both') && zip) {
    onLog('INFO', 'Generating ZIP file... please wait. (This may take a moment for large files)');
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      window.saveAs(content, 'Membership_Cards.zip');
      onLog('SUCCESS', 'ZIP file downloaded successfully!');
    } catch (zipErr) {
      onLog('ERROR', `Failed to generate ZIP: ${zipErr.message}`);
    }
  }

  return { urlMap, stats };
}

/**
 * Split an array into chunks of given size
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleep for N milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
