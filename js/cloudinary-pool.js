/**
 * cloudinary-pool.js — Multi-account Cloudinary Pool with Round-Robin + Smart Failover
 *
 * Features:
 *  - Round-Robin distribution: cycles through accounts sequentially
 *  - Smart Failover: if an account fails, automatically tries the next one
 *  - Persists the round-robin index between sessions via onAdvance callback
 */

export class CloudinaryPool {
  /**
   * @param {Object[]} accounts   - Array of Cloudinary credential objects
   * @param {number}   startIndex - Index to start from (persisted between sessions)
   */
  constructor(accounts = [], startIndex = 0) {
    if (!accounts || accounts.length === 0) {
      throw new Error('CloudinaryPool: يجب إضافة حساب Cloudinary واحد على الأقل');
    }
    this._accounts  = accounts;
    this._index     = startIndex % accounts.length;
    this._onAdvance = null;
  }

  /** Number of accounts in the pool */
  get size() { return this._accounts.length; }

  /** The current index (which account goes next) */
  get currentIndex() { return this._index; }

  /**
   * Register a callback that fires whenever the index advances.
   * Use this to persist the index to localStorage after each upload.
   * @param {function(number): void} cb
   */
  onAdvance(cb) { this._onAdvance = cb; }

  /**
   * Get the next account in round-robin order and advance the index.
   * @returns {{ cloudName, uploadPreset?, apiKey?, apiSecret?, customDomain? }}
   */
  getNext() {
    const account = this._accounts[this._index];
    this._index   = (this._index + 1) % this._accounts.length;
    if (typeof this._onAdvance === 'function') this._onAdvance(this._index);
    return account;
  }

  /**
   * Smart Failover: get the next account that is NOT in the failed set.
   * Tries all accounts before giving up.
   *
   * @param {Set<number>} failedIndices - Set of account indices that already failed
   * @returns {{ account: Object, index: number } | null} — null if all accounts failed
   */
  getNextFallback(failedIndices) {
    const total = this._accounts.length;
    for (let attempt = 0; attempt < total; attempt++) {
      const candidateIndex = (this._index + attempt) % total;
      if (!failedIndices.has(candidateIndex)) {
        // Found a working candidate — advance index past it
        this._index = (candidateIndex + 1) % total;
        if (typeof this._onAdvance === 'function') this._onAdvance(this._index);
        return { account: this._accounts[candidateIndex], index: candidateIndex };
      }
    }
    return null; // All accounts failed
  }

  /** Peek at current account without advancing */
  peek() { return this._accounts[this._index]; }

  /** Reset index to 0 */
  reset() {
    this._index = 0;
    if (typeof this._onAdvance === 'function') this._onAdvance(0);
  }

  /** Returns display-safe summary (no secrets) */
  getSummary() {
    return this._accounts.map((acc, i) => ({
      index:     i,
      cloudName: acc.cloudName,
      method:    acc.uploadPreset
        ? `Preset: ${acc.uploadPreset}`
        : `API Key: ${acc.apiKey?.slice(0, 6)}…`,
    }));
  }
}
