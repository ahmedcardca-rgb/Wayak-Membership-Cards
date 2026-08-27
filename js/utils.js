/**
 * utils.js — Shared low-level utilities
 * Extracted from cloudinary.js + shortener.js to avoid duplication.
 */

/**
 * Fetch with exponential backoff retry logic.
 * Retries on network errors or 429/5xx status codes.
 *
 * @param {string}  url
 * @param {Object}  options     - Standard fetch options (method, headers, body, signal)
 * @param {number}  maxRetries  - Default 3
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      // Retry on 429 Too Many Requests or 5xx Server Error
      if (!response.ok && (response.status === 429 || response.status >= 500)) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response; // Success or non-retriable 4xx
    } catch (err) {
      if (options.signal?.aborted) throw err; // Never retry on abort
      attempt++;
      if (attempt >= maxRetries) throw err;   // Out of retries
      // Exponential backoff: 1s, 2s, 4s... + jitter
      const delayMs = Math.pow(2, attempt - 1) * 1000 + Math.random() * 500;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/**
 * Sanitize a user-supplied domain string.
 * Strips protocol, www., and trailing slashes.
 * Result is safe to embed in "https://${domain}/..."
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeDomain(raw) {
  return String(raw)
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/+$/, '');
}
