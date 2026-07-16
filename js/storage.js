/**
 * storage.js — LocalStorage CRUD helpers
 * All app settings are persisted here.
 */

const STORAGE_KEYS = {
  CLOUDINARY: 'mcg_cloudinary',
  LAYOUT:     'mcg_layout',
  FONT:       'mcg_font',
  THEME:      'mcg_theme',
  BATCH_SIZE: 'mcg_batch_size',
  SHORTIO:    'mcg_shortio',
};

export const Storage = {

  /**
   * Save Cloudinary credentials
   * @param {{ cloudName: string, apiKey: string, apiSecret: string, uploadPreset: string }} data
   */
  saveCloudinary(data) {
    localStorage.setItem(STORAGE_KEYS.CLOUDINARY, JSON.stringify(data));
  },

  /**
   * Load Cloudinary credentials
   * @returns {{ cloudName: string, apiKey: string, apiSecret: string, uploadPreset: string } | null}
   */
  loadCloudinary() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CLOUDINARY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
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
