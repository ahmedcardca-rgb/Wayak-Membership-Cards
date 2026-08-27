/**
 * app.js — Main Application Orchestrator
 * Ties all modules together and manages UI state.
 *
 * ES Module — all imports must be at the top level.
 */

import { Storage }                                              from './storage.js';
import { Logger }                                               from './logger.js';
import { readExcel, writeExcel, detectColumns, downloadTemplateExcel }                 from './excel.js';
import { loadImage, revokeImageUrl, drawPreview, DEFAULT_LAYOUT, DEFAULT_FONT } from './canvas.js';
import { processAllCards }                                      from './processor.js';
import { CloudinaryPool }                                       from './cloudinary-pool.js';
import {
  showToast, updateProgress, updateCounter, startTimer, stopTimer,
  formatElapsed, appendLogEntry, clearLogUI, showSection, hideSection,
  markStepDone, setButtonLoading, escapeHtml,
} from './ui.js';

// ── App State ─────────────────────────────────────────────────────────
const state = {
  templateFile:       null,
  templateImage:      null,
  excelFile:          null,
  excelData:          null,       // { headers, rows }
  colMap:             null,       // { nameCol, memberCol, expiryCol }
  cloudinaryAccounts: [],         // Array of Cloudinary credential objects
  layout:             null,
  font:               null,
  isProcessing:       false,
  abortController:    null,
  lastSummary:        null,
  _editingIndex:      -1,         // Index of account being edited (-1 = adding new)
};

const logger = new Logger();

// workCanvas is accessed after DOMContentLoaded — initialized in init()
let workCanvas = null;

// ── Init ──────────────────────────────────────────────────────────────
function init() {
  workCanvas = document.getElementById('work-canvas');
  applyTheme(Storage.loadTheme());
  loadPersistedSettings();
  bindEvents();
  logger.onEntry(entry => appendLogEntry(entry));
  logger.info('Card Generator Pro initialized');
}

// ── Theme ─────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── Load Persisted Settings ───────────────────────────────────────────
function loadPersistedSettings() {
  // Cloudinary Accounts (auto-migrates from old single-account format)
  const savedAccounts = Storage.loadCloudinaryAccounts();
  state.cloudinaryAccounts = savedAccounts;
  renderAccountsList();
  if (savedAccounts.length > 0) {
    showSavedBadge('cloudinary-saved-badge');
    markStepDone(3);
  }

  // Layout
  const savedLayout = Storage.loadLayout();
  state.layout = savedLayout ? savedLayout : JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  populateLayoutFields(state.layout);

  // Font
  const savedFont = Storage.loadFont();
  state.font = savedFont ? savedFont : JSON.parse(JSON.stringify(DEFAULT_FONT));
  populateFontFields(state.font);

  // Sync color hex field
  const colorHex = document.getElementById('font-color-hex');
  if (colorHex) colorHex.value = state.font.color || '#ffffff';

  // Batch size
  setVal('batch-size', Storage.loadBatchSize());

  // Short.io
  const savedShortio = Storage.loadShortio();
  if (savedShortio) {
    state.shortioCreds = savedShortio;
    setVal('shortio-key',    savedShortio.apiKey || '');
    setVal('shortio-domain', savedShortio.domain || '');
    showSavedBadge('shortio-saved-badge');
  }
}

function showSavedBadge(id) {
  const badge = document.getElementById(id);
  if (badge) badge.classList.remove('hidden');
}

// ── Layout Field Sync ─────────────────────────────────────────────────
function populateLayoutFields(layout) {
  const fields = [
    ['name',     'name-x',   'name-y',   'name-size',   'name-align',   'name-show'],
    ['memberId', 'member-x', 'member-y', 'member-size', 'member-align', 'member-show'],
    ['expiry',   'expiry-x', 'expiry-y', 'expiry-size', 'expiry-align', 'expiry-show'],
    ['phone',    'phone-x',  'phone-y',  'phone-size',  'phone-align',  'phone-show'],
  ];
  for (const [key, xId, yId, sizeId, alignId, showId] of fields) {
    const el = layout[key] || {};
    setVal(xId,     el.x     ?? 50);
    setVal(yId,     el.y     ?? 50);
    setVal(sizeId,  el.size  ?? 30);
    setVal(alignId, el.align || 'center');
    setChecked(showId, el.show !== false);
  }
}

function readLayoutFields() {
  return {
    name: {
      x:     parseFloat(getVal('name-x'))   || 18.1,
      y:     parseFloat(getVal('name-y'))   || 41.2,
      size:  parseFloat(getVal('name-size'))|| 45,
      align: getVal('name-align') || 'center',
      show:  document.getElementById('name-show')?.checked !== false,
    },
    memberId: {
      x:     parseFloat(getVal('member-x')) || 9,
      y:     parseFloat(getVal('member-y')) || 63.7,
      size:  parseFloat(getVal('member-size'))|| 45,
      align: getVal('member-align') || 'left',
      show:  document.getElementById('member-show')?.checked !== false,
    },
    expiry: {
      x:     parseFloat(getVal('expiry-x')) || 9.7,
      y:     parseFloat(getVal('expiry-y')) || 75.1,
      size:  parseFloat(getVal('expiry-size'))|| 45,
      align: getVal('expiry-align') || 'left',
      show:  document.getElementById('expiry-show')?.checked !== false,
    },
    phone: {
      x:     parseFloat(getVal('phone-x'))  || 8.1,
      y:     parseFloat(getVal('phone-y'))  || 52.7,
      size:  parseFloat(getVal('phone-size'))|| 45,
      align: getVal('phone-align') || 'left',
      show:  document.getElementById('phone-show')?.checked !== false,
    },
  };
}

