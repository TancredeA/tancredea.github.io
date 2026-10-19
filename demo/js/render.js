// Canvas rendering: colour ramps, the layered main map and the three mini-maps.
// Offscreen layers hold the static scene and the field images; the visible canvas is
// recomposed (cheaply) whenever the animation state changes.

import { N } from './scene.js';
import { R_REF } from './fdtd.js';

// Sequential ramps, listed from the light end to the dark end (monotone in lightness).
// Light theme: low = light, high = dark. Dark theme: reversed, so high values always stand out.
export const RAMPS = {
  danger: ['#fbf3d5', '#f6d48d', '#ec9f58', '#d2653d', '#a63c37', '#6a213b'],
  sigma: ['#edf3f8', '#c3d6e7', '#8eb2d3', '#5d8aba', '#386598', '#1f3f67'],
  acq: ['#f4eff7', '#dccbe8', '#bea0d5', '#9a73bc', '#73519c', '#4a2f6f'],
};

export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export function isDark() { return cssVar('--scheme') === 'dark'; }

function hex(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

export function makeLUT(stops, dark = isDark()) {
  const s = (dark ? [...stops].reverse() : stops).map(hex);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let k = 0; k < 256; k++) {
    const x = k / 255 * (s.length - 1), i = Math.min(Math.floor(x), s.length - 2), f = x - i;
    for (let c = 0; c < 3; c++) lut[3 * k + c] = s[i][c] + (s[i + 1][c] - s[i][c]) * f;
  }
  return lut;
}

