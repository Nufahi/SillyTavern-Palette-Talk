/* ============================================================
 * Palette Talk — eyedropper helper.
 *
 * Provides a "pick a colour from the screen / avatar" tool with two
 * strategies:
 *   1. The native EyeDropper API (Chromium-based browsers) — lets the user
 *      sample ANY pixel on screen, including a character avatar.
 *   2. A fallback "click on avatar" mode for browsers without EyeDropper:
 *      we overlay a sampling cursor on avatar images and read the pixel
 *      colour from a canvas when the user clicks.
 * ============================================================ */

/**
 * Whether the native EyeDropper API is available in this browser.
 * @returns {boolean}
 */
export function isNativeEyeDropperSupported() {
  return typeof window !== "undefined" && "EyeDropper" in window;
}

/**
 * Opens the native EyeDropper and resolves with the chosen hex colour, or
 * null if the user cancelled (or the API is unavailable).
 *
 * @returns {Promise<string?>} A '#rrggbb' hex string, or null.
 */
export async function pickWithNativeEyeDropper() {
  if (!isNativeEyeDropperSupported()) return null;
  try {
    // @ts-ignore - EyeDropper is not in older lib.dom typings.
    const dropper = new EyeDropper();
    const result = await dropper.open();
    return result?.sRGBHex ?? null;
  } catch (_) {
    // User pressed Escape / dismissed — treat as cancel.
    return null;
  }
}

/**
 * Reads the average colour of a small region around the given point of an
 * image, returning a '#rrggbb' hex string. Sampling a 3x3 block (instead of a
 * single pixel) avoids picking up stray anti-aliasing artefacts.
 *
 * @param {HTMLImageElement} img A fully-loaded, same-origin image.
 * @param {number} normX Horizontal position in [0,1] of the click within the image.
 * @param {number} normY Vertical position in [0,1].
 * @returns {string?} Hex colour, or null on failure (e.g. tainted canvas).
 */
export function samplePixelFromImage(img, normX, normY) {
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);

    const px = Math.min(w - 1, Math.max(0, Math.round(normX * w)));
    const py = Math.min(h - 1, Math.max(0, Math.round(normY * h)));

    const sx = Math.max(0, px - 1);
    const sy = Math.max(0, py - 1);
    const sw = Math.min(3, w - sx);
    const sh = Math.min(3, h - sy);
    const data = ctx.getImageData(sx, sy, sw, sh).data;

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Skip (mostly) transparent pixels so we don't average in the background.
      if (data[i + 3] < 16) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count === 0) return null;

    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);

    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch (err) {
    console.warn("[Palette Talk] Pixel sampling failed (canvas may be tainted):", err);
    return null;
  }
}

/**
 * Fallback eyedropper: lets the user click on any visible avatar image to
 * sample its colour. Highlights eligible avatars while active and resolves
 * with the chosen hex (or null if the user pressed Escape / clicked elsewhere).
 *
 * @returns {Promise<string?>}
 */
export function pickFromAvatarByClick() {
  return new Promise((resolve) => {
    document.body.classList.add("sdc-eyedropper-active");

    /** @param {string?} value */
    function finish(value) {
      document.body.classList.remove("sdc-eyedropper-active");
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    }

    /** @param {MouseEvent} e */
    function onClick(e) {
      const target = /** @type {HTMLElement} */ (e.target);
      // Only sample from actual <img> elements (avatars, message thumbnails).
      const img =
        target instanceof HTMLImageElement
          ? target
          : /** @type {HTMLImageElement?} */ (target.querySelector?.("img"));
      if (!(img instanceof HTMLImageElement)) {
        // Clicked something that isn't an image — cancel.
        e.preventDefault();
        e.stopPropagation();
        finish(null);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const rect = img.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;
      const hex = samplePixelFromImage(img, normX, normY);
      finish(hex);
    }

    /** @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    }

    // Capture phase so we intercept the click before ST's own handlers.
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  });
}

/**
 * Unified entry point: uses the native EyeDropper when available, otherwise
 * falls back to click-on-avatar sampling.
 *
 * @returns {Promise<string?>} Chosen hex colour, or null if cancelled.
 */
export async function pickColor() {
  if (isNativeEyeDropperSupported()) {
    return pickWithNativeEyeDropper();
  }
  return pickFromAvatarByClick();
}