// ── Font Field Sync ───────────────────────────────────────────────────
function populateFontFields(font) {
  setVal('font-family', font.family || 'Cairo');
  setVal('font-size',   font.size   || 100);
  setVal('font-color',  font.color  || '#000000');
  setChecked('font-bold',   font.bold   !== false);
  setChecked('font-shadow', font.shadow === true);

  // Sync track UI states
  updateToggleTrack('font-bold',   'bold-track');
  updateToggleTrack('font-shadow', 'shadow-track');
}

function updateToggleTrack(cbId, trackId) {
  const cb    = document.getElementById(cbId);
  const track = document.getElementById(trackId);
  if (cb && track) track.classList.toggle('active', cb.checked);
}

function readFontFields() {
  return {
    family:      getVal('font-family') || 'Cairo',
    size:        parseInt(getVal('font-size'), 10) || 100,
    color:       getVal('font-color') || '#000000',
    bold:        document.getElementById('font-bold')?.checked   ?? true,
    shadow:      document.getElementById('font-shadow')?.checked ?? true,
    shadowColor: 'rgba(0,0,0,0.6)',
    shadowBlur:  4,
    shadowOffX:  2,
    shadowOffY:  2,
  };
}

// ── Bind All Events ───────────────────────────────────────────────────
function bindEvents() {

  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    Storage.saveTheme(next);
  });

  // ── Step 1: Template Upload ──
  bindDropZone('template-dropzone', 'template-input', handleTemplateFile);

  // ── Step 2: Excel Upload ──
  bindDropZone('excel-dropzone', 'excel-input', handleExcelFile);

  // ── Step 3: Add Cloudinary Account ──
  document.getElementById('add-account-btn')?.addEventListener('click', addCloudinaryAccount);
  document.getElementById('reset-rr-btn')?.addEventListener('click', resetRoundRobin);
  document.getElementById('cancel-edit-btn')?.addEventListener('click', cancelEditAccount);

  // ── Export / Import Settings ──
  document.getElementById('export-settings-btn')?.addEventListener('click', exportSettingsJSON);
  document.getElementById('import-settings-input')?.addEventListener('change', importSettingsJSON);

  // ── WhatsApp Share ──
  document.getElementById('whatsapp-share-btn')?.addEventListener('click', openWhatsAppShare);

  // ── Step 3.5: Short.io Save ──
  document.getElementById('save-shortio')?.addEventListener('click', saveShortioSettings);

  // ── Step 4: Layout & Font Preview ──
  document.getElementById('preview-card')?.addEventListener('click', updatePreview);
  document.getElementById('save-settings')?.addEventListener('click', saveLayoutAndFont);

  // Layout/Font fields — live preview on change
  const livePreviewIds = [
    'name-x','name-y','name-align','name-size','name-show',
    'member-x','member-y','member-align','member-size','member-show',
    'expiry-x','expiry-y','expiry-align','expiry-size','expiry-show',
    'phone-x','phone-y','phone-align','phone-size','phone-show',
    'font-family','font-size','font-color','font-bold','font-shadow',
  ];
  livePreviewIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', updatePreview);
    el.addEventListener('input',  updatePreview);
  });

  // Color hex sync (two-way)
  document.getElementById('font-color')?.addEventListener('input', (e) => {
    const hex = document.getElementById('font-color-hex');
    if (hex) hex.value = e.target.value;
    updatePreview();
  });

  // ── Step 5: Generate ──
  document.getElementById('generate-btn')?.addEventListener('click', startGeneration);

  // ── Cancel ──
  document.getElementById('cancel-btn')?.addEventListener('click', cancelGeneration);

  // ── Download Excel ──
  document.getElementById('download-excel')?.addEventListener('click', downloadOutputExcel);

  // ── Download Template ──
  document.getElementById('download-template')?.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      downloadTemplateExcel();
    } catch (err) {
      console.error(err);
      alert('خطأ أثناء تحميل النموذج: ' + err.message);
    }
  });

  // ── Download Log ──
  document.getElementById('download-log')?.addEventListener('click', downloadLog);

  // ── Log Panel Toggle ──
  document.getElementById('log-header')?.addEventListener('click', () => {
    const content = document.getElementById('log-content');
    const chevron = document.getElementById('log-chevron');
    if (!content || !chevron) return;
    const isHidden = content.classList.contains('hidden');
    if (isHidden) {
      content.classList.remove('hidden');
      chevron.style.transform = 'rotate(180deg)';
    } else {
      content.classList.add('hidden');
      chevron.style.transform = 'rotate(0deg)';
    }
  });

  // ── Initialize Canvas Drag & Drop ──
  initCanvasDragAndDrop();

  // ── Batch Size ──
  document.getElementById('batch-size')?.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val > 0) Storage.saveBatchSize(val);
  });

  // ── Password Visibility Toggles ──
  document.querySelectorAll('.toggle-vis').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const isPass    = target.type === 'password';
      target.type     = isPass ? 'text' : 'password';
      btn.textContent = isPass ? '🙈' : '👁️';
    });
  });
}

