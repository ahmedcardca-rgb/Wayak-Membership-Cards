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
import { uploadToCloudinary, buildPublicId } from './cloudinary.js';
import { yieldToBrowser }                  from './ui.js';
import { shortenUrl }                      from './shortener.js';

/**
 * @typedef {Object} ProcessorOptions
 * @property {HTMLImageElement}  template     - Pre-loaded card template
 * @property {Object[]}          rows         - All member rows from Excel
 * @property {Object}            colMap       - { nameCol, memberCol, expiryCol }
 * @property {Object}            layout       - Card layout settings
 * @property {Object}            font         - Font settings
 * @property {Object}            cloudinaryCreds - Cloudinary credentials
 * @property {Object=}           shortioCreds - Short.io credentials (optional)
 * @property {number}            batchSize    - Cards per batch (default 50)
 * @property {HTMLCanvasElement} canvas       - Reusable canvas element
 * @property {Function}          onProgress   - (stats) => void
 * @property {Function}          onLog        - (level, msg, meta?) => void
 * @property {AbortSignal=}      signal       - For cancellation
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
    cloudinaryCreds,
    shortioCreds,
    batchSize = 50,
    exportMode = 'cloudinary',
    canvas,
    onProgress,
    onLog,
    signal,
  } = opts;

  const urlMap = new Map();  // Member_ID → Card_URL

  // Initialize ZIP if needed
  let zip = null;
  if (exportMode === 'zip') {
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
  const batches = chunkArray(rows, batchSize);

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

      const name     = String(row[colMap.nameCol]   || '').trim();
      const memberId = String(row[colMap.memberCol]  || '').trim();
      const expiry   = String(row[colMap.expiryCol]  || '').trim();
      const phone    = String(row[colMap.phoneCol]   || '').trim();

      if (!memberId) {
        stats.failed++;
        onLog('WARN', `Skipped row — missing Member_ID`, { member: name || '(unknown)' });
        onProgress({ ...stats });
        continue;
      }

      try {
        drawCard(canvas, template, { name, memberId, expiry, phone }, layout, font);
        stats.generated++;
        onLog('INFO', `Generated card for: ${name} (${memberId})`);

        const blob = await canvasToBlob(canvas, 0.92);
        uploadTasks.push({ blob, name, memberId });
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
        const { blob, name, memberId } = task;
        // Sanitize filename
        const safeName = String(name).replace(/[\/\\?%*:|"<>]/g, '_');
        zip.file(`${memberId}_${safeName}.jpg`, blob);
        stats.uploaded++; // Count it as processed
        urlMap.set(memberId, 'Local ZIP');
        onLog('SUCCESS', `Added to ZIP: ${name} (${memberId})`);
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
          const { blob, name, memberId } = task;

          try {
            const publicId = buildPublicId(memberId);
            let url        = await uploadToCloudinary(blob, publicId, cloudinaryCreds, signal);
            stats.uploaded++;
            onLog('SUCCESS', `Uploaded: ${name} → ${url}`, { member: name });

            if (shortioCreds && shortioCreds.apiKey && shortioCreds.domain) {
              try {
                onLog('INFO', `Shortening URL for: ${name} via Short.io…`);
                const shortUrl = await shortenUrl(url, shortioCreds, signal);
                url = shortUrl;
                onLog('SUCCESS', `Shortened: ${name} → ${url}`, { member: name });
              } catch (shortErr) {
                onLog('WARN', `Shortening failed for: ${name} — ${shortErr.message || shortErr}. Using Cloudinary URL instead.`, { member: name });
              }
            }

            urlMap.set(memberId, url);
          } catch (err) {
            stats.failed++;
            const errMsg = err?.message || String(err);
            stats.errors.push({ member: name, memberId, reason: errMsg });
            onLog('ERROR', `Upload failed: ${name} (${memberId}) — ${errMsg}`, { member: name, reason: errMsg });
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

  if (exportMode === 'zip' && zip) {
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