export function lutCss(lut, t) {
  const k = 3 * Math.round(Math.max(0, Math.min(1, t)) * 255);
  return `rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]})`;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Paints a field into an N × N canvas. t = (v / vmax)^gamma; transparent where mask is 0.
export function paintField(cv, field, mask, lut, { vmax = 1, gamma = 0.5, aMin = 0.2, aMax = 0.9, log = null } = {}) {
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const d = img.data;
  for (let i = 0; i < N * N; i++) {
    if (!mask[i]) continue;
    let t;
    if (log) { if (!(field[i] > log[0])) continue; t = Math.log(field[i] / log[0]) / Math.log(log[1] / log[0]); }
    else t = vmax > 0 ? Math.max(field[i], 0) / vmax : 0;
    t = Math.min(1, Math.max(0, t)) ** gamma;
    const k = 3 * Math.round(t * 255);
    d[4 * i] = lut[k]; d[4 * i + 1] = lut[k + 1]; d[4 * i + 2] = lut[k + 2];
    d[4 * i + 3] = 255 * (aMin + (aMax - aMin) * t);
  }
  ctx.putImageData(img, 0, 0);
}

function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

// ------------------------------------------------------------------ main map

export class MapView {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.heat = canvas(N, N); this.heatPrev = canvas(N, N);
    this.peak = canvas(N, N);
    this.explore = canvas(N, N);
    this.corridor = canvas(N, N);
    this.wave = null;
    this.st = this.blankState();
    this.pending = false;
  }

  blankState() {
    return {
      heatA: 0, heatPrevA: 0, reveal: null, peakA: 0, waveA: 0, exploreA: 0, corridorA: 0,
      routes: [], sims: [], A: -1, next: null, src: -1, hover: -1, cursor: -1, bNote: 1, pulse: 0,
    };
  }

  reset() { this.st = this.blankState(); this.invalidate(); }

  setScene(scene) {
    this.scene = scene;
    this.resize();
  }

  resize() {
    const css = this.cv.clientWidth;
    if (css < 120) return;           // not laid out yet
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.css = css;
    this.cv.width = Math.round(css * dpr);
    this.cv.height = Math.round(css * dpr);
    const small = css < 420;
    this.m = { l: small ? 22 : 28, t: small ? 18 : 22 };
    this.plot = css - this.m.l - (small ? 10 : 12);
    this.k = this.plot / N;                       // px per metre
    this.font = cssVar('--font-mono') || 'monospace';
    this.fontSans = cssVar('--font-sans') || 'sans-serif';
    this.drawStatic();
    this.draw();          // synchronously: resizing clears the canvas
  }

  px(c) { return [this.m.l + ((c % N) + 0.5) * this.k, this.m.t + (((c / N) | 0) + 0.5) * this.k]; }

  cellAt(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    const x = Math.floor((clientX - r.left - this.m.l) / this.k), y = Math.floor((clientY - r.top - this.m.t) / this.k);
    return x >= 0 && y >= 0 && x < N && y < N ? y * N + x : -1;
  }

  colors() {
    const v = n => cssVar(n);
    return {
      bg: v('--bg'), line: v('--line'), line2: v('--line-strong'), ink: v('--ink'), muted: v('--muted'),
      accent: v('--accent'), road: v('--road'), roadMark: v('--road-mark'), field: v('--field'), fieldMark: v('--field-mark'),
      cat: [null, v('--cat1'), v('--cat2'), v('--cat3'), v('--cat4')], warm: v('--warm'), cool: v('--cool'), surface: v('--surface'),
    };
  }

  // Ground (grid, roads, open area, axes) and buildings, at device resolution.
  drawStatic() {
    const sc = this.scene, W = this.cv.width, dpr = this.dpr, k = this.k, { l, t } = this.m;
    const C = this.col = this.colors();
    this.ground = canvas(W, W);
    let g = this.ground.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = C.bg; g.fillRect(0, 0, this.css, this.css);
    const X = x => l + x * k, Y = y => t + y * k;
    g.fillStyle = C.field;
    const f = sc.field;
    g.fillRect(X(f.x), Y(f.y), f.w * k, f.h * k);
    g.save();
    g.beginPath(); g.rect(X(f.x), Y(f.y), f.w * k, f.h * k); g.clip();
    g.strokeStyle = C.fieldMark; g.lineWidth = 1;
    for (let s = -f.h; s < f.w; s += 3) { g.beginPath(); g.moveTo(X(f.x + s), Y(f.y + f.h)); g.lineTo(X(f.x + s + f.h), Y(f.y)); g.stroke(); }
    g.restore();
    g.fillStyle = C.road;
    for (const r of sc.roads) g.fillRect(X(r.x), Y(r.y), r.w * k, r.h * k);
    // grid: 1 m lines when they are far enough apart, 10 m lines always
    g.lineWidth = 1;
    if (k >= 5) {
      g.strokeStyle = C.line; g.beginPath();
      for (let i = 0; i <= N; i++) {
        if (i % 10 === 0) continue;
        const p = Math.round(X(i)) + 0.5, q = Math.round(Y(i)) + 0.5;
        g.moveTo(p, Y(0)); g.lineTo(p, Y(N)); g.moveTo(X(0), q); g.lineTo(X(N), q);
      }
      g.stroke();
    }
    g.strokeStyle = C.line2; g.beginPath();
    for (let i = 0; i <= N; i += 10) {
      const p = Math.round(X(i)) + 0.5, q = Math.round(Y(i)) + 0.5;
      g.moveTo(p, Y(0)); g.lineTo(p, Y(N)); g.moveTo(X(0), q); g.lineTo(X(N), q);
    }
    g.stroke();
    // main-road centre line
    g.strokeStyle = C.roadMark; g.setLineDash([4, 5]); g.lineWidth = 1.2;
    for (const r of sc.roads.filter(r => r.kind === 1)) {
      g.beginPath();
      if (r.w > r.h) { g.moveTo(X(r.x), Y(r.y + r.h / 2)); g.lineTo(X(r.x + r.w), Y(r.y + r.h / 2)); }
      else { g.moveTo(X(r.x + r.w / 2), Y(r.y)); g.lineTo(X(r.x + r.w / 2), Y(r.y + r.h)); }
      g.stroke();
    }
    g.setLineDash([]);
    // field label
    g.fillStyle = C.muted; g.font = `${Math.max(9, Math.min(11, k * 1.4))}px ${this.font}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(f.label, X(f.x + f.w / 2), Y(f.y + f.h - 2));
    // axes
    g.strokeStyle = C.ink; g.lineWidth = 1;
    g.strokeRect(Math.round(X(0)) + 0.5, Math.round(Y(0)) + 0.5, Math.round(N * k), Math.round(N * k));
    g.fillStyle = C.muted; g.font = `${this.css < 420 ? 9 : 10}px ${this.font}`;
    for (let i = 0; i <= N; i += 10) {
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(String(i), X(i), t - 4);
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(String(i), l - 4, Y(i));
    }

    this.bld = canvas(W, W);
    g = this.bld.getContext('2d');
    g.scale(dpr, dpr);
    g.lineWidth = 1;
    for (const b of sc.buildings) {
      g.fillStyle = C.cat[b.cat];
      g.fillRect(X(b.x), Y(b.y), b.w * k, b.h * k);
      g.strokeStyle = C.ink;
      g.strokeRect(Math.round(X(b.x)) + 0.5, Math.round(Y(b.y)) + 0.5, Math.round(b.w * k) - 1, Math.round(b.h * k) - 1);
      if (b.cat === 4) {          // a small cross: clinic or fire station
        const cx = X(b.cx), cy = Y(b.cy) - k * 1.6, s = Math.min(Math.min(b.w, b.h) * k * 0.08, 9);
        g.fillStyle = C.ink;
        g.fillRect(cx - s, cy - s / 3, 2 * s, 2 * s / 3); g.fillRect(cx - s / 3, cy - s, 2 * s / 3, 2 * s);
      }
      if (Math.min(b.w, b.h) * k >= 22) {
        g.fillStyle = C.ink; g.font = `${Math.max(9, Math.min(11, k * 1.3))}px ${this.font}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('×' + b.d, X(b.cx), Y(b.cy) + (b.cat === 4 ? k * 2 : 0));
      }
    }
  }

  // Field layers -------------------------------------------------------------

  setHeat(field, opts, lut) {
    [this.heat, this.heatPrev] = [this.heatPrev, this.heat];
    this.st.heatPrevA = this.st.heatA;
    paintField(this.heat, field, this.scene.free, lut, opts);
    this.invalidate();
  }

  setPeak(field, lut) {
    paintField(this.peak, field, this.scene.free, lut, { log: [20, 1000], gamma: 0.9, aMin: 0.25, aMax: 0.9 });
  }

  setCorridor(mask, rgb) {
    const ctx = this.corridor.getContext('2d'), img = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) if (mask[i]) { img.data.set(rgb, 4 * i); img.data[4 * i + 3] = 70; }
    ctx.putImageData(img, 0, 0);
  }

  // Exploration image up to trace position `upto`; the last `front` buckets drawn stronger.
  setExplore(trace, buckets, upto, front, rgb) {
    const ctx = this.explore.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
    const bNow = upto > 0 ? buckets[upto - 1] : 0;
    for (let k = 0; k < upto; k++) {
      const i = trace[k], recent = bNow - buckets[k] < front;
      d[4 * i] = rgb[0]; d[4 * i + 1] = rgb[1]; d[4 * i + 2] = rgb[2];
      d[4 * i + 3] = recent ? 160 : 70;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Wave frame: signed pressure, spreading-compensated so the front stays visible.
  prepareWave(shot) {
    const n = shot.frameSize, f = n / N;
    if (!this.wave || this.wave.width !== n) { this.wave = canvas(n, n); this.waveImg = this.wave.getContext('2d').createImageData(n, n); }
    const sx = (shot.cell % N + 0.5) * f, sy = (((shot.cell / N) | 0) + 0.5) * f;
    const gain = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
      gain[j * n + i] = Math.sqrt(Math.max(Math.hypot(i + 0.5 - sx, j + 0.5 - sy) / f, R_REF) / R_REF);
    let vmax = 0;
    const fr = shot.frames, sz = n * n;
    for (let q = 3; q < shot.nFrames; q++) for (let k = 0; k < sz; k += 7) vmax = Math.max(vmax, Math.abs(fr[q * sz + k] * gain[k]));
    this.waveShot = { shot, gain, vmax: vmax * 0.5 || 1, n };
  }

  setWaveFrame(q, warm, cool) {
    const { shot, gain, vmax, n } = this.waveShot, sz = n * n, fr = shot.frames, d = this.waveImg.data;
    const base = Math.min(q, shot.nFrames - 1) * sz;
    for (let k = 0; k < sz; k++) {
      // compression strong, rarefaction (the 2D wake behind the front) faint
      const v = fr[base + k] * gain[k] / vmax, a = Math.min(1, Math.abs(v)) ** 0.7;
      const c = v >= 0 ? warm : cool;
      d[4 * k] = c[0]; d[4 * k + 1] = c[1]; d[4 * k + 2] = c[2]; d[4 * k + 3] = (v >= 0 ? 240 : 70) * a;
    }
    this.wave.getContext('2d').putImageData(this.waveImg, 0, 0);
    this.invalidate();
  }

  // Composition --------------------------------------------------------------

  invalidate() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.draw(); });
  }

  draw() {
    if (!this.ground) return;
    const ctx = this.ctx, st = this.st, k = this.k, { l, t } = this.m, C = this.col, P = N * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.ground, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const field = (cv, a, smooth = false) => {
      if (a <= 0) return;
      ctx.globalAlpha = a; ctx.imageSmoothingEnabled = smooth;
      ctx.drawImage(cv, l, t, P, P);
      ctx.globalAlpha = 1;
    };
    field(this.heatPrev, st.heatPrevA);
    if (st.reveal) {
      ctx.save(); ctx.beginPath();
      const [cx, cy] = this.px(st.reveal.c);
      ctx.arc(cx, cy, Math.max(0, st.reveal.r * k), 0, 2 * Math.PI); ctx.clip();
      field(this.heat, st.heatA);
      ctx.restore();
    } else field(this.heat, st.heatA);
    field(this.corridor, st.corridorA);
    field(this.explore, st.exploreA);
    field(this.peak, st.peakA);
    if (this.wave) field(this.wave, st.waveA, true);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bld, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // routes
    for (const r of st.routes) this.drawRoute(r);
    // simulated points
    ctx.font = `500 ${this.css < 420 ? 9 : 10}px ${this.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of st.sims) {
      if (s.a <= 0) continue;
      ctx.globalAlpha = s.a;
      const [x, y] = this.px(s.cell), r = this.css < 420 ? 6.5 : 8;
      ctx.fillStyle = C.surface; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.fillText(String(s.n), x, y + 0.5);
      if (s.resid !== undefined && s.ra > 0) {
        ctx.globalAlpha = s.a * s.ra;
        ctx.fillStyle = s.resid >= 0 ? C.warm : C.cool;
        ctx.font = `500 ${this.css < 420 ? 11 : 13}px ${this.font}`;
        ctx.fillText(s.resid >= 0 ? '+' : '−', x + r + 5, y - r + 1);
        ctx.font = `500 ${this.css < 420 ? 9 : 10}px ${this.font}`;
      }
      ctx.globalAlpha = 1;
    }
    if (st.src >= 0) {           // source of the shot being played
      const [x, y] = this.px(st.src);
      ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 2 * Math.PI); ctx.fill();
    }
    this.drawB();
    if (st.A >= 0) this.drawA(st.A);
    if (st.next) this.drawNext(st.next);
    if (st.cursor >= 0) this.drawCellBox(st.cursor, C.accent, [3, 2]);
    if (st.hover >= 0 && st.hover !== st.cursor) this.drawCellBox(st.hover, C.ink, []);
  }

  drawRoute(r) {
    const { path, style, p = 1 } = r;
    if (!path || path.length < 2 || p <= 0) return;
    const ctx = this.ctx, C = this.col;
    const n = Math.max(2, Math.round(path.length * p));
    const pts = path.slice(0, n).map(c => this.px(c));
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (style === 'kb') { ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.75 * (r.a ?? 1); ctx.lineWidth = 1.8; ctx.setLineDash([5, 5]); }
    else if (style === 'ghost') { ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.3 * (r.a ?? 1); ctx.lineWidth = 3; }
    else {
      // a pale casing keeps the route readable over any heatmap
      ctx.strokeStyle = C.bg; ctx.globalAlpha = 0.85 * (r.a ?? 1); ctx.lineWidth = style === 'final' ? 7 : 6;
      polyline(ctx, pts); ctx.stroke();
      ctx.strokeStyle = C.accent; ctx.globalAlpha = r.a ?? 1; ctx.lineWidth = style === 'final' ? 4 : 3;
    }
    polyline(ctx, pts); ctx.stroke();
    ctx.restore();
  }

  drawA(c) {
    const ctx = this.ctx, C = this.col, [x, y] = this.px(c), r = this.css < 420 ? 6 : 7;
    ctx.fillStyle = C.ink; ctx.strokeStyle = C.bg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - r - 2); ctx.lineTo(x + r + 1, y + r); ctx.lineTo(x - r - 1, y + r); ctx.closePath();
    ctx.fill(); ctx.stroke();
    this.label('A', x, y - r - 9, C.ink);
  }

  drawB() {
    const sc = this.scene, ctx = this.ctx, C = this.col, [x, y] = this.px(sc.B), r = this.css < 420 ? 6 : 7;
    ctx.fillStyle = C.surface; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
    ctx.fillStyle = C.ink; ctx.font = `500 ${r + 3}px ${this.fontSans}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B', x, y + 0.5);
    if (this.st.bNote > 0) {
      ctx.globalAlpha = this.st.bNote;
      // ring at the distance to the nearest building: why B is where it is
      ctx.save();
      ctx.beginPath(); ctx.rect(this.m.l, this.m.t, this.plot, this.plot); ctx.clip();
      ctx.strokeStyle = C.muted; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, sc.dist[sc.B] * this.k, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      this.note(x, y, ['disposal site: the point', 'farthest from any building'], r + 4);
      ctx.globalAlpha = 1;
    }
  }

  drawNext(nx) {
    const ctx = this.ctx, C = this.col, [x, y] = this.px(nx.cell);
    ctx.globalAlpha = nx.a;
    const R = 9 + 6 * (0.5 + 0.5 * Math.sin(nx.phase || 0));
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.fill();
    if (nx.label) this.note(x, y, ['most useful simulation', 'for this route'], R + 2, C.accent);
    ctx.globalAlpha = 1;
  }

  drawCellBox(c, color, dash) {
    const ctx = this.ctx, k = this.k, x = this.m.l + (c % N) * k, y = this.m.t + ((c / N) | 0) * k;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dash);
    ctx.strokeRect(x - 1, y - 1, k + 2, k + 2); ctx.setLineDash([]);
  }

  label(text, x, y, color) {
    const ctx = this.ctx;
    ctx.font = `500 12px ${this.fontSans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = this.col.bg; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  // Technical-sketch annotation: a leader line with an arrowhead toward (x, y) and a text
  // block, on the diagonal where the block overlaps the fewest buildings.
  note(x, y, lines, gap, color = this.col.ink) {
    const ctx = this.ctx, small = this.css < 420, fs = small ? 9.5 : 11;
    ctx.font = `${fs}px ${this.font}`;
    const w = Math.max(...lines.map(s => ctx.measureText(s).width)), h = lines.length * (fs + 3);
    const L = small ? 18 : 30, k = this.k, { l, t } = this.m, P = this.plot;
    let best = null;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ex = x + dx * (gap + L), ey = y + dy * (gap + L * 0.6);
      let tx = dx > 0 ? ex + 4 : ex - 4 - w, ty = dy > 0 ? ey : ey - h;
      const out = Math.max(0, l + 2 - tx) + Math.max(0, tx + w - (l + P - 2)) + Math.max(0, t + 2 - ty) + Math.max(0, ty + h - (t + P - 2));
      tx = Math.max(l + 2, Math.min(l + P - w - 2, tx));
      ty = Math.max(t + 2, Math.min(t + P - h - 2, ty));
      let cover = 0;
      for (const b of this.scene.buildings) {
        const ox = Math.min(tx + w, l + (b.x + b.w) * k) - Math.max(tx, l + b.x * k);
        const oy = Math.min(ty + h, t + (b.y + b.h) * k) - Math.max(ty, t + b.y * k);
        if (ox > 0 && oy > 0) cover += ox * oy * (b.cat >= 3 ? 3 : 1);
      }
      const score = cover + 40 * out;
      if (!best || score < best.score) best = { score, dx, dy, ex, ey, tx, ty };
    }
    const { dx, dy, ex, ey, tx, ty } = best;
    const sx = x + dx * gap * 0.7, sy = y + dy * gap * 0.7;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    const ang = Math.atan2(sy - ey, sx - ex), a = 6;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.lineTo(sx - a * Math.cos(ang - 0.4), sy - a * Math.sin(ang - 0.4));
    ctx.lineTo(sx - a * Math.cos(ang + 0.4), sy - a * Math.sin(ang + 0.4)); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    const ga = ctx.globalAlpha;
    ctx.fillStyle = this.col.bg; ctx.globalAlpha = ga * 0.88;
    ctx.fillRect(tx - 3, ty - 2, w + 6, h + 3);
    ctx.globalAlpha = ga;
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((s, i) => ctx.fillText(s, tx, ty + i * (fs + 3)));
  }
}

// ------------------------------------------------------------------ mini-maps

export class MiniMap {
  constructor(cv, ramp) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.ramp = ramp;
    this.img = canvas(N, N); this.prev = canvas(N, N);
    this.mix = 1; this.has = false; this.sims = []; this.next = -1; this.path = null; this.pulse = 0;
  }

  setScene(scene) { this.scene = scene; this.resize(); }

  resize() {
    const css = this.cv.clientWidth;
    if (!css) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cv.width = Math.round(css * dpr); this.cv.height = Math.round(css * dpr);
    this.dpr = dpr; this.css = css;
    this.lut = makeLUT(RAMPS[this.ramp]);
    this.draw();
  }

  set(field, opts) {
    [this.img, this.prev] = [this.prev, this.img];
    this.prevHas = this.has;
    paintField(this.img, field, this.scene.free, this.lut, { aMin: 0.35, aMax: 1, ...opts });
    this.has = true; this.mix = 0;
  }

  clear() { this.has = false; this.prevHas = false; this.sims = []; this.next = -1; this.path = null; this.draw(); }

  draw() {
    if (!this.scene || !this.css) return;
    const ctx = this.ctx, s = this.css, k = s / N, C = {
      bg: cssVar('--bg'), ink: cssVar('--ink'), bld: cssVar('--mini-bld'), accent: cssVar('--accent'), line: cssVar('--line-strong'),
    };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, s, s);
    ctx.imageSmoothingEnabled = false;
    if (this.prevHas && this.mix < 1) { ctx.globalAlpha = 1 - this.mix; ctx.drawImage(this.prev, 0, 0, s, s); }
    if (this.has) { ctx.globalAlpha = this.mix; ctx.drawImage(this.img, 0, 0, s, s); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.bld;
    for (const b of this.scene.buildings) ctx.fillRect(b.x * k, b.y * k, b.w * k, b.h * k);
    if (this.path && this.path.length > 1) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      polyline(ctx, this.path.map(c => [((c % N) + 0.5) * k, (((c / N) | 0) + 0.5) * k])); ctx.stroke();
    }
    for (const c of this.sims) {
      ctx.fillStyle = C.bg; ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(((c % N) + 0.5) * k, (((c / N) | 0) + 0.5) * k, 2.6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
    if (this.next >= 0) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(((this.next % N) + 0.5) * k, (((this.next / N) | 0) + 0.5) * k, 5 + 3 * Math.sin(this.pulse) ** 2, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  }
}

// Legend strip for a ramp, painted into a small canvas.
export function drawLegend(cv, ramp, gamma = 1) {
  const css = cv.clientWidth, h = cv.clientHeight;
  if (!css) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = Math.round(css * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d'), lut = makeLUT(RAMPS[ramp]);
  for (let x = 0; x < cv.width; x++) {
    ctx.fillStyle = lutCss(lut, (x / (cv.width - 1)) ** gamma);
    ctx.fillRect(x, 0, 1, cv.height);
  }
}
