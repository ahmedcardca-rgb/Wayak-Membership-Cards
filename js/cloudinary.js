/**
 * cloudinary.js — Cloudinary image upload via REST API
 * Uses unsigned upload with a preset for browser-based uploads.
 * Falls back to signed upload if credentials are provided.
 */

const CLOUDINARY_BASE = 'https://api.cloudinary.com/v1_1';

/**
 * Upload a Blob to Cloudinary.
 *
 * @param {Blob}   blob          - JPEG blob to upload
 * @param {string} publicId      - Public ID (e.g., 'cards/MEM-000001')
 * @param {Object} creds         - { cloudName, uploadPreset?, apiKey?, apiSecret? }
 * @param {AbortSignal=} signal  - Optional abort signal
 * @returns {Promise<string>}    - Secure URL of uploaded image
 */
export async function uploadToCloudinary(blob, publicId, creds, signal) {
  const { cloudName, uploadPreset, apiKey, apiSecret } = creds;

  if (!cloudName) throw new Error('Cloud Name is required');

  const formData = new FormData();
  formData.append('file', blob, `${publicId}.jpg`);
  formData.append('public_id', publicId);

  // Unsigned upload (requires upload_preset)
  if (uploadPreset) {
    formData.append('upload_preset', uploadPreset);
  } else if (apiKey && apiSecret) {
    // Signed upload via API key + secret
    formData.append('overwrite', 'true');
    const timestamp   = Math.round(Date.now() / 1000);
    const signature   = await generateSignature({ public_id: publicId, timestamp, overwrite: true }, apiSecret);
    formData.append('api_key',   apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
  } else {
    throw new Error('Either upload_preset (unsigned) or api_key + api_secret (signed) is required');
  }

  const url = `${CLOUDINARY_BASE}/${cloudName}/image/upload`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body:   formData,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(`Network error: ${err.message}`);
  }

  const json = await response.json();

  if (!response.ok) {
    const msg = json?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Cloudinary error: ${msg}`);
  }

  return json.secure_url;
}

/**
 * Generate SHA-1 signature for signed Cloudinary upload.
 * @param {Object} params
 * @param {string} apiSecret
 * @returns {Promise<string>}
 */
async function generateSignature(params, apiSecret) {
  // Build sorted param string
  const paramStr = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&') + apiSecret;

  const msgBuffer  = new TextEncoder().encode(paramStr);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the Cloudinary public_id for a member card.
 * Result: "cards/<memberId>" (no extension — Cloudinary handles that)
 * @param {string} memberId
 * @returns {string}
 */
export function buildPublicId(memberId) {
  // Sanitize: replace spaces and special chars
  const safe = String(memberId)
    .trim()
    .replace(/[^\w\u0600-\u06FF\-\.]/g, '_');
  return `cards/${safe}`;
}
