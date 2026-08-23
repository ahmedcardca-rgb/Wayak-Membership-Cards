/**
 * storage.js — LocalStorage CRUD helpers
 * All app settings are persisted here.
 */

const STORAGE_KEYS = {
  CLOUDINARY_ACCOUNTS: 'mcg_cloudinary_accounts', // Array of accounts (new)
  CLOUDINARY_RR_INDEX: 'mcg_cloudinary_rr_index', // Round-robin index
  CLOUDINARY:          'mcg_cloudinary',           // Legacy single-account key (for migration)
  LAYOUT:              'mcg_layout',
  FONT:                'mcg_font',
  THEME:               'mcg_theme',
  BATCH_SIZE:          'mcg_batch_size',
  SHORTIO:             'mcg_shortio',
};

export const Storage = {

  // ── Multi-Account Cloudinary ──────────────────────────────────────────

  /**
   * Save array of Cloudinary accounts.
   * @param {Object[]} accounts
   */
  saveCloudinaryAccounts(accounts) {
    localStorage.setItem(STORAGE_KEYS.CLOUDINARY_ACCOUNTS, JSON.stringify(accounts));
  },

  /**
   * Load array of Cloudinary accounts.
   * Auto-migrates from old single-account format if found.
   * @returns {Object[]}
   */
  loadCloudinaryAccounts() {
    try {
      // Try new format first
      const raw = localStorage.getItem(STORAGE_KEYS.CLOUDINARY_ACCOUNTS);
      if (raw) return JSON.parse(raw);

      // ── Auto-migrate from legacy single-account format ──
      const legacy = localStorage.getItem(STORAGE_KEYS.CLOUDINARY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed?.cloudName) {
          const migrated = [parsed]; // Wrap in array
          this.saveCloudinaryAccounts(migrated);
          localStorage.removeItem(STORAGE_KEYS.CLOUDINARY); // Clean up old key
          return migrated;
        }
      }
    } catch { /* fall through */ }
    return [];
  },

  /**
   * Save the current round-robin index.
   * @param {number} index
   */
  saveRoundRobinIndex(index) {
    localStorage.setItem(STORAGE_KEYS.CLOUDINARY_RR_INDEX, String(index));
  },

  /**
   * Load the persisted round-robin index.
   * @returns {number}
   */
  loadRoundRobinIndex() {
    const val = localStorage.getItem(STORAGE_KEYS.CLOUDINARY_RR_INDEX);
    return val ? parseInt(val, 10) : 0;
  },

  // ── Usage Tracking (local estimates) ─────────────────────────────────

  /**
   * Increment the upload counter for a specific cloudName.
   * @param {string} cloudName
   * @param {number} blobSizeBytes - size of the uploaded blob
   */
  trackUpload(cloudName, blobSizeBytes = 0) {
    const raw = localStorage.getItem('mcg_usage') || '{}';
    let usage = {};
    try { usage = JSON.parse(raw); } catch { usage = {}; }
    if (!usage[cloudName]) usage[cloudName] = { count: 0, bytes: 0 };
    usage[cloudName].count += 1;
    usage[cloudName].bytes += blobSizeBytes;
    localStorage.setItem('mcg_usage', JSON.stringify(usage));
  },

  /**
   * Load usage stats for all accounts.
   * @returns {Object} — { [cloudName]: { count, bytes } }
   */
  loadUsage() {
    try {
      const raw = localStorage.getItem('mcg_usage');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  /**
   * Reset usage counter for a specific cloudName.
   * @param {string} cloudName
   */
  resetUsage(cloudName) {
    const raw = localStorage.getItem('mcg_usage') || '{}';
    let usage = {};
    try { usage = JSON.parse(raw); } catch { usage = {}; }
    delete usage[cloudName];
    localStorage.setItem('mcg_usage', JSON.stringify(usage));
  },

  /**
   * Save card layout coordinates & styling
   * @param {Object} layout
   */
  saveLayout(layout) {
    localStorage.setItem(STORAGE_KEYS.LAYOUT, JSON.stringify(layout));
  },

  /**
   * Load card layout settings
   * @returns {Object}
   */
  loadLayout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LAYOUT);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  /**
   * Save font settings
   * @param {Object} font
   */
  saveFont(font) {
    localStorage.setItem(STORAGE_KEYS.FONT, JSON.stringify(font));
  },

  /**
   * Load font settings
   * @returns {Object}
   */
  loadFont() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FONT);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  /**
   * Save current theme
   * @param {'dark'|'light'} theme
   */
  saveTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  },

  /**
   * Load saved theme
   * @returns {'dark'|'light'}
   */
  loadTheme() {
    return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  },

  /**
   * Save batch processing size
   * @param {number} size
   */
  saveBatchSize(size) {
    localStorage.setItem(STORAGE_KEYS.BATCH_SIZE, String(size));
  },

  /**
   * Load batch processing size
   * @returns {number}
   */
  loadBatchSize() {
    const val = localStorage.getItem(STORAGE_KEYS.BATCH_SIZE);
    return val ? parseInt(val, 10) : 50;
  },

  /**
   * Save Short.io credentials
   * @param {{ apiKey: string, domain: string }} data
   */
  saveShortio(data) {
    localStorage.setItem(STORAGE_KEYS.SHORTIO, JSON.stringify(data));
  },

  /**
   * Load Short.io credentials
   * @returns {{ apiKey: string, domain: string } | null}
   */
  loadShortio() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SHORTIO);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
};
