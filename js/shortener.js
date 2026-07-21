/**
 * shortener.js — Short.io REST API integration for URL shortening
 */

/**
 * Fetch with exponential backoff retry logic.
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      // Retry on 429 Too Many Requests or 5xx Server Error
      if (!response.ok && (response.status === 429 || response.status >= 500)) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (err) {
      if (options.signal?.aborted) throw err;
      attempt++;
      if (attempt >= maxRetries) throw err;
      const delayMs = Math.pow(2, attempt - 1) * 1000 + (Math.random() * 500);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/**
 * Shorten a long URL using Short.io API
 * @param {string} longUrl
 * @param {Object} creds - { apiKey, domain }
 * @param {AbortSignal=} signal
 * @returns {Promise<string>} - The short URL
 */
export async function shortenUrl(longUrl, creds, signal) {
  const { apiKey, domain } = creds;
  if (!apiKey || !domain) {
    throw new Error('Short.io API Key and Domain are required');
  }

  // Ensure clean domain name (e.g. wayakcard.s.gy)
  let cleanDomain = domain.trim();
  cleanDomain = cleanDomain.replace(/^(https?:\/\/)?(www\.)?/, ''); // remove http://, https://, www.
  cleanDomain = cleanDomain.replace(/\/+$/, ''); // remove trailing slashes

  let response;
  try {
    response = await fetchWithRetry('https://api.short.io/links', {
      method: 'POST',
      headers: {
        'Authorization': apiKey.trim(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        originalURL: longUrl,
        domain: cleanDomain,
        allowDuplicates: false
      }),
      signal
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(`Network/Server error: ${err.message}`);
  }

  const json = await response.json();

  if (!response.ok) {
    const errorMsg = json?.error || json?.message || `HTTP ${response.status}`;
    throw new Error(`Short.io error: ${errorMsg}`);
  }

  return json.shortURL;
}
