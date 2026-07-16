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
    y:     200,
    align: 'center',  // 'left' | 'center' | 'right'
  },
  memberId: {
    x:     50,
    y:     250,
    align: 'center',
  },
  expiry: {
    x:     50,
    y:     300,
    align: 'center',
  },
};

/**
 * Default font configuration
 */
export const DEFAULT_FONT = {
  family:    'Arial',
  size:      28,
  color:     '#ffffff',
  bold:      true,
  shadow:    true,
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
  const weight   = font.bold ? 'bold ' : '';
  const fontSize = Math.max(8, parseInt(font.size, 10));
  ctx.font       = `${weight}${fontSize}px ${font.family}, Cairo, Arial, sans-serif`;
  ctx.fillStyle  = font.color || '#ffffff';

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

  // Helper to resolve X based on alignment
  const resolveX = (fieldLayout) => {
    const align = fieldLayout.align || 'left';
    if (align === 'center') return canvas.width / 2;
    if (align === 'right')  return canvas.width - (fieldLayout.x || 0);
    return fieldLayout.x || 0;
  };

  const resolveAlign = (fieldLayout) => {
    return fieldLayout.align || 'left';
  };

  // Draw Name
  if (layout.name && member.name) {
    ctx.textAlign    = resolveAlign(layout.name);
    ctx.textBaseline = 'middle';
    ctx.fillText(String(member.name), resolveX(layout.name), layout.name.y || 200);
  }

  // Draw Member ID
  if (layout.memberId && member.memberId) {
    ctx.textAlign    = resolveAlign(layout.memberId);
    ctx.textBaseline = 'middle';
    ctx.fillText(String(member.memberId), resolveX(layout.memberId), layout.memberId.y || 250);
  }

  // Draw Expiry
  if (layout.expiry && member.expiry) {
    ctx.textAlign    = resolveAlign(layout.expiry);
    ctx.textBaseline = 'middle';
    ctx.fillText(String(member.expiry), resolveX(layout.expiry), layout.expiry.y || 300);
  }

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
    name:     'Ahmed Mohamed',
    memberId: 'MEM-000001',
    expiry:   '31/12/2025',
  }, layout, font);
}
