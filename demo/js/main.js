// Guided experience: an autoplaying state machine over the pipeline steps.
// The visitor chooses A; play/pause, step, speed and restart only change the playback,
// and "new start" draws a new random map.

import { seedFromUrl, writeSeed } from './rng.js';
import { generateScene, defaultStart, CATEGORIES, N } from './scene.js';
import { solveCharge } from './kb.js';
import { initialDesign, posterior, route, acquire, routeShift, pathCost } from './pipeline.js';
import { BUDGET, N_INIT } from './acquisition.js';
import { clipWeights } from './path.js';
import { narration, STEPS, REAL_PROJECT, DISCLAIMER } from './narration.js';
import { MapView, MiniMap, makeLUT, RAMPS, drawLegend, cssVar } from './render.js';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fmt = (v, d = 2) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const ease = t => 1 - (1 - t) ** 3;
const hexRgb = h => { h = h.trim(); if (h.startsWith('rgb')) return h.match(/\d+/g).slice(0, 3).map(Number); const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

// ------------------------------------------------------------------ playback

class Cancelled extends Error {}

// While playing, "step" skips to the end of the current step. While paused, it plays
// (the rest of) one step, then pauses again at the next step boundary.
const player = {
  speed: 1, paused: false, skip: false, stepping: false, token: 0, waiters: [],
  newRun() { this.token++; this.skip = false; this.stepping = false; this.wake(); return this.token; },
  wake() { const w = this.waiters; this.waiters = []; w.forEach(f => f()); },
  check(tok) { if (tok !== this.token) throw new Cancelled(); },
  step() {
    if (this.paused) { this.stepping = true; this.wake(); } else this.skip = true;
  },
  async gate(tok) {
    this.check(tok);
    this.skip = false;
    this.stepping = false;
    while (this.paused && !this.stepping) {
      await new Promise(r => this.waiters.push(r));
      this.check(tok);
    }
  },
  // Runs fn(progress) over `ms` of playback time (scaled by speed, frozen while paused).
  anim(tok, ms, fn = () => {}) {
    return new Promise((resolve, reject) => {
      let t = 0, last = performance.now();
      const frame = now => {
        if (tok !== this.token) return reject(new Cancelled());
        const dt = Math.max(0, Math.min(now - last, 100));   // rAF stamps can precede `last`
        last = now;
        if (!this.paused || this.stepping || this.skip) t += dt * this.speed;
        const p = this.skip ? 1 : Math.min(1, ms > 0 ? t / ms : 1);
        fn(p);
        if (p >= 1) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  },
  wait(tok, ms) { return this.anim(tok, ms); },
};

// ------------------------------------------------------------------ setup

const seed = seedFromUrl();
const scene = generateScene(seed);
const Wexact = solveCharge(50, 20);
const W = Math.round(Wexact * 10) / 10;
const view = new MapView($('map'));
const minis = { mu: new MiniMap($('miniMu'), 'danger'), sigma: new MiniMap($('miniSigma'), 'sigma'), acq: new MiniMap($('miniAcq'), 'acq') };

let busyCount = 0;
const busy = d => { busyCount += d; $('busy').hidden = busyCount <= 0; };

// KB map in a worker, started at once while the visitor chooses A.
const kbWorker = new Worker(new URL('./kb.worker.js', import.meta.url), { type: 'module' });
busy(1);
const kbReady = new Promise(res => { kbWorker.onmessage = e => { busy(-1); res(e.data); }; });
kbWorker.postMessage({ scene, W });

// FDTD worker: calibration at init, then one shot per request (processed in order).
const fdtd = {
  w: new Worker(new URL('./fdtd.worker.js', import.meta.url), { type: 'module' }),
  seq: 0, pending: new Map(),
  init() {
    busy(1);
    this.ready = new Promise(res => { this.readyRes = res; });
    this.w.onmessage = e => {
      const m = e.data;
      if (m.type === 'ready') { busy(-1); this.readyRes(m); }
      else if (m.type === 'shot') { busy(-1); this.pending.get(m.id)?.(m); this.pending.delete(m.id); }
    };
    this.w.postMessage({ type: 'init', scene, W });
  },
  shot(cell) {
    const id = ++this.seq;
    busy(1);
    return new Promise(res => { this.pending.set(id, res); this.w.postMessage({ type: 'shot', id, cell }); });
  },
};
fdtd.init();

// Shots depend only on the map and the source, so they are kept across replays.
const shotCache = new Map();
function shot(cell) {
  if (!shotCache.has(cell)) shotCache.set(cell, fdtd.shot(cell));
  return shotCache.get(cell);
}

// ------------------------------------------------------------------ static panels

function fillInfo() {
  $('factW').textContent = `${W.toFixed(1)} kg TNT eq. (20 hPa at 50 m)`;
  $('factSeed').textContent = String(seed);
  const cnt = [0, 0, 0, 0, 0];
  scene.buildings.forEach(b => cnt[b.cat]++);
  $('factBld').textContent = `${scene.buildings.length} · footprint ${(100 * scene.footprint).toFixed(0)} %`;
  $('legendCats').innerHTML = [4, 3, 2, 1].map(c =>
    `<li><span class="sw" style="background:var(--cat${c})"></span>${CATEGORIES[c].label} <span class="muted">(${cnt[c]})</span><span class="imp">importance ×${CATEGORIES[c].d}</span></li>`).join('');
  $('disclaimerFull').textContent = DISCLAIMER;
  $('aboutNumbers').textContent = `Scene: 80 × 80 m, 1 m cells (${(N * N).toLocaleString('en-US')} candidate positions), ${scene.buildings.length} buildings. Charge ${W.toFixed(1)} kg, chosen so that the overpressure is 20 hPa at 50 m. Budget: ${BUDGET} simulations (${N_INIT} space-filling, then up to ${BUDGET - N_INIT} chosen for the route); stop early if the uncertainty along the route falls below 5 % of its danger.`;
  $('newMap').onclick = e => { e.preventDefault(); newMap(); };
}

function setCounter(n) {
  $('counter').innerHTML = `Simulations used: <b>${n} / ${BUDGET}</b> (candidate positions: ${(N * N).toLocaleString('en-US')})`;
}

function setNarr(step, ctx = {}, iterLabel = '') {
  const n = narration(step, ctx);
  $('stepNo').textContent = `step ${step} / ${STEPS}`;
  $('stepIter').textContent = iterLabel;
  $('stepTitle').textContent = n.title;
  $('stepBody').textContent = n.body;
  $('whyTerm').textContent = n.term ? `· ${n.term}` : '';
  $('whyText').textContent = n.why || '';
  $('why').hidden = !n.why;
  $('summary').hidden = step !== 6;
  $('map').setAttribute('aria-label', ariaFor(step, ctx));
}

function ariaFor(step, c) {
  const base = `Map, 80 by 80 metres, ${scene.buildings.length} buildings, disposal site B at ${scene.B % N}, ${(scene.B / N) | 0} metres.`;
  switch (step) {
    case 0: return base + ' Choose where the device was found: arrow keys move the cursor, Enter places it.';
    case 1: return base + ' Showing the cheap danger map and a dashed first-guess route from A to B.';
    case 2: return base + ` Showing a simulated pressure wave. ${c.n || 0} simulations so far.`;
    case 3: return base + ' Showing the corrected danger map; plus and minus signs mark where the cheap map was too low or too high.';
    case 4: return base + ` Showing the route search and the current route, ${c.len ? Math.round(c.len) + ' metres long' : ''}.`;
    case 5: return base + ' Highlighting a corridor around the route and the next point to simulate.';
    case 6: return base + ` Final route, ${Math.round(c.len || 0)} metres, after ${c.n} simulations.`;
  }
  return base;
}

$('why').onclick = () => {
  const open = $('whyText').hidden;
  $('whyText').hidden = !open;
  $('why').setAttribute('aria-expanded', String(open));
};

// ------------------------------------------------------------------ colours (theme-aware)

let lut, rgb;
function refreshColours() {
  lut = { danger: makeLUT(RAMPS.danger), sigma: makeLUT(RAMPS.sigma), acq: makeLUT(RAMPS.acq) };
  rgb = { accent: hexRgb(cssVar('--accent')), warm: hexRgb(cssVar('--warm')), cool: hexRgb(cssVar('--cool')) };
}

// ------------------------------------------------------------------ run state

const run = {
  A: -1, sKB: null, obs: [], post: null, routeNow: null, routeKB: null, acq: null,
  scales: null, iter: 0,
};

function heatOpts(kind) {
  if (kind === 'sigma') return { vmax: run.scales.sigma, gamma: 0.6 };
  if (kind === 'acq') return { vmax: 1, gamma: 1 };
  return { vmax: run.scales.danger, gamma: 0.5 };
}

function updateLegends() {
  drawLegend($('legMu'), 'danger', 0.5);
  drawLegend($('legSigma'), 'sigma', 0.6);
  drawLegend($('legAcq'), 'acq', 1);
  if (run.scales) {
    $('maxMu').textContent = fmt(run.scales.danger, 3);
    $('maxSigma').textContent = run.scales.sigma === null ? '' : fmt(run.scales.sigma, 3);
  }
}

// ------------------------------------------------------------------ steps

async function chooseA(tok) {
  setNarr(0);
  view.st.bNote = 1;
  view.invalidate();
  return new Promise((resolve, reject) => {
    pickResolver = c => { pickResolver = null; resolve(c); };
    cancelPick = () => reject(new Cancelled());
  });
}
let pickResolver = null, cancelPick = null;

function tryPick(c) {
  if (!pickResolver) return false;
  if (c < 0 || !scene.comp[c]) {
    const w = $('mapWrap');
    w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
    $('stepBody').textContent = c >= 0 && scene.bid[c] >= 0
      ? 'That is a building. Pick a spot on open ground: a road, a yard or the open lot.'
      : 'Pick a spot on open ground, inside the map.';
    return false;
  }
  pickResolver(c);
  return true;
}

async function stepKB(tok) {
  await player.gate(tok);
  setNarr(1);
  const { s } = await kbReady;
  player.check(tok);
  run.sKB = s;
  let mx = 0;
  for (let i = 0; i < N * N; i++) if (scene.free[i] && s[i] > mx) mx = s[i];
  run.scales = { danger: mx * 1.15, sigma: null };
  updateLegends();
  view.setHeat(s, heatOpts('danger'), lut.danger);
  view.st.heatPrevA = 0;
  const far = Math.hypot(N, N);
  if (reduced.matches) {
    await player.anim(tok, 400, p => { view.st.heatA = p; view.invalidate(); });
  } else {
    view.st.heatA = 1;
    await player.anim(tok, 1300, p => { view.st.reveal = { c: run.A, r: ease(p) * far }; view.st.bNote = 1 - p; view.invalidate(); });
    view.st.reveal = null;
  }
  view.st.bNote = 0;
  minis.mu.set(s, heatOpts('danger'));
  await player.anim(tok, 500, p => { minis.mu.mix = p; minis.mu.draw(); });
  run.routeKB = route(scene, s, run.A, scene.B);
  const kbR = { path: run.routeKB.path, style: 'kb', p: 0 };
  view.st.routes = [kbR];
  await player.anim(tok, reduced.matches ? 200 : 1000, p => { kbR.p = ease(p); view.invalidate(); });
  await player.wait(tok, 2600);
}

// Plays the wave of one shot on the main map, then the frozen peak field, then the marker.
async function playShot(tok, res, n, long) {
  view.prepareWave(res);
  view.setPeak(res.field, lut.danger);
  view.st.src = res.cell;
  const heatA = view.st.heatA;
  if (reduced.matches) {
    await player.anim(tok, 350, p => { view.st.peakA = p; view.st.heatA = heatA * (1 - 0.6 * p); view.invalidate(); });
  } else {
    const dur = long ? 3400 : 1150;
    let last = -1;
    await player.anim(tok, dur, p => {
      const q = Math.min(res.nFrames - 1, Math.floor(p * res.nFrames));
      if (q !== last) { view.setWaveFrame(q, rgb.warm, rgb.cool); last = q; }
      view.st.waveA = Math.min(1, p * 6);
      view.st.heatA = heatA * (1 - 0.6 * Math.min(1, p * 4));
      view.st.peakA = Math.max(0, (p - 0.65) / 0.35) * 0.9;
      view.invalidate();
    });
    await player.anim(tok, long ? 500 : 200, p => { view.st.waveA = 1 - p; view.st.peakA = 0.9 + 0.1 * p; view.invalidate(); });
  }
  view.st.src = -1;
  const sim = { cell: res.cell, n, a: 0 };
  view.st.sims.push(sim);
  await player.wait(tok, long ? 700 : 250);
  await player.anim(tok, long ? 450 : 250, p => { view.st.peakA = 1 - p; view.st.heatA = heatA * (0.4 + 0.6 * p); sim.a = p; view.invalidate(); });
  run.obs.push({ cell: res.cell, s: res.s });
  setCounter(run.obs.length);
  for (const m of Object.values(minis)) { m.sims = run.obs.map(o => o.cell); m.draw(); }
}

async function stepInitialSims(tok) {
  await player.gate(tok);
  setNarr(2, { n: 0 });
  await fdtd.ready;
  const design = initialDesign(scene, seed);
  const pending = design.map(c => shot(c));       // the worker queues them; animations await each
  for (let k = 0; k < design.length; k++) {
    const res = await pending[k];
    player.check(tok);
    await playShot(tok, res, k + 1, k === 0);
  }
  await player.wait(tok, 600);
}

async function stepGP(tok, pace) {
  await player.gate(tok);
  setNarr(3, { iter: run.iter, n: run.obs.length }, run.iter ? `iteration ${run.iter}` : '');
  run.post = posterior(scene, run.sKB, run.obs);
  const { mu, sigma, resid } = run.post;
  if (run.scales.sigma === null) {
    let ms = 0;
    for (let i = 0; i < N * N; i++) if (scene.free[i] && sigma[i] > ms) ms = sigma[i];
    run.scales.sigma = ms * 1.05 || 1e-3;
    updateLegends();
  }
  view.setHeat(mu, heatOpts('danger'), lut.danger);
  minis.mu.set(mu, heatOpts('danger'));
  minis.sigma.set(sigma, heatOpts('sigma'));
  const prevA = view.st.heatPrevA || 1;
  await player.anim(tok, 800 * pace, p => {
    view.st.heatA = p; view.st.heatPrevA = prevA * (1 - p);
    minis.mu.mix = minis.sigma.mix = p;
    minis.mu.draw(); minis.sigma.draw(); view.invalidate();
  });
  // residual markers: + where the cheap map under-estimated, − where it over-estimated
  view.st.sims.forEach((s, i) => { s.resid = resid[i]; if (s.ra === undefined) s.ra = 0; });
  await player.anim(tok, 450 * pace, p => { view.st.sims.forEach(s => { s.ra = Math.max(s.ra, p); }); view.invalidate(); });
  await player.wait(tok, (run.iter ? 900 : 2200) * pace);
}

async function stepRoute(tok, pace) {
  await player.gate(tok);
  const prev = run.routeNow;
  run.routeNow = route(scene, run.post.mu, run.A, scene.B);
  const r = run.routeNow;
  setNarr(4, { iter: run.iter, len: r.length }, run.iter ? `iteration ${run.iter}` : '');
  const routes = view.st.routes.filter(x => x.style === 'kb');
  const ghost = prev ? { path: prev.path, style: 'ghost', p: 1 } : null;
  const cur = { path: r.path, style: 'main', p: 0 };
  view.st.routes = [...routes, ...(ghost ? [ghost] : []), cur];
  minis.mu.path = minis.sigma.path = minis.acq.path = null;
  const T = r.trace.length, front = Math.max(2, Math.round(r.nBuckets * 0.04));
  if (reduced.matches) {
    view.setExplore(r.trace, r.traceBucket, T, 0, rgb.accent);
    await player.anim(tok, 300, p => { view.st.exploreA = p; view.invalidate(); });
  } else {
    view.st.exploreA = 1;
    let last = -1;
    await player.anim(tok, (run.iter ? 1500 : 2600) * pace, p => {
      // advance bucket by bucket: map progress onto bucket index, reveal all nodes up to it
      const b = Math.floor(ease(p) * r.nBuckets);
      if (b === last) return;
      last = b;
      let upto = 0;
      while (upto < T && r.traceBucket[upto] <= b) upto++;
      view.setExplore(r.trace, r.traceBucket, upto, front, rgb.accent);
      view.invalidate();
    });
  }
  await player.anim(tok, 800 * pace, p => { cur.p = ease(p); view.st.exploreA = 1 - 0.75 * p; view.invalidate(); });
  await player.anim(tok, 400 * pace, p => { view.st.exploreA = 0.25 * (1 - p); if (ghost) ghost.a = 1 - 0.3 * p; view.invalidate(); });
  for (const m of Object.values(minis)) { m.path = r.path; m.draw(); }
  await player.wait(tok, (run.iter ? 700 : 1600) * pace);
}

async function stepAcquire(tok, pace) {
  run.acq = acquire(scene, run.post.mu, run.post.sigma, run.routeNow.path, run.obs.map(o => o.cell));
  if (run.acq.stop) return false;
  await player.gate(tok);
  setNarr(5, {}, run.iter ? `iteration ${run.iter}` : '');
  view.setCorridor(run.acq.corridor, rgb.accent);
  minis.acq.set(run.acq.score, heatOpts('acq'));
  $('figAcq').classList.remove('pulse'); void $('figAcq').offsetWidth; $('figAcq').classList.add('pulse');
  await player.anim(tok, 600 * pace, p => { view.st.corridorA = p; minis.acq.mix = p; minis.acq.draw(); view.invalidate(); });
  const nx = { cell: run.acq.next, a: 0, phase: 0, label: true };
  view.st.next = nx;
  minis.acq.next = run.acq.next;
  await player.anim(tok, (run.iter ? 1300 : 2200) * pace, p => {
    nx.a = Math.min(1, p * 3); nx.phase = p * 4 * Math.PI;
    minis.acq.pulse = nx.phase; minis.acq.draw(); view.invalidate();
  });
  await player.wait(tok, (run.iter ? 400 : 1400) * pace);
  return true;
}

async function stepSingleSim(tok, pace) {
  await player.gate(tok);
  const n = run.obs.length + 1;
  setNarr(2, { single: true, n }, `iteration ${run.iter + 1}`);
  const res = await shot(run.acq.next);
  player.check(tok);
  await player.anim(tok, 300 * pace, p => { view.st.corridorA = 1 - p; view.st.next.a = 1 - p; view.invalidate(); });
  view.st.next = null;
  minis.acq.next = -1;
  await playShot(tok, res, n, false);
}

async function stepResult(tok) {
  await player.gate(tok);
  const r = run.routeNow, acq = run.acq;
  const n = run.obs.length;
  const w = clipWeights(run.post.mu, scene.comp);
  const costFinal = r.cost, costKB = pathCost(run.routeKB.path, w, N);
  const shift = routeShift(r.path, run.routeKB.path);
  setNarr(6, { reason: acq.stop, rel: acq.rel, n, len: r.length });
  $('summary').innerHTML = `
    <dl class="summary">
      <dt>simulations</dt><dd>${n} of ${(N * N).toLocaleString('en-US')} positions (${fmt(100 * n / (N * N), 2)} %)</dd>
      <dt>σ<sub>cum,rel</sub> along route</dt><dd>${fmt(100 * acq.rel, 1)} % ${acq.stop === 'converged' ? '(below 5 %)' : '(target 5 %)'}</dd>
      <dt>route length</dt><dd>${fmt(r.length, 0)} m</dd>
      <dt>cumulative danger</dt><dd>${fmt(costFinal, 3)} (Σ μ · step)</dd>
      <dt>vs first guess</dt><dd>${fmt(100 * shift, 0)} % of the route moved &gt; 2 m; the first guess would accumulate ${costKB > costFinal ? fmt(100 * (costKB / costFinal - 1), 0) + ' % more' : 'the same'} danger</dd>
    </dl>
    <p class="real">${REAL_PROJECT}</p>`;
  const cur = view.st.routes.find(x => x.style === 'main');
  view.st.routes = view.st.routes.filter(x => x.style === 'kb');
  const fin = { path: r.path, style: 'final', p: 1, a: 0 };
  view.st.routes.push(fin);
  await player.anim(tok, 600, p => { fin.a = p; if (cur) cur.a = 1 - p; view.st.exploreA = 0; view.invalidate(); });
  setPlaying(false, true);
}

// Number of steps whose durations are compressed after the first iterations, so a full run
// stays within ~90 s at 1×.
const paceFor = iter => (iter <= 1 ? 1 : 0.55);

async function experience(tok, A) {
  run.A = A; run.obs = []; run.post = null; run.routeNow = null; run.routeKB = null; run.acq = null; run.iter = 0;
  view.st.A = A; view.st.cursor = -1;
  setCounter(0);
  const t0 = performance.now();
  await stepKB(tok);
  await stepInitialSims(tok);
  for (;;) {
    const pace = paceFor(run.iter);
    await stepGP(tok, pace);
    await stepRoute(tok, pace);
    if (!(await stepAcquire(tok, pace))) break;
    await stepSingleSim(tok, pace);
    run.iter++;
  }
  await stepResult(tok);
  window.__demoRun = { ms: performance.now() - t0, n: run.obs.length, stop: run.acq.stop, rel: run.acq.rel, len: run.routeNow.length };
}

// ------------------------------------------------------------------ controls

function setPlaying(on, ended = false) {
  player.paused = !on;
  if (on) player.wake();
  $('iconPause').toggleAttribute('hidden', !on); $('iconPlay').toggleAttribute('hidden', on);   // SVG has no .hidden property
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  $('step').disabled = ended;
  state.ended = ended;
}
const state = { ended: false, picking: true };

async function start(A, fresh = true) {
  const tok = player.newRun();
  cancelPick?.(); cancelPick = null; pickResolver = null;
  view.reset();
  for (const m of Object.values(minis)) m.clear();
  setCounter(0);
  try {
    if (A === undefined) {
      // nothing plays yet: the play button offers to start from a suggested spot
      state.picking = true;
      setPlaying(false);
      $('play').setAttribute('aria-label', 'Start from a suggested spot');
      A = await chooseA(tok);
    }
    state.picking = false;
    setPlaying(true);
    await experience(tok, A);
  } catch (e) {
    if (!(e instanceof Cancelled)) { console.error(e); $('stepBody').textContent = 'Something went wrong: ' + e.message; }
  }
}

$('play').onclick = () => {
  if (state.picking) { tryPick(defaultStart(scene)); return; }
  if (state.ended) { start(run.A); return; }
  setPlaying(player.paused);
};
$('step').onclick = () => {
  if (state.picking) { tryPick(defaultStart(scene)); return; }
  player.step();
};
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  player.speed = Number(b.dataset.speed);
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
});
// "new start": a fresh random map (same generator rules), then the visitor picks A again.
// Reloading with a new seed also restarts the workers on the new scene.
function newMap() {
  const url = new URL(location.href);
  url.searchParams.set('seed', String(1 + Math.floor(Math.random() * 999999)));
  location.href = url.toString();
}
$('replay').onclick = newMap;
$('restart').onclick = () => (run.A >= 0 && !state.picking ? start(run.A) : start());

// Map interaction: click/tap to place A, hover/tap for the tooltip, arrows + Enter on the keyboard.
const mapEl = $('map');
mapEl.addEventListener('click', e => {
  const c = view.cellAt(e.clientX, e.clientY);
  if (state.picking) tryPick(c);
});
mapEl.addEventListener('pointermove', e => showTip(view.cellAt(e.clientX, e.clientY), e));
mapEl.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') showTip(view.cellAt(e.clientX, e.clientY), e); });
mapEl.addEventListener('pointerleave', () => { $('tip').hidden = true; view.st.hover = -1; view.invalidate(); });
mapEl.addEventListener('keydown', e => {
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -N, ArrowDown: N };
  if (e.key in moves) {
    e.preventDefault();
    let c = view.st.cursor >= 0 ? view.st.cursor : scene.B;
    const x = c % N, y = (c / N) | 0, d = moves[e.key], step = e.shiftKey ? 5 : 1;
    const nx = Math.max(0, Math.min(N - 1, x + (Math.abs(d) === 1 ? d * step : 0)));
    const ny = Math.max(0, Math.min(N - 1, y + (Math.abs(d) === N ? Math.sign(d) * step : 0)));
    c = ny * N + nx;
    view.st.cursor = c;
    view.invalidate();
    const r = mapEl.getBoundingClientRect(), [px, py] = view.px(c);
    showTip(c, { clientX: r.left + px, clientY: r.top + py });
  } else if ((e.key === 'Enter' || e.key === ' ') && state.picking) {
    e.preventDefault();
    tryPick(view.st.cursor >= 0 ? view.st.cursor : -1);
  }
});
document.addEventListener('keydown', e => {
  if (e.target !== document.body) return;
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); $('play').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('step').click(); }
});

