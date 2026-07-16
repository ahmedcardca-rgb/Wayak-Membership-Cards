/**
 * shortener.js — Short.io REST API integration for URL shortening
 */

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

  const response = await fetch('https://api.short.io/links', {
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

  const json = await response.json();

  if (!response.ok) {
    const errorMsg = json?.error || json?.message || `HTTP ${response.status}`;
    throw new Error(`Short.io error: ${errorMsg}`);
  }

  return json.shortURL;
}
