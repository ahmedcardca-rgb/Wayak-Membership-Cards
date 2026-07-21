/**
 * canvas.js — Card drawing engine using HTML Canvas
 * Draws template image + member data onto a canvas element.
 * Optimized for batch processing & memory efficiency.
 */

/**
 * Default layout configuration (used if none saved)
 */
export const DEFAULT_LAYOUT = {
  name: {
    x:     50,
    y:     40,
    size:  45,
    align: 'center',
    show:  true,
  },
  memberId: {
    x:     50,
    y:     55,
    size:  30,
    align: 'center',
    show:  true,
  },
  expiry: {
    x:     50,
    y:     65,
    size:  30,
    align: 'center',
    show:  true,
  },
  phone: {
    x:     50,
    y:     75,
    size:  30,
    align: 'center',
    show:  true,
  },
};

/**
 * Default font configuration
 */
export const DEFAULT_FONT = {
  family:    'Cairo',
  size:      28,
  color:     '#000000',
  bold:      true,
  shadow:    false,
  shadowColor: 'rgba(0,0,0,0.6)',
  shadowBlur:  4,
  shadowOffX:  2,
  shadowOffY:  2,
};

/**
 * Load an image from a File object into an HTMLImageElement.
 * @param {File|string} fileOrUrl - File object or data URL
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(fileOrUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load template image'));

    if (typeof fileOrUrl === 'string') {
      img.src = fileOrUrl;
    } else {
      const url = URL.createObjectURL(fileOrUrl);
      img.src   = url;
      // We let the caller revoke after use
      img._blobUrl = url;
    }
  });
}

/**
 * Revoke a blob URL that was created for an image
 * @param {HTMLImageElement} img
 */
export function revokeImageUrl(img) {
  if (img && img._blobUrl) {
    URL.revokeObjectURL(img._blobUrl);
    img._blobUrl = null;
  }
}

/**
 * Draw a single membership card onto a canvas element.
 *
 * @param {HTMLCanvasElement} canvas    - The canvas to draw on
 * @param {HTMLImageElement}  template  - Pre-loaded template image
 * @param {Object}            member    - { name, memberId, expiry }
 * @param {Object}            layout    - Field positions & alignment
 * @param {Object}            font      - Font settings
 */
export function drawCard(canvas, template, member, layout, font) {
  // Match canvas size to template
  canvas.width  = template.naturalWidth  || template.width;
  canvas.height = template.naturalHeight || template.height;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw template
  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);

  // Font settings
  const weight   = font.bold ? '900 ' : '';
  const globalSize = Math.max(8, parseInt(font.size, 10) || 28);
  ctx.fillStyle  = font.color || '#000000';

  // Shadow
  if (font.shadow) {
    ctx.shadowColor   = font.shadowColor  || 'rgba(0,0,0,0.6)';
    ctx.shadowBlur    = font.shadowBlur   || 4;
    ctx.shadowOffsetX = font.shadowOffX   || 2;
    ctx.shadowOffsetY = font.shadowOffY   || 2;
  } else {
    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  const drawField = (text, fieldLayout) => {
    if (!text || !fieldLayout) return;
    if (fieldLayout.show === false) return; // Skip drawing if hidden

    const xPct = parseFloat(fieldLayout.x) || 50;
    const yPct = parseFloat(fieldLayout.y) || 50;
    let size = parseFloat(fieldLayout.size) || globalSize;

    const x = canvas.width * (xPct / 100);
    const y = canvas.height * (yPct / 100);

    // Auto-Fit Logic (Smart Scaling)
    const MAX_WIDTH = canvas.width * 0.90; // Max 90% of card width
    ctx.font = `${weight}${size}px ${font.family}, 'Cairo', sans-serif`;
    
    let textWidth = ctx.measureText(String(text)).width;
    while (textWidth > MAX_WIDTH && size > 10) {
      size -= 1;
      ctx.font = `${weight}${size}px ${font.family}, 'Cairo', sans-serif`;
      textWidth = ctx.measureText(String(text)).width;
    }

    ctx.textAlign = fieldLayout.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text), x, y);
  };

  drawField(member.name, layout.name);
  drawField(member.memberId, layout.memberId);
  drawField(member.expiry, layout.expiry);
  drawField(member.phone, layout.phone);

  // Reset shadow to avoid affecting other draws
  ctx.shadowColor   = 'transparent';
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Export canvas to a Blob (JPEG)
 * @param {HTMLCanvasElement} canvas
 * @param {number=} quality - 0 to 1, default 0.92
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Generate a preview of the card on a given canvas element.
 * Used for the settings preview panel.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement}  template
 * @param {Object}            layout
 * @param {Object}            font
 */
export function drawPreview(canvas, template, layout, font) {
  drawCard(canvas, template, {
    name:     'أحمد محمد',
    memberId: 'MEM-000001',
    expiry:   '31/12/2025',
    phone:    '01012345678',
  }, layout, font);
}