// ── Drag & Drop Helper ────────────────────────────────────────────────
function bindDropZone(zoneId, inputId, handler) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  input.addEventListener('change', (e) => {
    if (e.target.files[0]) handler(e.target.files[0]);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handler(file);
  });

  // Click opens file dialog (but not if clicking the file input itself)
  zone.addEventListener('click', (e) => {
    if (e.target === input) return;
    input.click();
  });

  // Keyboard accessibility
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
}

// ── Template File Handler ─────────────────────────────────────────────
async function handleTemplateFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file (JPG, PNG, WebP, etc.)', 'error');
    shakeElement('template-dropzone');
    return;
  }

  // Revoke previous blob URL to prevent memory leak
  if (state.templateImage) revokeImageUrl(state.templateImage);

  try {
    state.templateFile  = file;
    state.templateImage = await loadImage(file);

    const zone = document.getElementById('template-dropzone');
    if (zone) {
      zone.classList.add('has-file');
      // Use src from loaded img element (the object URL we created)
      zone.innerHTML = `
        <span class="drop-zone-icon">🖼️</span>
        <span class="drop-zone-text">Template Loaded</span>
        <span class="drop-zone-filename">${escapeHtml(file.name)}</span>
        <img class="drop-zone-preview" src="${escapeHtml(state.templateImage.src)}" alt="Template preview" />
        <span class="drop-zone-subtext">${state.templateImage.naturalWidth}×${state.templateImage.naturalHeight}px</span>
      `;
    }

    // Ensure initial layout values apply cleanly on first template load without overriding them
    // (We removed the old fixed Y overrides here since we now use percentage-based layout)

    markStepDone(1);
    showToast('Template image loaded ✓', 'success');

    // Update preview if template loaded
    updatePreview();
  } catch (err) {
    showToast(`Failed to load image: ${err.message}`, 'error');
  }
}

// ── Excel File Handler ────────────────────────────────────────────────
async function handleExcelFile(file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    showToast('Please upload an Excel file (.xlsx or .xls)', 'error');
    shakeElement('excel-dropzone');
    return;
  }

  try {
    const data      = await readExcel(file);
    state.excelData = data;
    state.colMap    = detectColumns(data.headers);
    state.excelFile = file;

    const zone = document.getElementById('excel-dropzone');
    if (zone) {
      zone.classList.add('has-file');
      zone.innerHTML = `
        <span class="drop-zone-icon">📊</span>
        <span class="drop-zone-text">Excel Loaded — ${data.rows.length} Members</span>
        <span class="drop-zone-filename">${escapeHtml(file.name)}</span>
        <span class="drop-zone-subtext">
          Auto-detected: 
          <strong>${escapeHtml(state.colMap.nameCol)}</strong> · 
          <strong>${escapeHtml(state.colMap.memberCol)}</strong> · 
          <strong>${escapeHtml(state.colMap.expiryCol)}</strong>
        </span>
      `;
    }

    updateCounter('stat-total', data.rows.length);
    markStepDone(2);
    showToast(`Excel loaded: ${data.rows.length} members found`, 'success');
  } catch (err) {
    showToast(`Failed to read Excel: ${err.message}`, 'error');
    console.error('Excel read error:', err);
  }
}

// ── Cloudinary Multi-Account Management ──────────────────────────────

/**
 * Add a new Cloudinary account from the form inputs (or update existing if in edit mode).
 */
function addCloudinaryAccount() {
  const cloudName    = getVal('cloud-name').trim();
  const uploadPreset = getVal('upload-preset').trim();
  const apiKey       = getVal('api-key').trim();
  const apiSecret    = getVal('api-secret').trim();
  const customDomain = getVal('custom-domain').trim();

  if (!cloudName) {
    showToast('Cloud Name مطلوب', 'error');
    return;
  }
  if (!uploadPreset && (!apiKey || !apiSecret)) {
    showToast('أدخل Upload Preset (الطريقة الأولى) أو API Key + Secret (الطريقة الثانية)', 'error');
    return;
  }

  const editingIndex = state._editingIndex;
  const updatedAccount = { cloudName, uploadPreset, apiKey, apiSecret, customDomain };

  if (editingIndex >= 0) {
    // ── Edit Mode: update existing account ──
    state.cloudinaryAccounts[editingIndex] = updatedAccount;
    Storage.saveCloudinaryAccounts(state.cloudinaryAccounts);
    state._editingIndex = -1;

    const addBtn = document.getElementById('add-account-btn');
    if (addBtn) addBtn.innerHTML = '➕ إضافة الحساب';
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');

    showToast(`✅ تم تحديث حساب "${cloudName}" بنجاح`, 'success');
  } else {
    // ── Add Mode: check for duplicates ──
    if (state.cloudinaryAccounts.some(a => a.cloudName === cloudName)) {
      showToast(`الحساب "${cloudName}" موجود بالفعل! استخدم زر ✏️ للتعديل.`, 'error');
      return;
    }
    state.cloudinaryAccounts.push(updatedAccount);
    Storage.saveCloudinaryAccounts(state.cloudinaryAccounts);
    showToast(`✅ تم إضافة حساب "${cloudName}" (${state.cloudinaryAccounts.length} حساب إجمالاً)`, 'success');
  }

  // Clear form
  setVal('cloud-name', '');
  setVal('upload-preset', '');
  setVal('api-key', '');
  setVal('api-secret', '');
  setVal('custom-domain', '');

  renderAccountsList();
  markStepDone(3);
  showSavedBadge('cloudinary-saved-badge');
}

