(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Layout configuration. All coordinates are in the design space of the
  // background artwork (assets/credential-0.webp — same art as the
  // original credencial-sin-fondo.png, re-exported as webp for a much
  // smaller payload), which is a
  // brand-new single-card design (2599x1632px — no more left/right
  // bifold) re-measured pixel-by-pixel from scratch: solid photo-frame
  // edges via dark-line density scans, dotted field lines the same way,
  // and each field's horizontal placement cross-checked against the
  // placeholder mockup (credential-1.png) and the filled reference
  // (credential-2.png) supplied alongside it. Every on-screen element is
  // positioned as a fraction of this space via the CSS custom property
  // --scale, so the exported PNG (always rendered at 2599x1632) matches
  // the live preview exactly.
  // ---------------------------------------------------------------------
  const CARD_W = 2599;
  const CARD_H = 1632;

  const PHOTO = { x: 257, y: 278, w: 1040, h: 913 };

  // Matches the CSS .photo-box.has-photo transform/box-shadow (css/style.css)
  // so the exported PNG looks the same as the live preview. The CSS shadow is
  // defined in real screen pixels at the card's max display width
  // (--card-max-width), while the export always renders at the fixed design
  // resolution (CARD_W) — scale the offset/blur by that ratio so it reads the
  // same size relative to the card in both places.
  const PHOTO_ROTATION_DEG = -0.65;
  const PHOTO_SHADOW = { offsetX: 6, offsetY: 6, blur: 24, color: 'rgba(0, 0, 0, 0.62)' };
  const CARD_MAX_DISPLAY_WIDTH = 900;
  const EXPORT_SHADOW_SCALE = CARD_W / CARD_MAX_DISPLAY_WIDTH;

  // Typed text sits centered above each dotted line (not flush-left
  // after the label) — confirmed against credential-1.png's placeholder
  // mockup, where "Tu nombre"/"DD/MM/AA"/etc. all center within the
  // blank run of their line. xCenter/maxWidth span that blank run
  // (label end to line end); yBaseline sits the measured gap above the
  // dotted line itself (not merged into it, per the mockup).
  const FIELDS = {
    nombre: { xCenter: 1910, yBaseline: 510, maxWidth: 880, fontSize: 82, minFontSize: 40 },
    fecha: { xCenter: 2080, yBaseline: 616, maxWidth: 620, fontSize: 82, minFontSize: 37 },
    ciudad: { xCenter: 1890, yBaseline: 718, maxWidth: 840, fontSize: 82, minFontSize: 40 },
    prenda: { xCenter: 2055, yBaseline: 822, maxWidth: 720, fontSize: 82, minFontSize: 37 },
  };

  // The "Firma" label now sits BELOW-right of its dashed line (not to
  // the left, like the other fields), so the signature is drawn in the
  // open block above the line instead — from right under the "- Ethics"
  // credit down to the line itself, spanning the same width as the
  // other field lines.
  const SIGNATURE_BOX = { x: 1310, y: 1055, w: 1190, h: 350 };
  const SIGNATURE_SUPERSAMPLE = 3;

  // Small "clear signature" X, anchored to the signature LINE itself
  // (not the much taller canvas box) — sits just past where the dashed
  // line ends, above the "Firma" label, pixel-measured against the
  // background art (line: x 1372-2361, y 1280-1283; "Firma" label
  // starts at y 1295).
  const CLEAR_BTN = { size: 140, x: 2240, y: 1180 };

  const INK_COLOR = '#000';
  const SIGNATURE_COLOR = '#000';
  const FONT_FAMILY_CSS = "'Caveat', cursive";

  // ---------------------------------------------------------------------
  // Element references
  // ---------------------------------------------------------------------
  const wrapper = document.getElementById('card-wrapper');
  const cardBg = document.getElementById('card-bg');
  const photoBox = document.getElementById('photo-box');
  const photoInput = document.getElementById('photo-input');
  const signatureCanvas = document.getElementById('signature-canvas');
  const btnClearSignature = document.getElementById('btn-clear-signature');
  const btnDownload = document.getElementById('btn-download');
  const btnShare = document.getElementById('btn-share');
  const statusMsg = document.getElementById('status-msg');

  const fieldInputs = {};
  Object.keys(FIELDS).forEach((key) => {
    fieldInputs[key] = document.getElementById(`field-${key}`);
  });

  const state = {
    photoImage: null,
    hasSignature: false,
    bgLoaded: cardBg.complete && cardBg.naturalWidth > 0,
  };

  // ---------------------------------------------------------------------
  // Responsive scaling
  // ---------------------------------------------------------------------
  function updateScale() {
    const width = wrapper.getBoundingClientRect().width;
    if (width > 0) {
      wrapper.style.setProperty('--scale', (width / CARD_W).toFixed(6));
    }
  }

  if ('ResizeObserver' in window) {
    new ResizeObserver(updateScale).observe(wrapper);
  }
  window.addEventListener('resize', updateScale);
  window.addEventListener('orientationchange', updateScale);

  function calcPx(value) {
    return `calc(var(--scale, 1) * ${value}px)`;
  }

  // ---------------------------------------------------------------------
  // Position photo box
  // ---------------------------------------------------------------------
  photoBox.style.left = calcPx(PHOTO.x);
  photoBox.style.top = calcPx(PHOTO.y);
  photoBox.style.width = calcPx(PHOTO.w);
  photoBox.style.height = calcPx(PHOTO.h);

  photoBox.addEventListener('click', () => photoInput.click());

  // Dropzone highlight (feedback from the CMIYGL reference): the frame is
  // already drawn into the card art, so we only flag the box while a file
  // is actively being dragged over it, via .is-dragover in css/style.css.
  let dragDepth = 0;
  photoBox.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth += 1;
    photoBox.classList.add('is-dragover');
  });
  photoBox.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  photoBox.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) photoBox.classList.remove('is-dragover');
  });
  photoBox.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    photoBox.classList.remove('is-dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadPhotoFile(file);
  });

  photoInput.addEventListener('change', () => {
    const file = photoInput.files && photoInput.files[0];
    if (file) loadPhotoFile(file);
  });

  function loadPhotoFile(file) {
    if (!file.type.startsWith('image/')) {
      showStatus('Por favor seleccioná un archivo de imagen.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => openCropModal(img, url);
    img.onerror = () => {
      showStatus('No se pudo cargar la imagen.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function applyPhotoDataUrl(dataUrl) {
    const img = new Image();
    img.onload = () => {
      state.photoImage = img;
      photoBox.style.backgroundImage = `url(${dataUrl})`;
      photoBox.classList.add('has-photo');
    };
    img.src = dataUrl;
  }

  // ---------------------------------------------------------------------
  // Crop modal — pan/zoom/rotate the uploaded photo before it lands in
  // PHOTO's frame, mirroring the reference's react-easy-crop flow but
  // hand-rolled with a plain <canvas> (no extra dependency). The crop
  // canvas is drawn at the SAME aspect ratio as PHOTO, so the confirmed
  // output already matches the frame exactly — generateFinalCanvas()'s
  // drawImageCover() then just draws it 1:1, no further cropping.
  // ---------------------------------------------------------------------
  const cropModal = document.getElementById('crop-modal');
  const cropModalBackdrop = document.getElementById('crop-modal-backdrop');
  const cropModalClose = document.getElementById('crop-modal-close');
  const cropCanvas = document.getElementById('crop-canvas');
  const cropZoomInput = document.getElementById('crop-zoom');
  const cropRotateLeftBtn = document.getElementById('crop-rotate-left');
  const cropRotateRightBtn = document.getElementById('crop-rotate-right');
  const cropResetBtn = document.getElementById('crop-reset');
  const cropConfirmBtn = document.getElementById('crop-confirm');

  const CROP_ASPECT = PHOTO.w / PHOTO.h;
  const CROP_CANVAS_W = 340;
  const CROP_CANVAS_H = Math.round(CROP_CANVAS_W / CROP_ASPECT);
  cropCanvas.width = CROP_CANVAS_W;
  cropCanvas.height = CROP_CANVAS_H;
  const cropCtx = cropCanvas.getContext('2d');

  const cropState = {
    img: null,
    objectUrl: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    dragging: false,
    dragStart: null,
  };

  function cropEffectiveSize() {
    const swapped = cropState.rotation % 180 !== 0;
    const img = cropState.img;
    return {
      w: swapped ? img.height : img.width,
      h: swapped ? img.width : img.height,
    };
  }

  function cropBaseScale(boxW, boxH) {
    const { w, h } = cropEffectiveSize();
    return Math.max(boxW / w, boxH / h);
  }

  function cropClampPan() {
    const { w, h } = cropEffectiveSize();
    const scale = cropBaseScale(CROP_CANVAS_W, CROP_CANVAS_H) * cropState.zoom;
    const maxPanX = Math.max(0, (w * scale - CROP_CANVAS_W) / 2);
    const maxPanY = Math.max(0, (h * scale - CROP_CANVAS_H) / 2);
    cropState.panX = Math.min(maxPanX, Math.max(-maxPanX, cropState.panX));
    cropState.panY = Math.min(maxPanY, Math.max(-maxPanY, cropState.panY));
  }

  function drawCrop(ctx, boxW, boxH, panX, panY) {
    const img = cropState.img;
    const scale = cropBaseScale(boxW, boxH) * cropState.zoom;
    ctx.clearRect(0, 0, boxW, boxH);
    ctx.save();
    ctx.translate(boxW / 2 + panX, boxH / 2 + panY);
    ctx.rotate((cropState.rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  function renderCropPreview() {
    cropClampPan();
    drawCrop(cropCtx, CROP_CANVAS_W, CROP_CANVAS_H, cropState.panX, cropState.panY);
  }

  function openCropModal(img, objectUrl) {
    if (cropState.objectUrl) URL.revokeObjectURL(cropState.objectUrl);
    cropState.img = img;
    cropState.objectUrl = objectUrl || null;
    cropState.zoom = 1;
    cropState.panX = 0;
    cropState.panY = 0;
    cropState.rotation = 0;
    cropZoomInput.value = '1';
    cropModal.hidden = false;
    renderCropPreview();
  }

  function closeCropModal() {
    cropModal.hidden = true;
    if (cropState.objectUrl) URL.revokeObjectURL(cropState.objectUrl);
    cropState.img = null;
    cropState.objectUrl = null;
    photoInput.value = '';
  }

  cropModalClose.addEventListener('click', closeCropModal);
  cropModalBackdrop.addEventListener('click', closeCropModal);

  cropCanvas.addEventListener('pointerdown', (e) => {
    cropState.dragging = true;
    cropState.dragStart = { x: e.clientX, y: e.clientY, panX: cropState.panX, panY: cropState.panY };
    cropCanvas.setPointerCapture(e.pointerId);
  });
  cropCanvas.addEventListener('pointermove', (e) => {
    if (!cropState.dragging) return;
    const rect = cropCanvas.getBoundingClientRect();
    const scaleX = CROP_CANVAS_W / rect.width;
    const scaleY = CROP_CANVAS_H / rect.height;
    cropState.panX = cropState.dragStart.panX + (e.clientX - cropState.dragStart.x) * scaleX;
    cropState.panY = cropState.dragStart.panY + (e.clientY - cropState.dragStart.y) * scaleY;
    renderCropPreview();
  });
  function stopCropDrag() {
    cropState.dragging = false;
  }
  cropCanvas.addEventListener('pointerup', stopCropDrag);
  cropCanvas.addEventListener('pointercancel', stopCropDrag);
  cropCanvas.addEventListener('pointerleave', stopCropDrag);

  cropZoomInput.addEventListener('input', () => {
    cropState.zoom = parseFloat(cropZoomInput.value) || 1;
    renderCropPreview();
  });

  function rotateCrop(deltaDeg) {
    cropState.rotation = (cropState.rotation + deltaDeg + 360) % 360;
    cropState.panX = 0;
    cropState.panY = 0;
    renderCropPreview();
  }
  cropRotateLeftBtn.addEventListener('click', () => rotateCrop(-90));
  cropRotateRightBtn.addEventListener('click', () => rotateCrop(90));

  cropResetBtn.addEventListener('click', () => {
    cropState.zoom = 1;
    cropState.panX = 0;
    cropState.panY = 0;
    cropState.rotation = 0;
    cropZoomInput.value = '1';
    renderCropPreview();
  });

  cropConfirmBtn.addEventListener('click', () => {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = PHOTO.w;
    outCanvas.height = PHOTO.h;
    const outCtx = outCanvas.getContext('2d');
    const scaleRatio = PHOTO.w / CROP_CANVAS_W;
    drawCrop(outCtx, PHOTO.w, PHOTO.h, cropState.panX * scaleRatio, cropState.panY * scaleRatio);
    applyPhotoDataUrl(outCanvas.toDataURL('image/png'));
    closeCropModal();
  });

  // ---------------------------------------------------------------------
  // Position + fit text fields
  // ---------------------------------------------------------------------
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');

  // Caveat loads async via the Google Fonts <link>; until it's ready,
  // measureText()/fillText() silently fall back to the browser's
  // default cursive font, throwing off both the auto-shrink math and
  // the exported PNG. Kick the load off immediately and re-run the fit
  // for whatever the user already typed once it lands.
  const fontReady = document.fonts
    ? document.fonts.load(`22px ${FONT_FAMILY_CSS}`).catch(() => {})
    : Promise.resolve();

  function fitFontSize(text, cfg) {
    if (!text) return cfg.fontSize;
    let size = cfg.fontSize;
    measureCtx.font = `${size}px ${FONT_FAMILY_CSS}`;
    while (size > cfg.minFontSize && measureCtx.measureText(text).width > cfg.maxWidth) {
      size -= 1;
      measureCtx.font = `${size}px ${FONT_FAMILY_CSS}`;
    }
    return size;
  }

  function formatFechaValue(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  }

  // top/height/line-height depend on the CURRENT font size, not the
  // field's base size — recomputed on every keystroke below, otherwise
  // the text visually drifts off the baseline as it auto-shrinks to
  // fit (each field shrinks by a different amount, so they used to end
  // up unevenly aligned against their dotted lines).
  function applyFieldGeometry(input, cfg, fontPx) {
    const boxHeight = fontPx * 1.15;
    const boxTop = cfg.yBaseline - fontPx * 0.82;
    input.style.top = calcPx(boxTop);
    input.style.height = calcPx(boxHeight);
    input.style.lineHeight = calcPx(boxHeight);
    input.style.fontSize = calcPx(fontPx);
  }

  Object.entries(FIELDS).forEach(([key, cfg]) => {
    const input = fieldInputs[key];

    // Box spans the full line width, centered on xCenter; text-align:
    // center (css/style.css) keeps the typed value centered inside it,
    // matching the centered ctx.fillText() in the exported PNG.
    input.style.left = calcPx(cfg.xCenter - cfg.maxWidth / 2);
    input.style.width = calcPx(cfg.maxWidth);
    applyFieldGeometry(input, cfg, cfg.fontSize);

    input.addEventListener('input', () => {
      if (key === 'fecha') {
        input.value = formatFechaValue(input.value);
      }
      const size = fitFontSize(input.value, cfg);
      applyFieldGeometry(input, cfg, size);
    });

    fontReady.then(() => {
      const size = fitFontSize(input.value, cfg);
      applyFieldGeometry(input, cfg, size);
    });
  });

  // ---------------------------------------------------------------------
  // Signature canvas
  // ---------------------------------------------------------------------
  signatureCanvas.width = SIGNATURE_BOX.w * SIGNATURE_SUPERSAMPLE;
  signatureCanvas.height = SIGNATURE_BOX.h * SIGNATURE_SUPERSAMPLE;
  signatureCanvas.style.left = calcPx(SIGNATURE_BOX.x);
  signatureCanvas.style.top = calcPx(SIGNATURE_BOX.y);
  signatureCanvas.style.width = calcPx(SIGNATURE_BOX.w);
  signatureCanvas.style.height = calcPx(SIGNATURE_BOX.h);

  btnClearSignature.style.left = calcPx(CLEAR_BTN.x);
  btnClearSignature.style.top = calcPx(CLEAR_BTN.y);
  btnClearSignature.style.width = calcPx(CLEAR_BTN.size);
  btnClearSignature.style.height = calcPx(CLEAR_BTN.size);
  btnClearSignature.style.fontSize = calcPx(80);

  const sigCtx = signatureCanvas.getContext('2d');
  sigCtx.strokeStyle = SIGNATURE_COLOR;
  sigCtx.lineWidth = 12;
  sigCtx.lineJoin = 'round';
  sigCtx.lineCap = 'round';

  let drawing = false;

  function getSignaturePos(e) {
    const rect = signatureCanvas.getBoundingClientRect();
    const scaleX = signatureCanvas.width / rect.width;
    const scaleY = signatureCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  signatureCanvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    state.hasSignature = true;
    btnClearSignature.hidden = false;
    signatureCanvas.setPointerCapture(e.pointerId);
    const pos = getSignaturePos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(pos.x, pos.y);
  });

  signatureCanvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const pos = getSignaturePos(e);
    sigCtx.lineTo(pos.x, pos.y);
    sigCtx.stroke();
  });

  function stopDrawing() {
    drawing = false;
  }
  signatureCanvas.addEventListener('pointerup', stopDrawing);
  signatureCanvas.addEventListener('pointercancel', stopDrawing);
  signatureCanvas.addEventListener('pointerleave', stopDrawing);

  function clearSignature() {
    sigCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    state.hasSignature = false;
    btnClearSignature.hidden = true;
  }

  btnClearSignature.addEventListener('click', clearSignature);

  // ---------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------
  function drawImageCover(ctx, img, dx, dy, dw, dh) {
    const imgRatio = img.width / img.height;
    const boxRatio = dw / dh;
    let sx, sy, sw, sh;
    if (imgRatio > boxRatio) {
      sh = img.height;
      sw = sh * boxRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / boxRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function waitForBgLoaded() {
    if (state.bgLoaded) return Promise.resolve();
    return new Promise((resolve) => {
      cardBg.addEventListener('load', () => {
        state.bgLoaded = true;
        resolve();
      }, { once: true });
    });
  }

  async function generateFinalCanvas() {
    await waitForBgLoaded();
    await fontReady;

    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(cardBg, 0, 0, CARD_W, CARD_H);

    if (state.photoImage) {
      const cx = PHOTO.x + PHOTO.w / 2;
      const cy = PHOTO.y + PHOTO.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((PHOTO_ROTATION_DEG * Math.PI) / 180);
      ctx.shadowOffsetX = PHOTO_SHADOW.offsetX * EXPORT_SHADOW_SCALE;
      ctx.shadowOffsetY = PHOTO_SHADOW.offsetY * EXPORT_SHADOW_SCALE;
      ctx.shadowBlur = PHOTO_SHADOW.blur * EXPORT_SHADOW_SCALE;
      ctx.shadowColor = PHOTO_SHADOW.color;
      drawImageCover(ctx, state.photoImage, -PHOTO.w / 2, -PHOTO.h / 2, PHOTO.w, PHOTO.h);
      ctx.restore();
    }

    ctx.fillStyle = INK_COLOR;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';

    Object.entries(FIELDS).forEach(([key, cfg]) => {
      const text = fieldInputs[key].value.trim();
      if (!text) return;
      const fontPx = fitFontSize(text, cfg);
      ctx.font = `${fontPx}px ${FONT_FAMILY_CSS}`;
      ctx.fillText(text, cfg.xCenter, cfg.yBaseline);
    });

    if (state.hasSignature) {
      ctx.drawImage(
        signatureCanvas,
        0, 0, signatureCanvas.width, signatureCanvas.height,
        SIGNATURE_BOX.x, SIGNATURE_BOX.y, SIGNATURE_BOX.w, SIGNATURE_BOX.h
      );
    }

    return canvas;
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  let statusTimeout = null;
  function showStatus(message) {
    statusMsg.textContent = message;
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      statusMsg.textContent = '';
    }, 4000);
  }

  btnDownload.addEventListener('click', async () => {
    btnDownload.disabled = true;
    try {
      const canvas = await generateFinalCanvas();
      canvas.toBlob((blob) => {
        if (!blob) {
          showStatus('No se pudo generar la imagen.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const nameSlug = slugify(fieldInputs.nombre.value.trim()) || 'celestita-house';
        const a = document.createElement('a');
        a.href = url;
        a.download = `credencial-${nameSlug}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    } catch (err) {
      showStatus('Ocurrió un error al generar la credencial.');
    } finally {
      btnDownload.disabled = false;
    }
  });

  btnShare.addEventListener('click', async () => {
    btnShare.disabled = true;
    try {
      const canvas = await generateFinalCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) {
          showStatus('No se pudo generar la imagen.');
          return;
        }
        const file = new File([blob], 'credencial-celestita-house.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Mi credencial Celestita House',
            });
          } catch (err) {
            if (err.name !== 'AbortError') {
              showStatus('No se pudo compartir la credencial.');
            }
          }
        } else {
          showStatus('Tu navegador no soporta compartir archivos. Descargá la imagen para compartirla manualmente.');
        }
      }, 'image/png');
    } finally {
      btnShare.disabled = false;
    }
  });

  // ---------------------------------------------------------------------
  // Privacy toast
  // ---------------------------------------------------------------------
  const privacyToast = document.getElementById('privacy-toast');
  const privacyToastClose = document.getElementById('privacy-toast-close');
  const PRIVACY_TOAST_AUTO_HIDE_MS = 7000;

  if (privacyToast) {
    let autoHideTimer = setTimeout(() => {
      privacyToast.classList.remove('is-visible');
    }, PRIVACY_TOAST_AUTO_HIDE_MS);

    requestAnimationFrame(() => privacyToast.classList.add('is-visible'));

    privacyToastClose.addEventListener('click', () => {
      clearTimeout(autoHideTimer);
      privacyToast.classList.remove('is-visible');
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  updateScale();
  if (!state.bgLoaded) {
    cardBg.addEventListener('load', () => {
      state.bgLoaded = true;
      updateScale();
    }, { once: true });
  }
})();