function showTip(c, e) {
  const tip = $('tip');
  view.st.hover = c;
  view.invalidate();
  if (c < 0) { tip.hidden = true; return; }
  const x = c % N, y = (c / N) | 0, f = v => (v == null ? '–' : fmt(v, 4));
  let html = `<b>x</b> ${x}.5 m · <b>y</b> ${y}.5 m`;
  if (scene.bid[c] >= 0) {
    const b = scene.buildings[scene.bid[c]];
    html += `<br>${CATEGORIES[b.cat].label} · importance ×${b.d}`;
  } else {
    html += `<br><b>s_KB</b> ${run.sKB ? f(run.sKB[c]) : '–'}`;
    html += `<br><b>μ</b> ${run.post ? f(run.post.mu[c]) : '–'} · <b>σ</b> ${run.post ? f(run.post.sigma[c]) : '–'}`;
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const wrap = $('mapWrap').getBoundingClientRect();
  let lx = e.clientX - wrap.left + 14, ly = e.clientY - wrap.top + 14;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  if (lx + tw > wrap.width) lx = e.clientX - wrap.left - tw - 10;
  if (ly + th > wrap.height) ly = e.clientY - wrap.top - th - 10;
  tip.style.left = Math.max(0, lx) + 'px';
  tip.style.top = Math.max(0, ly) + 'px';
}

// ------------------------------------------------------------------ layout, theme, embedding

function relayout() {
  view.resize();
  for (const m of Object.values(minis)) m.resize();
  updateLegends();
}
new ResizeObserver(() => relayout()).observe($('mapWrap'));
new ResizeObserver(() => { for (const m of Object.values(minis)) m.resize(); updateLegends(); }).observe($('minis'));

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  refreshColours();
  // re-paint the fields in the new ramps
  if (run.post) { view.setHeat(run.post.mu, heatOpts('danger'), lut.danger); view.st.heatPrevA = 0; }
  else if (run.sKB) { view.setHeat(run.sKB, heatOpts('danger'), lut.danger); view.st.heatPrevA = 0; }
  relayout();
  if (run.post) { minis.mu.set(run.post.mu, heatOpts('danger')); minis.sigma.set(run.post.sigma, heatOpts('sigma')); minis.mu.mix = minis.sigma.mix = 1; }
  if (run.acq) { minis.acq.set(run.acq.score, heatOpts('acq')); minis.acq.mix = 1; }
  for (const m of Object.values(minis)) m.draw();
});

// Tell an embedding page how tall the demo is, so the iframe can fit it.
if (window.parent !== window) {
  new ResizeObserver(() => {
    window.parent.postMessage({ type: 'blast-demo:height', height: Math.ceil(document.documentElement.scrollHeight) }, '*');
  }).observe(document.body);
}

refreshColours();
fillInfo();
view.setScene(scene);
for (const m of Object.values(minis)) m.setScene(scene);
updateLegends();
writeSeed(seed);
start();
