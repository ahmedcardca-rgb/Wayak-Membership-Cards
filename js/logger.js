/**
 * logger.js — In-memory logging system with export capability
 * Tracks all events during card generation.
 */

export const LogLevel = {
  INFO:    'INFO',
  SUCCESS: 'SUCCESS',
  WARN:    'WARN',
  ERROR:   'ERROR',
};

export class Logger {
  constructor() {
    this._entries = [];
    this._onEntry = null; // callback: (entry) => void
  }

  /**
   * Register a callback for real-time log updates
   * @param {(entry: Object) => void} fn
   */
  onEntry(fn) {
    this._onEntry = fn;
  }

  /**
   * Add a log entry
   * @param {string} level
   * @param {string} message
   * @param {Object=} meta
   */
  log(level, message, meta = {}) {
    const entry = {
      id:        this._entries.length + 1,
      timestamp: new Date(),
      time:      new Date().toLocaleTimeString('en-US', { hour12: false }),
      level,
      message,
      ...meta,
    };
    this._entries.push(entry);
    if (this._onEntry) this._onEntry(entry);
    return entry;
  }

  info(msg, meta)    { return this.log(LogLevel.INFO,    msg, meta); }
  success(msg, meta) { return this.log(LogLevel.SUCCESS, msg, meta); }
  warn(msg, meta)    { return this.log(LogLevel.WARN,    msg, meta); }
  error(msg, meta)   { return this.log(LogLevel.ERROR,   msg, meta); }

  /** Get all entries */
  getAll()   { return [...this._entries]; }

  /** Get only error entries */
  getErrors() { return this._entries.filter(e => e.level === LogLevel.ERROR); }

  /** Clear all entries */
  clear() { this._entries = []; }

  /** Count by level */
  countErrors() { return this._entries.filter(e => e.level === LogLevel.ERROR).length; }

  /**
   * Export log as formatted text
   * @param {Object} summary - { startTime, endTime, total, uploaded, failed }
   * @returns {string}
   */
  exportText(summary = {}) {
    const lines = [];
    lines.push('='.repeat(70));
    lines.push('   MEMBERSHIP CARD GENERATOR — EXECUTION LOG');
    lines.push('='.repeat(70));
    lines.push('');

    if (summary.startTime)  lines.push(`Start Time  : ${summary.startTime}`);
    if (summary.endTime)    lines.push(`End Time    : ${summary.endTime}`);
    if (summary.duration)   lines.push(`Duration    : ${summary.duration}`);
    if (summary.total != null)    lines.push(`Total       : ${summary.total}`);
    if (summary.generated != null) lines.push(`Generated   : ${summary.generated}`);
    if (summary.uploaded != null)  lines.push(`Uploaded    : ${summary.uploaded}`);
    if (summary.failed != null)    lines.push(`Failed      : ${summary.failed}`);
    lines.push('');
    lines.push('-'.repeat(70));
    lines.push('  DETAILED LOG');
    lines.push('-'.repeat(70));
    lines.push('');

    for (const e of this._entries) {
      const timeStr  = e.time.padEnd(12);
      const levelStr = `[${e.level}]`.padEnd(10);
      lines.push(`${timeStr} ${levelStr} ${e.message}`);
      if (e.member) lines.push(`${' '.repeat(23)} Member: ${e.member}`);
      if (e.reason)  lines.push(`${' '.repeat(23)} Reason: ${e.reason}`);
    }

    lines.push('');
    lines.push('='.repeat(70));
    lines.push('   END OF LOG');
    lines.push('='.repeat(70));

    return lines.join('\n');
  }

  /**
   * Download log file
   * @param {Object} summary
   */
  downloadLog(summary = {}) {
    const text     = this.exportText(summary);
    const blob     = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const dateStr  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href         = url;
    a.download     = `card-generator-log-${dateStr}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
