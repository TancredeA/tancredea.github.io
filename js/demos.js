/* Live demos. Each demo exposes:
     preview(canvas) -> step()   a self-running thumbnail, one frame per call
     mount(element, opts)        the full interactive version on the project page
   Colors are read from the CSS tokens so the demos follow the site palette. */
(function () {
  'use strict';

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const theme = () => {
    const s = getComputedStyle(document.documentElement);
    const v = n => s.getPropertyValue(n).trim();
    return { bg: v('--bg'), ink: v('--ink'), muted: v('--muted'), accent: v('--accent'), line: v('--line') };
  };
  const rgb = hex => { const m = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(m.substr(i, 2), 16)); };

  function prep(cv) {
    const w = Math.max(1, cv.clientWidth), hh = Math.max(1, cv.clientHeight);
    cv.width = Math.round(w * DPR); cv.height = Math.round(hh * DPR);
    const x = cv.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [x, w, hh];
  }
  const html = (tag, cls, inner) => { const e = document.createElement(tag); if (cls) e.className = cls; if (inner !== undefined) e.innerHTML = inner; return e; };

  // ======================================================================
  // PIPELINE_3D: the full demo lives in demo/. Previews use a recorded run (a video
  // set in site.json); the live version is mounted on the project's simulation page.
  // ======================================================================
  const path = {
    // The full version is the standalone demo in demo/, embedded in an iframe. It posts its
    // height, so the frame fits its content at any width; the page grid is relaid out after.
    mount(root, opts) {
      const f = document.createElement('iframe');
      // opens on the map of the recorded run (opts.seed); "new start" then draws random maps
      f.src = 'demo/?theme=light' + (opts && opts.seed ? '&seed=' + encodeURIComponent(opts.seed) : '');
      f.title = 'Blast-aware route planning, interactive demo';
      f.style.cssText = 'display:block;width:100%;height:960px;border:0';
      root.append(f);
      const onMessage = e => {
        if (!f.isConnected) { removeEventListener('message', onMessage); return; }
        if (e.source !== f.contentWindow || !e.data || e.data.type !== 'blast-demo:height') return;
        f.style.height = e.data.height + 'px';
        if (opts && opts.onResize) opts.onResize();
      };
      addEventListener('message', onMessage);
    }
  };

  // ======================================================================
  // Media tool: before/after comparison of image filters
  // ======================================================================
  function sampleScene(cv, w, hh, t) {
    cv.width = w; cv.height = hh;
    const x = cv.getContext('2d');
    x.fillStyle = t.bg; x.fillRect(0, 0, w, hh);
    x.fillStyle = t.accent; x.beginPath(); x.arc(w * 0.72, hh * 0.3, Math.min(w, hh) * 0.16, 0, 7); x.fill();
    const hills = [[0.62, 0.35], [0.74, 0.6], [0.86, 0.9]];
    hills.forEach(([y, a], k) => {
      x.fillStyle = t.ink; x.globalAlpha = a; x.beginPath(); x.moveTo(0, hh);
      for (let i = 0; i <= 40; i++) x.lineTo(i / 40 * w, hh * y + Math.sin(i * 0.5 + k * 2) * hh * 0.05 + Math.sin(i * 0.17 + k) * hh * 0.04);
      x.lineTo(w, hh); x.fill();
    });
    x.globalAlpha = 1;
    for (let i = 0; i < 7; i++) {
      const bx = w * (0.08 + i * 0.07), bh = hh * (0.18 + (i % 3) * 0.07);
      x.fillStyle = i % 2 ? t.muted : t.ink; x.fillRect(bx, hh * 0.78 - bh, w * 0.05, bh);
      x.fillStyle = t.bg; for (let r = 0; r < 4; r++) x.fillRect(bx + w * 0.012, hh * 0.78 - bh + 6 + r * bh / 4.5, w * 0.025, 3);
    }
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    x.fillStyle = t.muted; for (let i = 0; i < 40; i++) x.fillRect(rnd() * w, rnd() * hh * 0.5, 1.5, 1.5);
    return cv;
  }

  const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  function filterImage(src, kind, t) {
    const w = src.width, hh = src.height, ctx = src.getContext('2d'), inp = ctx.getImageData(0, 0, w, hh), d = inp.data;
    const out = new ImageData(w, hh), o = out.data, ink = rgb(t.ink), bg = rgb(t.bg);
    const N = w * hh, L = new Float32Array(N); for (let i = 0; i < N; i++) L[i] = lum(d, i * 4);
    if (kind === 'gray') {
      for (let i = 0; i < N; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = L[i]; o[i * 4 + 3] = 255; }
    } else if (kind === 'blur') {
      // three passes of a separable box blur approximate a gaussian
      const r = Math.max(2, Math.round(w / 160)), a = new Float32Array(d), b = new Float32Array(d.length);
      for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
          let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[(y * w + xx) * 4 + c]; n++; } } b[(y * w + x) * 4 + c] = s / n;
        }
        for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
          let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < hh) { s += b[(yy * w + x) * 4 + c]; n++; } } a[(y * w + x) * 4 + c] = s / n;
        }
      }
      for (let i = 0; i < N; i++) { o[i * 4] = a[i * 4]; o[i * 4 + 1] = a[i * 4 + 1]; o[i * 4 + 2] = a[i * 4 + 2]; o[i * 4 + 3] = 255; }
    } else if (kind === 'edges') {
      // Sobel gradient magnitude, drawn as ink on paper
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        const at = (xx, yy) => L[Math.min(hh - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
        const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
        const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
        const m = Math.min(1, Math.hypot(gx, gy) / 360), i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) o[i + c] = bg[c] * (1 - m) + ink[c] * m; o[i + 3] = 255;
      }
    } else if (kind === 'threshold') {
      // Otsu: the threshold that maximises between-class variance
      const hist = new Float64Array(256); for (let i = 0; i < N; i++) hist[Math.round(L[i])]++;
      let sum = 0; for (let k = 0; k < 256; k++) sum += k * hist[k];
      let wB = 0, sB = 0, best = 0, th = 128;
      for (let k = 0; k < 256; k++) {
        wB += hist[k]; if (!wB) continue; const wF = N - wB; if (!wF) break;
        sB += k * hist[k]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
        if (v > best) { best = v; th = k; }
      }
      for (let i = 0; i < N; i++) { const col = L[i] > th ? bg : ink; o[i * 4] = col[0]; o[i * 4 + 1] = col[1]; o[i * 4 + 2] = col[2]; o[i * 4 + 3] = 255; }
    }
    const res = document.createElement('canvas'); res.width = w; res.height = hh; res.getContext('2d').putImageData(out, 0, 0);
    return res;
  }

  function drawCompare(x, w, hh, a, b, split, t, labels) {
    x.clearRect(0, 0, w, hh);
    x.save(); x.beginPath(); x.rect(0, 0, split, hh); x.clip(); x.drawImage(a, 0, 0, w, hh); x.restore();
    x.save(); x.beginPath(); x.rect(split, 0, w - split, hh); x.clip(); x.drawImage(b, 0, 0, w, hh); x.restore();
    x.fillStyle = t.accent; x.fillRect(split - 1, 0, 2, hh);
    if (labels) {
      x.fillRect(split - 5, hh / 2 - 12, 10, 24);
      x.font = '12px "IBM Plex Mono", monospace';
      const tag = (s, px, align) => { x.textAlign = align; const m = x.measureText(s).width; x.fillStyle = t.bg; x.fillRect(align === 'left' ? px - 4 : px - m - 4, 6, m + 8, 20); x.fillStyle = t.ink; x.fillText(s, px, 20); };
      tag(labels[0], 10, 'left'); tag(labels[1], w - 10, 'right');
    }
  }

  const media = {
    preview(cv) {
      let ctx, w, hh, f = 0, a, b, t;
      return () => {
        if (!ctx || cv.width !== Math.round(cv.clientWidth * DPR)) {
          [ctx, w, hh] = prep(cv); t = theme();
          a = sampleScene(document.createElement('canvas'), Math.round(w), Math.round(hh), t);
          b = filterImage(a, 'edges', t);
        }
        f++;
        drawCompare(ctx, w, hh, a, b, (Math.sin(f / 50) + 1) / 2 * w, t);
      };
    },

    mount(root, opts) {
      root.innerHTML = `
        <div class="demo-bar">
          <div class="seg" role="group" aria-label="Filter">
            <button data-f="gray">grayscale</button><button data-f="blur">blur</button><button data-f="edges" class="on">edges</button><button data-f="threshold">threshold</button>
          </div>
          <label class="btn file-btn">load your own image<input type="file" accept="image/*"></label>
        </div>
        <canvas class="demo-canvas" style="cursor:ew-resize" aria-label="Before and after comparison: drag to move the divider"></canvas>
        <p class="caption" style="margin-top:8px">Drag the divider to compare. Your image is processed locally and never leaves the browser. These filters stand in for the tool's own pipeline, described below.</p>`;
      const cv = root.querySelector('canvas'), t = theme();
      const st = { kind: 'edges', split: 0.5, src: null, cache: {} };
      const setSource = c => { st.src = c; st.cache = {}; cv.style.aspectRatio = c.width + '/' + c.height; draw(); if (opts && opts.onResize) opts.onResize(); };
      const processed = () => st.cache[st.kind] || (st.cache[st.kind] = filterImage(st.src, st.kind, t));
      function draw() {
        if (!st.src || !cv.clientWidth) return;
        const [x, w, hh] = prep(cv);
        const names = { gray: 'grayscale', blur: 'blur', edges: 'sobel edges', threshold: 'otsu threshold' };
        drawCompare(x, w, hh, st.src, processed(), st.split * w, t, ['original', names[st.kind]]);
      }
      setSource(sampleScene(document.createElement('canvas'), 720, 420, t));

      let drag = false;
      const move = e => { const r = cv.getBoundingClientRect(); st.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); draw(); };
      cv.addEventListener('pointerdown', e => { drag = true; cv.setPointerCapture(e.pointerId); move(e); });
      cv.addEventListener('pointermove', e => { if (drag) move(e); });
      cv.addEventListener('pointerup', () => drag = false);
      root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
        st.kind = b.dataset.f; root.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); draw();
      });
      const load = file => {
        if (!file || !file.type.startsWith('image/')) return;
        const img = new Image();
        img.onload = () => {
          const sc = Math.min(1, 720 / img.width), c = document.createElement('canvas');
          c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(img.src); setSource(c);
        };
        img.src = URL.createObjectURL(file);
      };
      root.querySelector('input[type=file]').onchange = e => load(e.target.files[0]);
      cv.addEventListener('dragover', e => e.preventDefault());
      cv.addEventListener('drop', e => { e.preventDefault(); load(e.dataTransfer.files[0]); });
      new ResizeObserver(draw).observe(cv);
    }
  };

  window.DEMOS = { path, media };
})();
