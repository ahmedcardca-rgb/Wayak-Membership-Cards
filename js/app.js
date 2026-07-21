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
import {
  showToast, updateProgress, updateCounter, startTimer, stopTimer,
  formatElapsed, appendLogEntry, clearLogUI, showSection, hideSection,
  markStepDone, setButtonLoading, escapeHtml,
} from './ui.js';

// ── App State ─────────────────────────────────────────────────────────
const state = {
  templateFile:    null,
  templateImage:   null,
  excelFile:       null,
  excelData:       null,       // { headers, rows }
  colMap:          null,       // { nameCol, memberCol, expiryCol }
  cloudinaryCreds: null,
  layout:          null,
  font:            null,
  isProcessing:    false,
  abortController: null,
  lastSummary:     null,
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
  // Cloudinary
  const savedCreds = Storage.loadCloudinary();
  if (savedCreds) {
    state.cloudinaryCreds = savedCreds;
    setVal('cloud-name',     savedCreds.cloudName    || '');
    setVal('upload-preset',  savedCreds.uploadPreset || '');
    setVal('api-key',        savedCreds.apiKey       || '');
    setVal('api-secret',     savedCreds.apiSecret    || '');
    setVal('custom-domain',  savedCreds.customDomain || '');
    showSavedBadge('cloudinary-saved-badge');
  }

  // Layout
  const savedLayout = Storage.loadLayout();
  state.layout = savedLayout ? savedLayout : structuredClone(DEFAULT_LAYOUT);
  populateLayoutFields(state.layout);

  // Font
  const savedFont = Storage.loadFont();
  state.font = savedFont ? savedFont : structuredClone(DEFAULT_FONT);
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
      x:     parseFloat(getVal('name-x'))   || 50,
      y:     parseFloat(getVal('name-y'))   || 40,
      size:  parseFloat(getVal('name-size'))|| 45,
      align: getVal('name-align') || 'center',
      show:  document.getElementById('name-show')?.checked !== false,
    },
    memberId: {
      x:     parseFloat(getVal('member-x')) || 50,
      y:     parseFloat(getVal('member-y')) || 55,
      size:  parseFloat(getVal('member-size'))|| 30,
      align: getVal('member-align') || 'center',
      show:  document.getElementById('member-show')?.checked !== false,
    },
    expiry: {
      x:     parseFloat(getVal('expiry-x')) || 50,
      y:     parseFloat(getVal('expiry-y')) || 65,
      size:  parseFloat(getVal('expiry-size'))|| 30,
      align: getVal('expiry-align') || 'center',
      show:  document.getElementById('expiry-show')?.checked !== false,
    },
    phone: {
      x:     parseFloat(getVal('phone-x'))  || 50,
      y:     parseFloat(getVal('phone-y'))  || 75,
      size:  parseFloat(getVal('phone-size'))|| 30,
      align: getVal('phone-align') || 'center',
      show:  document.getElementById('phone-show')?.checked !== false,
    },
  };
}

// ── Font Field Sync ───────────────────────────────────────────────────
function populateFontFields(font) {
  setVal('font-family', font.family || 'Cairo');
  setVal('font-size',   font.size   || 28);
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
    family:      getVal('font-family') || 'Arial',
    size:        parseInt(getVal('font-size'), 10) || 28,
    color:       getVal('font-color') || '#ffffff',
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

  // ── Step 3: Cloudinary Save ──
  document.getElementById('save-cloudinary')?.addEventListener('click', saveCloudinarySettings);

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
});

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

    // Auto-set default Y coordinates based on image height
    const h = state.templateImage.naturalHeight;
    if (h > 0) {
      setVal('name-y',   Math.round(h * 0.55));
      setVal('member-y', Math.round(h * 0.65));
      setVal('expiry-y', Math.round(h * 0.75));
    }

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

// ── Save Cloudinary Settings ──────────────────────────────────────────
function saveCloudinarySettings() {
  const creds = {
    cloudName:    getVal('cloud-name').trim(),
    uploadPreset: getVal('upload-preset').trim(),
    apiKey:       getVal('api-key').trim(),
    apiSecret:    getVal('api-secret').trim(),
    customDomain: getVal('custom-domain').trim(),
  };

  if (!creds.cloudName) {
    showToast('Cloud Name is required', 'error');
    return;
  }

  if (!creds.uploadPreset && (!creds.apiKey || !creds.apiSecret)) {
    showToast('Provide either Upload Preset (unsigned) or API Key + Secret (signed)', 'error');
    return;
  }

  state.cloudinaryCreds = creds;
  Storage.saveCloudinary(creds);
  markStepDone(3);
  showSavedBadge('cloudinary-saved-badge');
  showToast('Cloudinary settings saved ✓', 'success');
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
  if (!state.cloudinaryCreds?.cloudName) {
    showToast('⚠️ Please save Cloudinary settings first (Step 3)', 'error');
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
  logger.info(`Cloudinary: ${state.cloudinaryCreds.cloudName} / cards/<Member_ID>`);
  
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

    const { urlMap, stats } = await processAllCards({
      template:        state.templateImage,
      rows:            state.excelData.rows,
      colMap:          state.colMap,
      layout:          state.layout,
      font:            state.font,
      cloudinaryCreds: state.cloudinaryCreds,
      shortioCreds:    state.shortioCreds,
      batchSize,
      exportMode,
      canvas:          workCanvas,
      signal:          state.abortController.signal,
      onProgress: (s) => {
        updateProgress(s.generated + s.failed, s.total);
        updateCounter('stat-generated', s.generated);
        updateCounter('stat-uploaded',  s.uploaded);
        updateCounter('stat-failed',    s.failed);
      },
      onLog: (level, msg, meta) => logger.log(level, msg, meta || {}),
    });

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
    setButtonLoading(genBtnFinal, false);
    if (genBtnFinal) genBtnFinal.innerHTML = '🚀 Generate Cards';
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
document.addEventListener('DOMContentLoaded', init);
