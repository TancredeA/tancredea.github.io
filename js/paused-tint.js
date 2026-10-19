/* Paused tint: a preview that is not playing (paused, ended or not started yet) is shown in
   the site's colours, like a black-and-white image: its tones run from the ecru background
   (lightest) through the accent green to the anthracite ink (darkest). Each colour sits at its
   own grey level, so a pixel keeps about the brightness it had: light areas stay ecru, middle
   tones turn green, only the darkest lines reach anthracite, and nothing gets darker than the
   ink. It plays in full colour again as soon as it plays. Self-contained: works on any page
   that loads this file.

     PausedTint.attach(video)        tint this video whenever it is paused; returns detach()
     PausedTint.attachAll(root)      same for every <video data-paused-tint> inside root
     PausedTint.set(canvas, paused)  tint a canvas animation while it is paused, restore it after
     PausedTint.refresh()            re-read the colours (after a theme change)

   The colours come from the CSS custom properties --bg (light end), --accent (middle) and
   --ink (dark end), read on <html>. The tint is computed pixel by pixel in a canvas rather than with a CSS
   filter: SVG filters on videos are not drawn by every browser (Safari, pages with <base>).
   A paused video gets a tinted copy of its current frame (or of its poster) laid over it;
   a paused canvas is tinted in place and its pixels are put back when it plays again. */
(function () {
  'use strict';

  const CLASS = 'pt-paused';
  let lut = null;    // 256 tones (grey level 0..255) -> [r, g, b]

  // A colour as [r, g, b] in 0..255, from a 6-digit hex or an rgb() value; null if neither.
  function parse(v) {
    const m = v.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16));
    const n = v.match(/\d+(\.\d+)?/g);
    return n && n.length >= 3 ? n.slice(0, 3).map(Number) : null;
  }
  function rgb(name, fallback) {
    return parse(getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || parse(fallback);
  }
  const grey = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  // The gradient: each colour placed at its own grey level, linear in between, flat beyond
  // the ends (below the ink's level: ink; above the background's: background).
  function colours() {
    const stops = [rgb('--ink', '#333539'), rgb('--accent', '#346560'), rgb('--bg', '#FBFAF7')]
      .map(c => [grey(c), c]).sort((a, b) => a[0] - b[0]);
    lut = new Array(256);
    for (let y = 0; y < 256; y++) {
      let j = 0;
      while (j < stops.length - 2 && y > stops[j + 1][0]) j++;
      const [y0, c0] = stops[j], [y1, c1] = stops[j + 1];
      const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
      lut[y] = [0, 1, 2].map(i => Math.round(c0[i] + t * (c1[i] - c0[i])));
    }
  }

  // Grey level of each pixel, then its colour on the gradient.
  function tint(img) {
    if (!lut) colours();
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const c = lut[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    return img;
  }

  // ------------------------------------------------------------ videos: a tinted overlay
  function overlay(v) {
    let c = v.__ptOverlay;
    if (!c) {
      c = document.createElement('canvas');
      c.className = 'pt-overlay';
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:absolute;margin:0;pointer-events:none;display:none';
      v.__ptOverlay = c;
    }
    const parent = v.parentNode;
    if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    if (c.previousSibling !== v) v.insertAdjacentElement('afterend', c);
    return c;
  }

  function poster(v) {
    if (!v.poster) return null;
    if (!v.__ptPoster || v.__ptPoster.src !== new URL(v.poster, document.baseURI).href) {
      const im = new Image();
      im.onload = () => { if (v.paused || v.ended) draw(v); };
      im.src = v.poster;
      v.__ptPoster = im;
    }
    return v.__ptPoster.complete && v.__ptPoster.naturalWidth ? v.__ptPoster : null;
  }

  function draw(v) {
    const c = overlay(v);
    const w = v.offsetWidth, h = v.offsetHeight;
    if (!w || !h) { c.style.display = 'none'; return; }
    const r = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    c.style.left = v.offsetLeft + 'px'; c.style.top = v.offsetTop + 'px';
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = getComputedStyle(v).backgroundColor;
    x.fillRect(0, 0, c.width, c.height);
    // the frame on screen: the current one once the video has data, else the poster
    const frame = v.readyState >= 2 && v.videoWidth ? [v, v.videoWidth, v.videoHeight] : null;
    const im = frame ? null : poster(v);
    const [src, sw, sh] = frame || (im ? [im, im.naturalWidth, im.naturalHeight] : []);
    if (src) {
      const fit = getComputedStyle(v).objectFit === 'cover' ? Math.max : Math.min;
      const s = fit(c.width / sw, c.height / sh), dw = sw * s, dh = sh * s;
      x.drawImage(src, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    }
    try { x.putImageData(tint(x.getImageData(0, 0, c.width, c.height)), 0, 0); }
    catch (e) { c.style.display = 'none'; return; }   // unreadable (another origin): no tint
    c.style.display = 'block';
  }

  function attach(video) {
    if (!video || video.__pausedTint) return video && video.__pausedTint;
    let timer = 0;
    const sync = () => {
      clearTimeout(timer);
      const paused = video.paused || video.ended;
      video.classList.toggle(CLASS, paused);
      if (!paused) { if (video.__ptOverlay) video.__ptOverlay.style.display = 'none'; return; }
      timer = setTimeout(() => { if (video.paused || video.ended) draw(video); });   // after layout
    };
    const events = ['play', 'playing', 'pause', 'ended', 'emptied', 'loadeddata', 'seeked'];
    events.forEach(e => video.addEventListener(e, sync));
    const ro = 'ResizeObserver' in window ? new ResizeObserver(sync) : null;
    if (ro) ro.observe(video);
    sync();
    const detach = () => {
      events.forEach(e => video.removeEventListener(e, sync));
      if (ro) ro.disconnect();
      clearTimeout(timer);
      video.classList.remove(CLASS);
      if (video.__ptOverlay) video.__ptOverlay.remove();
      delete video.__ptOverlay;
      delete video.__pausedTint;
    };
    video.__pausedTint = detach;
    return detach;
  }

  function attachAll(root) {
    (root || document).querySelectorAll('video[data-paused-tint]').forEach(attach);
  }

  // ------------------------------------------------------------ canvases: tinted in place
  function set(cv, paused) {
    if (!cv || !cv.getContext) return;
    const st = cv.__pt || (cv.__pt = { orig: null });
    if (paused && !st.orig) {
      if (!cv.width || !cv.height) return;
      const x = cv.getContext('2d');
      if (!x) return;
      try {
        st.orig = x.getImageData(0, 0, cv.width, cv.height);
        x.putImageData(tint(new ImageData(new Uint8ClampedArray(st.orig.data), cv.width, cv.height)), 0, 0);
        cv.classList.add(CLASS);
      } catch (e) { st.orig = null; }
    } else if (!paused && st.orig) {
      if (st.orig.width === cv.width && st.orig.height === cv.height) cv.getContext('2d').putImageData(st.orig, 0, 0);
      st.orig = null;
      cv.classList.remove(CLASS);
    }
  }

  function refresh() {
    colours();
    document.querySelectorAll('video.' + CLASS).forEach(draw);
    document.querySelectorAll('canvas.' + CLASS).forEach(cv => { set(cv, false); set(cv, true); });
  }

  window.PausedTint = { attach, attachAll, set, refresh };
})();
