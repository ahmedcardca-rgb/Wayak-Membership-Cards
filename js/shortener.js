/**
 * shortener.js — Short.io REST API integration for URL shortening
 */

import { fetchWithRetry, sanitizeDomain } from './utils.js';

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

  const cleanDomain = sanitizeDomain(domain);

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