/**
 * Remove a Cloudinary account by index.
 * @param {number} index
 */
function removeCloudinaryAccount(index) {
  const removed = state.cloudinaryAccounts[index];
  state.cloudinaryAccounts.splice(index, 1);
  Storage.saveCloudinaryAccounts(state.cloudinaryAccounts);

  // Reset round-robin if the pool shrank
  if (state.cloudinaryAccounts.length > 0) {
    Storage.saveRoundRobinIndex(0);
  }

  renderAccountsList();
  if (state.cloudinaryAccounts.length === 0) {
    const badge = document.getElementById('cloudinary-saved-badge');
    if (badge) badge.classList.add('hidden');
  }
  showToast(`🗑️ تم حذف حساب "${removed?.cloudName}"`, 'info');
}

/**
 * Reset the round-robin index back to the first account.
 */
function resetRoundRobin() {
  Storage.saveRoundRobinIndex(0);
  renderAccountsList();
  showToast('🔄 تم إعادة ضبط التناوب — سيبدأ من الحساب الأول', 'success');
}

/**
 * Render the list of saved Cloudinary accounts in the UI.
 * Shows usage stats, round-robin indicator, edit and delete buttons.
 */
function renderAccountsList() {
  const container = document.getElementById('accounts-list');
  if (!container) return;

  const accounts   = state.cloudinaryAccounts;
  const rrIndex    = Storage.loadRoundRobinIndex() % Math.max(accounts.length, 1);
  const usage      = Storage.loadUsage();
  const countEl    = document.getElementById('accounts-count');
  const rrStatus   = document.getElementById('rr-status');
  const rrSection  = document.getElementById('rr-section');

  if (countEl) countEl.textContent = accounts.length;

  if (accounts.length === 0) {
    container.innerHTML = `<div class="accounts-empty">لا توجد حسابات مضافة بعد. أضف حساباً من الأسفل ↓</div>`;
    if (rrSection) rrSection.classList.add('hidden');
    return;
  }

  if (rrSection) rrSection.classList.remove('hidden');
  if (rrStatus) {
    const nextAccount = accounts[rrIndex];
    rrStatus.textContent = `الحساب ${rrIndex + 1} من ${accounts.length}: ${nextAccount?.cloudName}`;
  }

  // Free tier limits: 25 GB bandwidth / month ≈ 25,000 MB
  const FREE_LIMIT_MB = 25000;

  container.innerHTML = accounts.map((acc, i) => {
    const u = usage[acc.cloudName] || { count: 0, bytes: 0 };
    const usedMB = (u.bytes / (1024 * 1024)).toFixed(1);
    const pct    = Math.min(100, (u.bytes / (FREE_LIMIT_MB * 1024 * 1024)) * 100).toFixed(1);
    const barColor = pct > 80 ? 'var(--clr-error)' : pct > 50 ? 'var(--clr-warning)' : 'var(--clr-primary)';
    const isEditing = state._editingIndex === i;

    return `
    <div class="account-card ${i === rrIndex ? 'account-card--active' : ''} ${isEditing ? 'account-card--editing' : ''}">
      <div class="account-card-info">
        <div class="account-card-name">
          ${i === rrIndex ? '🔄 ' : ''}☁️ <strong>${escapeHtml(acc.cloudName)}</strong>
          ${i === rrIndex ? '<span class="rr-badge">التالي</span>' : ''}
          ${pct > 80 ? '<span class="rr-badge" style="background:var(--clr-error);">⚠️ قارب الحد</span>' : ''}
        </div>
        <div class="account-card-method">
          ${acc.uploadPreset
            ? `Preset: <code>${escapeHtml(acc.uploadPreset)}</code>`
            : `API Key: <code>${escapeHtml(acc.apiKey?.slice(0, 8))}…</code>`}
          ${acc.customDomain ? ` · Domain: <code>${escapeHtml(acc.customDomain)}</code>` : ''}
        </div>
        <!-- Usage Bar -->
        <div class="usage-bar-wrap" title="${u.count} صورة · ${usedMB} MB من ${FREE_LIMIT_MB} MB">
          <div class="usage-bar-track">
            <div class="usage-bar-fill" style="width:${pct}%; background:${barColor};"></div>
          </div>
          <span class="usage-bar-label">${u.count} صورة · ${usedMB} MB (${pct}%)</span>
        </div>
      </div>
      <div class="account-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="window._editAccount(${i})" title="تعديل هذا الحساب">✏️</button>
        <button class="btn btn-secondary btn-sm" onclick="window._resetUsage('${escapeHtml(acc.cloudName)}')" title="إعادة ضبط عداد الاستخدام">↺</button>
        <button class="btn btn-danger btn-sm" onclick="window._removeAccount(${i})" title="حذف هذا الحساب">🗑️</button>
      </div>
    </div>
  `}).join('');
}

