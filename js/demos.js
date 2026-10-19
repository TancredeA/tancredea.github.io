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
  // Digit recognition: 8x8 input, MLP 64-96-10 (weights in assets/)
  // ======================================================================
  let weights = null;
  const loadWeights = () => weights || (weights = fetch('assets/digits-mlp.json').then(r => r.json()));

  function predict(W, x) {
    const hdim = W.b1.length, hid = new Float64Array(hdim);
    for (let j = 0; j < hdim; j++) { let s = W.b1[j]; for (let i = 0; i < 64; i++) s += x[i] * W.W1[i][j]; hid[j] = s > 0 ? s : 0; }
    const z = W.b2.map((b, k) => { let s = b; for (let j = 0; j < hdim; j++) s += hid[j] * W.W2[j][k]; return s; });
    const m = Math.max(...z), e = z.map(v => Math.exp(v - m)), S = e.reduce((a, b) => a + b, 0);
    return e.map(v => v / S);
  }

  // Same preprocessing as the training set (UCI optdigits): the ink's bounding
  // box is scaled into a 32x32 square, then each 4x4 block becomes one input.
  function toInput(src) {
    const c = src.getContext('2d'), { width: w, height: hh } = src, d = c.getImageData(0, 0, w, hh).data;
    let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = 32 / Math.max(bw, bh);
    const t = document.createElement('canvas'); t.width = t.height = 32;
    const tc = t.getContext('2d'); tc.imageSmoothingEnabled = true;
    const dw = bw * sc, dh = bh * sc;
    tc.drawImage(src, x0, y0, bw, bh, (32 - dw) / 2, (32 - dh) / 2, dw, dh);
    const q = tc.getImageData(0, 0, 32, 32).data;
    let A = new Float64Array(1024);
    for (let i = 0; i < 1024; i++) A[i] = q[i * 4 + 3] / 255;
    const blocks = a => {
      const out = new Float64Array(64);
      for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
        let s = 0;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) s += a[(by * 4 + y) * 32 + bx * 4 + x];
        out[by * 8 + bx] = s / 16;
      }
      return out;
    };
    // The training digits were written with a thick pen. Thin strokes are
    // thickened (3x3 dilation) until the ink density is comparable.
    let out = blocks(A);
    for (let it = 0; it < 3 && out.reduce((a, b) => a + b, 0) / 64 < 0.24; it++) {
      const D = new Float64Array(1024);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && xx >= 0 && yy < 32 && xx < 32 && A[yy * 32 + xx] > m) m = A[yy * 32 + xx];
        }
        D[y * 32 + x] = m;
      }
      A = D; out = blocks(A);
    }
    return out;
  }

  const digits = {
    preview(cv) {
      const pt = [[.3, .25], [.5, .16], [.68, .27], [.6, .44], [.44, .5], [.63, .56], [.7, .72], [.55, .86], [.3, .8]];
      const pb = [.01, .02, .05, .82, .01, .04, .01, .02, .01, .01];
      let ctx, w, hh, f = 0, t;
      return () => {
        if (!ctx || cv.width !== Math.round(cv.clientWidth * DPR)) { [ctx, w, hh] = prep(cv); t = theme(); }
        f++;
        const p = f % 260, q = Math.min(w, hh * 0.62), X = a => (w - q) / 2 + a * q;
        ctx.clearRect(0, 0, w, hh);
        ctx.strokeStyle = t.line; ctx.lineWidth = 1; ctx.strokeRect((w - q) / 2 + 0.5, 0.5, q - 1, q - 1);
        const pr = Math.min(1, p / 110) * (pt.length - 1);
        ctx.strokeStyle = t.ink; ctx.lineWidth = Math.max(2, q / 14); ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= Math.floor(pr); i++) { const [a, c] = pt[i]; i ? ctx.lineTo(X(a), c * q) : ctx.moveTo(X(a), c * q); }
        const i0 = Math.floor(pr), fr = pr - i0;
        if (i0 < pt.length - 1) { const [a, c] = pt[i0], [a2, c2] = pt[i0 + 1]; ctx.lineTo(X(a + (a2 - a) * fr), (c + (c2 - c) * fr) * q); }
        ctx.stroke();
        const gr = Math.max(0, Math.min(1, (p - 120) / 40)), bw = w / 10, bt = hh - q - 8;
        pb.forEach((v, i) => { const bh = Math.max(1, v * gr * bt); ctx.fillStyle = i === 3 ? t.accent : t.line; ctx.fillRect(i * bw + 1, hh - bh, bw - 2, bh); });
      };
    },

    mount(root) {
      root.innerHTML = `
        <div class="dd">
          <div>
            <canvas class="demo-canvas pad" width="280" height="280" aria-label="Drawing pad: draw a digit with the mouse or a finger"></canvas>
            <div class="demo-bar" style="margin:12px 0 0"><button class="btn" data-a="clear">clear</button><span class="caption">draw one digit, 0 to 9, large and centred</span></div>
          </div>
          <div>
            <p class="k">what the model sees (8 × 8)</p>
            <canvas class="seen" width="8" height="8"></canvas>
            <p class="k">class probabilities</p>
            <div class="bars"></div>
            <div class="guess" aria-live="polite"></div>
          </div>
        </div>
        <p class="caption" style="margin-top:14px">Placeholder model: a 64-96-10 MLP trained on the UCI handwritten digits, running in your browser. To be replaced by the MPS classifier in progress.</p>`;
      const pad = root.querySelector('.pad'), pc = pad.getContext('2d', { willReadFrequently: true }), seen = root.querySelector('.seen'), sc = seen.getContext('2d');
      const bars = root.querySelector('.bars'), guess = root.querySelector('.guess');
      const t = theme();
      bars.innerHTML = Array.from({ length: 10 }, (_, k) => `<span>${k}</span><span class="bar"><i style="width:0"></i></span><span data-p="${k}">0%</span>`).join('');
      const rows = [...bars.children];

      const show = (x, p) => {
        const ac = rgb(t.ink);
        const img = sc.createImageData(8, 8);
        for (let i = 0; i < 64; i++) { img.data[i * 4] = ac[0]; img.data[i * 4 + 1] = ac[1]; img.data[i * 4 + 2] = ac[2]; img.data[i * 4 + 3] = x ? Math.round(x[i] * 255) : 0; }
        sc.putImageData(img, 0, 0);
        const top = p ? p.indexOf(Math.max(...p)) : -1;
        for (let k = 0; k < 10; k++) {
          const v = p ? p[k] : 0;
          rows[k * 3 + 1].firstChild.style.width = (v * 100).toFixed(1) + '%';
          rows[k * 3 + 2].textContent = Math.round(v * 100) + '%';
          [0, 1, 2].forEach(o => rows[k * 3 + o].classList.toggle('top', k === top));
        }
        guess.textContent = p ? top : '';
      };
      show(null, null);

      let raf = null;
      const run = () => {
        raf = null;
        const x = toInput(pad);
        if (!x) { show(null, null); return; }
        loadWeights().then(W => show(x, predict(W, x)));
      };
      const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };

      let drawing = false, last = null;
      const pos = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 280, (e.clientY - r.top) / r.height * 280]; };
      pad.addEventListener('pointerdown', e => { drawing = true; last = pos(e); pad.setPointerCapture(e.pointerId); stroke(last, last); });
      pad.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); stroke(last, p); last = p; });
      const end = () => { drawing = false; schedule(); };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      function stroke(a, b) {
        pc.strokeStyle = t.ink; pc.lineWidth = 26; pc.lineCap = pc.lineJoin = 'round';
        pc.beginPath(); pc.moveTo(a[0], a[1]); pc.lineTo(b[0], b[1]); pc.stroke(); schedule();
      }
      root.querySelector('[data-a="clear"]').onclick = () => { pc.clearRect(0, 0, 280, 280); show(null, null); };
      loadWeights();
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

  digits.model = { predict, toInput, loadWeights };
  window.DEMOS = { path, digits, media };
})();
