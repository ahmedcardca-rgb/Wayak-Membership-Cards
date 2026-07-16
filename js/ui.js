/**
 * ui.js — DOM helpers, progress updates, toast notifications, counters
 * All DOM access is deferred until function call time (no top-level getElementById).
 */

// ── Toast Notifications ───────────────────────────────────────────────

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number=} duration ms (default 3500)
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ── Progress Bar ──────────────────────────────────────────────────────

/**
 * Update the progress bar and percentage label
 * @param {number} current
 * @param {number} total
 */
export function updateProgress(current, total) {
  const pct   = total > 0 ? Math.round((current / total) * 100) : 0;
  const fill  = document.getElementById('progress-fill');
  const label = document.getElementById('progress-pct');
  const curr  = document.getElementById('progress-current');
  const tot   = document.getElementById('progress-total');

  if (fill)  fill.style.width   = `${pct}%`;
  if (label) label.textContent  = `${pct}%`;
  if (curr)  curr.textContent   = String(current);
  if (tot)   tot.textContent    = String(total);
}

// ── Stat Counters ─────────────────────────────────────────────────────

/**
 * Update a stat counter with animation
 * @param {string} id    - Element ID
 * @param {number} value
 */
export function updateCounter(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  const prev = parseInt(el.textContent, 10) || 0;
  if (prev !== value) {
    el.textContent = String(value);
    el.classList.remove('updated');
    void el.offsetWidth; // Trigger reflow for animation restart
    el.classList.add('updated');
    setTimeout(() => el.classList.remove('updated'), 350);
  }
}

// ── Timer ─────────────────────────────────────────────────────────────

let _timerInterval = null;
let _startTime     = null;

export function startTimer() {
  _startTime     = Date.now();
  _timerInterval = setInterval(() => {
    const el = document.getElementById('stat-time');
    if (el) el.textContent = formatElapsed(Date.now() - _startTime);
  }, 1000);
}

export function stopTimer() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  return _startTime ? (Date.now() - _startTime) : 0;
}

export function getElapsed() {
  return _startTime ? (Date.now() - _startTime) : 0;
}

/**
 * Format elapsed milliseconds as MM:SS or HH:MM:SS
 * @param {number} ms
 * @returns {string}
 */
export function formatElapsed(ms) {
  const secs = Math.floor(ms / 1000);
  const h    = Math.floor(secs / 3600);
  const m    = Math.floor((secs % 3600) / 60);
  const s    = secs % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── Log Panel ─────────────────────────────────────────────────────────

let _logEntries = 0;

/**
 * Append a log entry to the DOM log panel
 * @param {Object} entry - { time, level, message }
 */
export function appendLogEntry(entry) {
  const logContent = document.getElementById('log-content');
  const logCount   = document.getElementById('log-count');
  if (!logContent) return;

  _logEntries++;
  if (logCount) logCount.textContent = String(_logEntries);

  const div = document.createElement('div');
  div.className = `log-entry ${entry.level}`;
  div.innerHTML = `
    <span class="log-time">${escapeHtml(entry.time)}</span>
    <span class="log-level">[${escapeHtml(entry.level)}]</span>
    <span class="log-msg">${escapeHtml(entry.message)}</span>
  `;
  logContent.appendChild(div);

  // Auto-scroll to bottom only if user is already near the bottom
  const threshold = 100;
  const nearBottom = (logContent.scrollHeight - logContent.scrollTop - logContent.clientHeight) < threshold;
  if (nearBottom) {
    logContent.scrollTop = logContent.scrollHeight;
  }
}

export function clearLogUI() {
  const logContent = document.getElementById('log-content');
  const logCount   = document.getElementById('log-count');
  if (logContent) logContent.innerHTML = '';
  _logEntries = 0;
  if (logCount) logCount.textContent = '0';
}

// ── Section Visibility ────────────────────────────────────────────────

export function showSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    // Scroll into view with a slight delay so CSS transition can start
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

export function hideSection(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// ── Step Badge ────────────────────────────────────────────────────────

export function markStepDone(stepNum) {
  const card  = document.querySelector(`[data-step="${stepNum}"]`);
  const badge = card?.querySelector('.step-badge');
  if (badge) {
    badge.classList.add('done');
    badge.textContent = '✓';
    card.classList.add('step-done-anim');
  }
}

// ── Utility ──────────────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS
 * @param {*} str
 * @returns {string}
 */
export function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str ?? '').replace(/[&<>"']/g, m => map[m]);
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Set button loading state
 * @param {HTMLButtonElement|null} btn
 * @param {boolean} loading
 * @param {string=} loadingText
 */
export function setButtonLoading(btn, loading, loadingText = 'Processing...') {
  if (!btn) return;
  if (loading) {
    btn._originalHTML = btn.innerHTML;
    btn.innerHTML     = `<span class="spinner"></span> ${escapeHtml(loadingText)}`;
    btn.disabled      = true;
  } else {
    if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
    btn.disabled = false;
  }
}

/**
 * Yield to the browser event loop to allow UI updates & GC
 * @returns {Promise<void>}
 */
export function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