// Expose functions to inline onclick handlers
window._removeAccount = removeCloudinaryAccount;
window._editAccount   = editCloudinaryAccount;
window._resetUsage    = (cloudName) => {
  Storage.resetUsage(cloudName);
  renderAccountsList();
  showToast(`↺ تم إعادة ضبط عداد "${cloudName}"`, 'info');
};

// ── Edit Account ──────────────────────────────────────────────────────

/**
 * Pre-fill the add-account form with an existing account's data for editing.
 * @param {number} index
 */
function editCloudinaryAccount(index) {
  const acc = state.cloudinaryAccounts[index];
  if (!acc) return;

  state._editingIndex = index;

  // Pre-fill form
  setVal('cloud-name',    acc.cloudName    || '');
  setVal('upload-preset', acc.uploadPreset || '');
  setVal('api-key',       acc.apiKey       || '');
  setVal('api-secret',    acc.apiSecret    || '');
  setVal('custom-domain', acc.customDomain || '');

  // Update button label
  const addBtn = document.getElementById('add-account-btn');
  if (addBtn) addBtn.innerHTML = '💾 حفظ التعديلات';

  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  // Scroll form into view
  document.getElementById('cloud-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('cloud-name')?.focus();

  renderAccountsList();
  showToast(`✏️ تعديل حساب "${acc.cloudName}"`, 'info');
}

/**
 * Cancel edit mode and reset form.
 */
function cancelEditAccount() {
  state._editingIndex = -1;
  setVal('cloud-name', '');
  setVal('upload-preset', '');
  setVal('api-key', '');
  setVal('api-secret', '');
  setVal('custom-domain', '');

  const addBtn = document.getElementById('add-account-btn');
  if (addBtn) addBtn.innerHTML = '➕ إضافة الحساب';

  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (cancelBtn) cancelBtn.classList.add('hidden');

  renderAccountsList();
}

// ── Export / Import Settings JSON ─────────────────────────────────────

/**
 * Export all app settings as a downloadable JSON file.
 */
function exportSettingsJSON() {
  const data = {
    _version:           '1.0',
    _exportedAt:        new Date().toISOString(),
    _warning:           'هذا الملف يحتوي على بيانات حساسة (API Keys). لا تشاركه مع أحد أو ترفعه على الإنترنت.',
    cloudinaryAccounts: state.cloudinaryAccounts,
    layout:             state.layout,
    font:               state.font,
    batchSize:          Storage.loadBatchSize(),
    shortio:            Storage.loadShortio(),
    rrIndex:            Storage.loadRoundRobinIndex(),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `wayak-settings-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 تم تصدير الإعدادات بنجاح', 'success');
}

/**
 * Import settings from a JSON file and restore all configuration.
 * @param {Event} e - file input change event
 */
function importSettingsJSON(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);

      // Restore accounts
      if (Array.isArray(data.cloudinaryAccounts)) {
        state.cloudinaryAccounts = data.cloudinaryAccounts;
        Storage.saveCloudinaryAccounts(data.cloudinaryAccounts);
        renderAccountsList();
        if (data.cloudinaryAccounts.length > 0) {
          markStepDone(3);
          showSavedBadge('cloudinary-saved-badge');
        }
      }

      // Restore layout
      if (data.layout) {
        state.layout = data.layout;
        Storage.saveLayout(data.layout);
        populateLayoutFields(data.layout);
      }

      // Restore font
      if (data.font) {
        state.font = data.font;
        Storage.saveFont(data.font);
        populateFontFields(data.font);
      }

      // Restore batch size
      if (data.batchSize) {
        Storage.saveBatchSize(data.batchSize);
        setVal('batch-size', data.batchSize);
      }

      // Restore Short.io
      if (data.shortio?.apiKey) {
        state.shortioCreds = data.shortio;
        Storage.saveShortio(data.shortio);
        setVal('shortio-key',    data.shortio.apiKey || '');
        setVal('shortio-domain', data.shortio.domain || '');
        showSavedBadge('shortio-saved-badge');
      }

      // Restore RR index
      if (typeof data.rrIndex === 'number') {
        Storage.saveRoundRobinIndex(data.rrIndex);
      }

      showToast(`✅ تم استيراد الإعدادات بنجاح (${data.cloudinaryAccounts?.length || 0} حساب)`, 'success');
      updatePreview();
    } catch (err) {
      showToast(`❌ ملف الإعدادات غير صالح: ${err.message}`, 'error');
    }
    // Reset file input so user can import again
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ── WhatsApp Share ─────────────────────────────────────────────────────

/**
 * Open a WhatsApp share dialog after generation.
 * Builds a message template based on the first few generated cards.
 */
function openWhatsAppShare() {
  const summary = state.lastSummary;
  if (!summary || !summary.urlMap || summary.urlMap.size === 0) {
    showToast('لا توجد كروت لمشاركتها. قم بتوليد الكروت أولاً.', 'error');
    return;
  }

  const rows    = state.excelData?.rows || [];
  const colMap  = state.colMap;
  const urlMap  = summary.urlMap;

  // Show a modal-like prompt to pick how many to send as sample
  const sampleText = [...urlMap.entries()].slice(0, 5).map(([rowIdx, url]) => {
    const row  = rows[rowIdx] || {};
    const name = String(row[colMap?.nameCol] || 'العميل').trim();
    return `مرحباً ${name} 🎉\nبطاقة عضويتك في Wayak جاهزة:\n🔗 ${url}`;
  }).join('\n\n---\n\n');

  // Show modal with the message
  const modal = document.getElementById('whatsapp-modal');
  const textarea = document.getElementById('whatsapp-text');
  if (modal && textarea) {
    textarea.value = sampleText;
    modal.classList.remove('hidden');
  } else {
    // Fallback: open wa.me with first card
    const firstEntry = [...urlMap.entries()][0];
    if (firstEntry) {
      const [rowIdx, url] = firstEntry;
      const row  = rows[rowIdx] || {};
      const name = String(row[colMap?.nameCol] || 'العميل').trim();
      const msg  = encodeURIComponent(`مرحباً ${name} 🎉\nبطاقة عضويتك في Wayak جاهزة:\n🔗 ${url}`);
      window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
    }
  }
}

// ── Save Short.io Settings ────────────────────────────────────────────
function saveShortioSettings() {
  const creds = {
    apiKey: getVal('shortio-key').trim(),
    domain: getVal('shortio-domain').trim(),
  };

  if (!creds.apiKey || !creds.domain) {
    showToast('Both API Key and Domain are required for Short.io', 'error');
    return;
  }

  state.shortioCreds = creds;
  Storage.saveShortio(creds);
  showSavedBadge('shortio-saved-badge');
  showToast('Short.io settings saved ✓', 'success');
}

// ── Update Card Preview ───────────────────────────────────────────────
function updatePreview() {
  const previewCanvas      = document.getElementById('preview-canvas');
  const previewPlaceholder = document.getElementById('preview-placeholder');

  if (!state.templateImage) {
    if (previewPlaceholder) previewPlaceholder.style.display = 'block';
    if (previewCanvas)      previewCanvas.style.display      = 'none';
    return;
  }

  if (previewPlaceholder) previewPlaceholder.style.display = 'none';
  if (previewCanvas)      previewCanvas.style.display      = 'block';

  const layout = readLayoutFields();
  const font   = readFontFields();

  // Auto-save immediately to localStorage so settings are never lost
  state.layout = layout;
  state.font   = font;
  Storage.saveLayout(layout);
  Storage.saveFont(font);

  try {
    drawPreview(previewCanvas, state.templateImage, layout, font);
  } catch (err) {
    console.warn('Preview render error:', err);
  }
}

// ── Visual Drag & Drop for Canvas ─────────────────────────────────────
function initCanvasDragAndDrop() {
  const canvas = document.getElementById('preview-canvas');
  if (!canvas) return;

  let isDragging = false;
  let draggedField = null;

  const getFieldAtCoords = (x, y) => {
    if (!state.templateImage) return null;
    const layout = state.layout;
    const cw = canvas.width;
    const ch = canvas.height;
    const hitRadius = Math.max(cw, ch) * 0.1; 
    
    let closestField = null;
    let minDist = Infinity;
    
    ['name', 'memberId', 'expiry', 'phone'].forEach(field => {
      const fieldData = layout[field];
      if (!fieldData || fieldData.show === false) return;
      const fx = cw * (parseFloat(fieldData.x) / 100);
      const fy = ch * (parseFloat(fieldData.y) / 100);
      const dist = Math.hypot(fx - x, fy - y);
      if (dist < hitRadius && dist < minDist) {
        minDist = dist;
        closestField = field;
      }
    });
    return closestField;
  };

  const updateCoordsFromEvent = (e) => {
    if (!isDragging || !draggedField || !state.templateImage) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    const xPct = Math.max(0, Math.min(100, (x / canvas.width) * 100)).toFixed(1);
    const yPct = Math.max(0, Math.min(100, (y / canvas.height) * 100)).toFixed(1);
    
    const xInput = document.getElementById(`${draggedField}-x`);
    const yInput = document.getElementById(`${draggedField}-y`);
    if (xInput) xInput.value = xPct;
    if (yInput) yInput.value = yPct;
    
    updatePreview();
  };

  const handleDown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    draggedField = getFieldAtCoords(x, y);
    if (draggedField) {
      isDragging = true;
      canvas.style.cursor = 'grabbing';
      if(e.preventDefault && !e.touches) e.preventDefault();
    }
  };

  const handleMove = (e) => {
    if (isDragging) {
      if(e.cancelable) e.preventDefault();
      updateCoordsFromEvent(e);
    } else {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;
      if (clientX !== undefined) {
         const scaleX = canvas.width / rect.width;
         const scaleY = canvas.height / rect.height;
         const x = (clientX - rect.left) * scaleX;
         const y = (clientY - rect.top) * scaleY;
         canvas.style.cursor = getFieldAtCoords(x, y) ? 'grab' : 'default';
      }
    }
  };

  const handleUp = () => {
    isDragging = false;
    draggedField = null;
    canvas.style.cursor = 'default';
  };

  canvas.addEventListener('mousedown', handleDown);
  canvas.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleUp);
  
  canvas.addEventListener('touchstart', handleDown, { passive: false });
  canvas.addEventListener('touchmove', handleMove, { passive: false });
  window.addEventListener('touchend', handleUp);
}


// ── Save Layout & Font ────────────────────────────────────────────────
function saveLayoutAndFont() {
  const layout = readLayoutFields();
  const font   = readFontFields();
  state.layout = layout;
  state.font   = font;
  Storage.saveLayout(layout);
  Storage.saveFont(font);
  markStepDone(4);
  showSavedBadge('settings-saved-badge');
  showToast('Card settings saved ✓', 'success');
  updatePreview();
}

// ── Start Generation ──────────────────────────────────────────────────
async function startGeneration() {
  // ── Validation ──
  if (!state.templateImage) {
    showToast('⚠️ Please upload a template image first (Step 1)', 'error');
    shakeElement('step1-card');
    return;
  }
  if (!state.excelData?.rows?.length) {
    showToast('⚠️ Please upload an Excel file first (Step 2)', 'error');
    shakeElement('step2-card');
    return;
  }
  if (!state.cloudinaryAccounts?.length) {
    showToast('⚠️ أضف حساب Cloudinary واحداً على الأقل (الخطوة ٣)', 'error');
    shakeElement('step3-card');
    return;
  }

  if (state.isProcessing) {
    showToast('Already processing — please wait', 'info');
    return;
  }

  // Auto-save current layout/font before processing
  const layout = readLayoutFields();
  const font   = readFontFields();
  state.layout = layout;
  state.font   = font;
  Storage.saveLayout(layout);
  Storage.saveFont(font);

  // ── UI Reset ──
  state.isProcessing    = true;
  state.abortController = new AbortController();

  clearLogUI();
  logger.clear();

  const total = state.excelData.rows.length;
  updateProgress(0, total);
  updateCounter('stat-generated', 0);
  updateCounter('stat-uploaded',  0);
  updateCounter('stat-failed',    0);
  updateCounter('stat-total',     total);

  hideSection('results-section');
  showSection('progress-section');

  const genBtn    = document.getElementById('generate-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  setButtonLoading(genBtn, true, 'Generating Cards…');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  startTimer();

  const startTime = new Date();
  logger.info(`=== Generation Started at ${startTime.toLocaleString()} ===`);
  logger.info(`Total members: ${total}`);
  logger.info(`Batch size: ${Storage.loadBatchSize()}`);
  logger.info(`Cloudinary Pool: ${state.cloudinaryAccounts.length} حساب (Round-Robin)`);
  state.cloudinaryAccounts.forEach((acc, i) => {
    logger.info(`  حساب ${i + 1}: ${acc.cloudName} (${acc.uploadPreset ? 'Unsigned Preset' : 'API Key'})`);
  });
  
  if (state.shortioCreds && state.shortioCreds.apiKey && state.shortioCreds.domain) {
    logger.info(`Short.io: Active (Domain: ${state.shortioCreds.domain})`);
  } else {
    logger.info(`Short.io: Inactive`);
  }

  try {
    const batchSize = parseInt(getVal('batch-size'), 10) || 50;
    const exportMode = getVal('export-mode') || 'cloudinary';

    // ── ZIP Memory Warning ──
    if ((exportMode === 'zip' || exportMode === 'both') && total > 1000) {
      const proceed = confirm(`تحذير أمني للذاكرة:\nأنت تقوم بإنشاء أكثر من 1000 كارت (${total}) في وضع التصدير كملف ZIP.\nهذا قد يستهلك مساحة هائلة من ذاكرة المتصفح (RAM) وقد يؤدي لانهياره حسب مواصفات جهازك.\n\nنصيحة للمحترفين: للكميات الضخمة جداً، يُفضل اختيار "الرفع لـ Cloudinary فقط".\n\nهل أنت متأكد أنك تريد الاستمرار في تكوين ملف الـ ZIP؟`);
      if (!proceed) {
        state.isProcessing = false;
        clearLogUI();
        setButtonLoading(genBtn, false);
        if (cancelBtn) cancelBtn.classList.add('hidden');
        return;
      }
    }

    // ── Build CloudinaryPool with persisted round-robin index ──
    const rrStartIndex = Storage.loadRoundRobinIndex();
    const pool = new CloudinaryPool(state.cloudinaryAccounts, rrStartIndex);
    pool.onAdvance(newIndex => {
      Storage.saveRoundRobinIndex(newIndex);
    });

    const { urlMap, stats } = await processAllCards({
      template:       state.templateImage,
      rows:           state.excelData.rows,
      colMap:         state.colMap,
      layout:         state.layout,
      font:           state.font,
      cloudinaryPool: pool,
      shortioCreds:   state.shortioCreds,
      batchSize,
      exportMode,
      canvas:         workCanvas,
      signal:         state.abortController.signal,
      onProgress: (s) => {
        updateProgress(s.generated + s.failed, s.total);
        updateCounter('stat-generated', s.generated);
        updateCounter('stat-uploaded',  s.uploaded);
        updateCounter('stat-failed',    s.failed);
      },
      onLog: (level, msg, meta) => logger.log(level, msg, meta || {}),
    });

    // Update the accounts list UI to reflect new rr index after processing
    renderAccountsList();


    const elapsedMs = stopTimer();
    const endTime   = new Date();

    logger.info(`=== Generation Ended at ${endTime.toLocaleString()} ===`);
    logger.info(`Duration: ${formatElapsed(elapsedMs)}`);

    // Store output for download
    state.lastSummary = {
      urlMap,
      stats,
      startTime: startTime.toLocaleString(),
      endTime:   endTime.toLocaleString(),
      duration:  formatElapsed(elapsedMs),
    };

    // Final UI update
    updateProgress(stats.generated + stats.failed, stats.total);
    updateCounter('stat-generated', stats.generated);
    updateCounter('stat-uploaded',  stats.uploaded);
    updateCounter('stat-failed',    stats.failed);

    showResults(stats, formatElapsed(elapsedMs));
    showToast(
      stats.failed === 0
        ? `✅ All ${stats.uploaded} cards uploaded successfully!`
        : `⚠️ Done with ${stats.failed} failure(s). Check the log.`,
      stats.failed === 0 ? 'success' : 'info',
      5000
    );

  } catch (err) {
    stopTimer();
    if (err.name === 'AbortError') {
      logger.warn('Processing cancelled by user');
      showToast('Processing cancelled', 'info');
    } else {
      logger.error(`Fatal error: ${err.message}`);
      showToast(`Unexpected error: ${err.message}`, 'error');
      console.error('Generation fatal error:', err);
    }
  } finally {
    state.isProcessing = false;
    const genBtnFinal    = document.getElementById('generate-btn');
    const cancelBtnFinal = document.getElementById('cancel-btn');
    setButtonLoading(genBtnFinal, false); // restores original HTML from btn._originalHTML
    if (cancelBtnFinal) cancelBtnFinal.classList.add('hidden');
  }
}

// ── Show Results ──────────────────────────────────────────────────────
function showResults(stats, duration) {
  const section = document.getElementById('results-section');
  if (!section) return;

  const resGenEl = document.getElementById('res-generated');
  const resUpEl  = document.getElementById('res-uploaded');
  const resFlEl  = document.getElementById('res-failed');
  const resTimeEl= document.getElementById('res-time');

  if (resGenEl)  resGenEl.textContent  = stats.generated;
  if (resUpEl)   resUpEl.textContent   = stats.uploaded;
  if (resFlEl)   resFlEl.textContent   = stats.failed;
  if (resTimeEl) resTimeEl.textContent = duration;

  // Dynamically update title if there were failures
  const titleEl = section.querySelector('.results-title');
  if (titleEl) {
    titleEl.textContent = stats.failed === 0
      ? 'Completed Successfully! 🎉'
      : `Completed with ${stats.failed} error(s)`;
    titleEl.style.color = stats.failed === 0
      ? 'var(--clr-success)'
      : 'var(--clr-warning)';
  }

  showSection('results-section');
}

// ── Cancel Generation ─────────────────────────────────────────────────
function cancelGeneration() {
  if (state.abortController) {
    if (confirm('هل أنت متأكد أنك تريد إيقاف عملية التوليد؟ سيتم إيقاف العمليات القادمة وحفظ ما تم إنجازه ورفعه فقط.')) {
      state.abortController.abort();
      showToast('تم طلب الإيقاف، يرجى الانتظار…', 'info');
    }
  }
}

// ── Download Output Excel ─────────────────────────────────────────────
function downloadOutputExcel() {
  if (!state.lastSummary || !state.excelData) {
    showToast('No data to export. Run generation first.', 'error');
    return;
  }
  try {
    const { urlMap } = state.lastSummary;
    writeExcel(state.excelData.rows, state.excelData.headers, urlMap, state.colMap, 'members_output.xlsx');
    showToast('members_output.xlsx downloaded! ✓', 'success');
  } catch (err) {
    showToast(`Export failed: ${err.message}`, 'error');
    console.error('Excel export error:', err);
  }
}

// ── Download Log ──────────────────────────────────────────────────────
function downloadLog() {
  const summary = state.lastSummary
    ? {
        startTime:  state.lastSummary.startTime,
        endTime:    state.lastSummary.endTime,
        duration:   state.lastSummary.duration,
        total:      state.lastSummary.stats?.total,
        generated:  state.lastSummary.stats?.generated,
        uploaded:   state.lastSummary.stats?.uploaded,
        failed:     state.lastSummary.stats?.failed,
      }
    : {};
  logger.downloadLog(summary);
  showToast('Log file downloaded ✓', 'success');
}

// ── Shake Element (Error Feedback) ────────────────────────────────────
function shakeElement(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth; // Reflow to restart animation
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 600);
}

// ── DOM Helpers ───────────────────────────────────────────────────────
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = String(val);
}

function setChecked(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(val);
}

// ── Boot ──────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
