// Synthetic peri-urban scene: roads, an open area, 10–14 buildings in four categories,
// the disposal site B and the facade probes. Pure functions, no DOM.
//
// Grid: N × N cells of 1 m, row-major, cell index = y * N + x, cell centre at (x + 0.5, y + 0.5) m.

import { makeRng, mulberry32 } from './rng.js';
import { D_K } from './scoring.js';

export const N = 80;
export const FOOTPRINT_TARGET = 0.20;
export const FOOTPRINT_TOL = 0.03;

export const CATEGORIES = {
  1: { label: 'Secondary', examples: 'sheds, garages, small warehouse', d: D_K[1] },
  2: { label: 'Residential / economic', examples: 'houses, small shops, offices', d: D_K[2] },
  3: { label: 'Collective', examples: 'school, gym, community hall', d: D_K[3] },
  4: { label: 'Strategic', examples: 'clinic or fire station', d: D_K[4] },
};

// [[w min, w max], [h min, h max]] in metres, before an optional 90° rotation.
const SIZE = { 1: [[5, 15], [6, 20]], 2: [[8, 12], [9, 14]], 3: [[15, 20], [20, 30]], 4: [[12, 16], [15, 20]] };

// Tries the seed itself, then the next seeds of a stream derived from it, until a layout
// meets every rule. (Derived rather than seed + 1, so neighbouring seeds give different maps.)
export function generateScene(seed, maxAttempts = 400) {
  seed >>>= 0;
  const next = mulberry32(seed ^ 0x9E3779B9);
  for (let k = 0, s = seed; k < maxAttempts; k++, s = (next() * 4294967296) >>> 0) {
    const sc = tryLayout(s);
    if (sc) { sc.seed = seed; sc.attempts = k + 1; return sc; }
  }
  throw new Error('scene generation failed for seed ' + seed);
}

// ---------- small grid helpers ----------

function satOf(mask) {
  const S = new Int32Array((N + 1) * (N + 1));
  for (let y = 0; y < N; y++) {
    let row = 0;
    for (let x = 0; x < N; x++) {
      row += mask[y * N + x] ? 1 : 0;
      S[(y + 1) * (N + 1) + x + 1] = S[y * (N + 1) + x + 1] + row;
    }
  }
  return S;
}

// Number of set cells in the rectangle, clipped to the grid.
function rectSum(S, x, y, w, h) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(N, x + w), y1 = Math.min(N, y + h);
  if (x1 <= x0 || y1 <= y0) return 0;
  const W = N + 1;
  return S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0];
}

// 4-neighbour BFS distance (in cells) to the set cells of `mask`.
function bfsDist(mask) {
  const d = new Int32Array(N * N).fill(1 << 20);
  const q = new Int32Array(N * N);
  let h = 0, t = 0;
  for (let i = 0; i < N * N; i++) if (mask[i]) { d[i] = 0; q[t++] = i; }
  while (h < t) {
    const i = q[h++], x = i % N, y = (i / N) | 0, nd = d[i] + 1;
    if (x > 0 && d[i - 1] > nd) { d[i - 1] = nd; q[t++] = i - 1; }
    if (x < N - 1 && d[i + 1] > nd) { d[i + 1] = nd; q[t++] = i + 1; }
    if (y > 0 && d[i - N] > nd) { d[i - N] = nd; q[t++] = i - N; }
    if (y < N - 1 && d[i + N] > nd) { d[i + N] = nd; q[t++] = i + N; }
  }
  return d;
}

function rectMin(arr, x, y, w, h) {
  let m = Infinity;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m = Math.min(m, arr[j * N + i]);
  return m;
}

function fillRect(grid, r, v, onlyEmpty = false) {
  for (let j = Math.max(0, r.y); j < Math.min(N, r.y + r.h); j++)
    for (let i = Math.max(0, r.x); i < Math.min(N, r.x + r.w); i++)
      if (!onlyEmpty || !grid[j * N + i]) grid[j * N + i] = v;
}

function dilate(mask, r) {
  const out = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (mask[i]) {
    const x = i % N, y = (i / N) | 0;
    for (let j = Math.max(0, y - r); j <= Math.min(N - 1, y + r); j++)
      for (let k = Math.max(0, x - r); k <= Math.min(N - 1, x + r); k++) out[j * N + k] = 1;
  }
  return out;
}

// Free cells strictly between two rectangles along the axis that separates them.
function rectGap(a, b) {
  const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.max(gx, gy);
}

// 4-connected components of free cells. Returns labels (−1 on buildings) and component sizes.
export function components(free) {
  const lab = new Int32Array(N * N).fill(-1);
  const sizes = [];
  const q = new Int32Array(N * N);
  for (let s = 0; s < N * N; s++) {
    if (!free[s] || lab[s] >= 0) continue;
    const c = sizes.length;
    let h = 0, t = 0;
    q[t++] = s; lab[s] = c;
    while (h < t) {
      const i = q[h++], x = i % N, y = (i / N) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1];
      for (const j of nb) if (j >= 0 && free[j] && lab[j] < 0) { lab[j] = c; q[t++] = j; }
    }
    sizes.push(t);
  }
  return { lab, sizes };
}

// ---------- layout ----------

function tryLayout(s) {
  const rng = makeRng(s);
  const transpose = rng.chance(0.5);

  // Roads, in a frame where the main road is horizontal.
  const roads = [];
  const mw = rng.int(6, 8);
  const my = rng.int(28, 52 - mw);
  roads.push({ x: 0, y: my, w: N, h: mw, kind: 1 });
  const sw1 = rng.int(4, 5);
  const sx1 = rng.int(20, 60 - sw1);
  roads.push({ x: sx1, y: 0, w: sw1, h: N, kind: 2 });
  if (rng.chance(0.6)) {
    const sw2 = rng.int(4, 5);
    const xs = [];
    for (let x = 10; x <= N - 10 - sw2; x++) if (x + sw2 <= sx1 - 18 || x >= sx1 + sw1 + 18) xs.push(x);
    if (xs.length) {
      const x2 = rng.pick(xs);
      roads.push(rng.chance(0.5)
        ? { x: x2, y: 0, w: sw2, h: my, kind: 2 }
        : { x: x2, y: my + mw, w: sw2, h: N - my - mw, kind: 2 });
    }
  }
  const road = new Uint8Array(N * N);
  for (const r of roads) fillRect(road, r, r.kind, true);   // main road first keeps priority
  const roadDist = bfsDist(road);
  const mainDist = bfsDist(road.map(v => v === 1 ? 1 : 0));
  const roadKeep = dilate(road, 1);

  // Open area: a square lot (≥ 15 m) set back 1–2 m from a road.
  const O = rng.int(16, 20);
  const roadSat = satOf(roadKeep);
  const spots = [];
  for (let y = 1; y + O <= N - 1; y++) for (let x = 1; x + O <= N - 1; x++) {
    if (rectSum(roadSat, x, y, O, O)) continue;
    const d = Math.min(rectMin(roadDist, x, y, O, 1), rectMin(roadDist, x, y + O - 1, O, 1),
      rectMin(roadDist, x, y, 1, O), rectMin(roadDist, x + O - 1, y, 1, O));
    if (d <= 3) spots.push([x, y]);
  }
  if (!spots.length) return null;
  const [fx, fy] = rng.pick(spots);
  const field = { x: fx, y: fy, w: O, h: O, label: rng.chance(0.5) ? 'sports field' : 'vacant lot' };

  const noBuild = roadKeep.slice();
  fillRect(noBuild, { x: field.x - 1, y: field.y - 1, w: field.w + 2, h: field.h + 2 }, 1);
  const noBuildSat = satOf(noBuild);

  // Building programme: counts per category, then sizes nudged toward the footprint target.
  const n = rng.int(10, 14);
  const c3 = rng.chance(0.3) ? 2 : 1;
  const rest = n - 1 - c3;
  const c2 = Math.round(rest * 55 / 85), c1 = rest - c2;
  const specs = [];
  const dims = cat => {
    const [[w0, w1], [h0, h1]] = SIZE[cat];
    const sk = cat === 1 ? 2 : cat === 3 ? 1.5 : 1;   // skew toward small sheds and compact schools
    return { cat, w: w0 + Math.round((w1 - w0) * rng.next() ** sk), h: h0 + Math.round((h1 - h0) * rng.next() ** sk) };
  };
  for (let k = 0; k < c3; k++) specs.push(dims(3));
  specs.push(dims(4));
  for (let k = 0; k < c2; k++) specs.push(dims(2));
  for (let k = 0; k < c1; k++) specs.push(dims(1));

  const target = rng.range(FOOTPRINT_TARGET - 0.015, FOOTPRINT_TARGET + 0.015) * N * N;
  let total = specs.reduce((a, b) => a + b.w * b.h, 0);
  for (let it = 0; it < 4000 && Math.abs(total - target) > 10; it++) {
    const b = rng.pick(specs), [[w0, w1], [h0, h1]] = SIZE[b.cat], onW = rng.chance(0.5);
    if (total > target) {
      if (onW && b.w > w0) { b.w--; total -= b.h; } else if (!onW && b.h > h0) { b.h--; total -= b.w; }
    } else {
      if (onW && b.w < w1) { b.w++; total += b.h; } else if (!onW && b.h < h1) { b.h++; total += b.w; }
    }
  }
  if (Math.abs(total - target) > 40) return null;

  // Placement: collective buildings by the open area, the strategic one on the main road,
  // houses along the roads, sheds toward the edges and the back of lots.
  const occ = new Uint8Array(N * N);
  let occSat = satOf(occ);
  const order = [...specs.filter(b => b.cat === 3), ...specs.filter(b => b.cat === 4),
    ...specs.filter(b => b.cat === 2).sort((a, b) => b.w * b.h - a.w * a.h), ...specs.filter(b => b.cat === 1)];
  const placed = [];
  for (const b of order) {
    let best = null, bestScore = -Infinity;
    for (let t = 0; t < 700; t++) {
      const rot = rng.chance(0.5), w = rot ? b.h : b.w, h = rot ? b.w : b.h;
      if (w > N - 2 || h > N - 2) continue;
      const x = rng.int(1, N - 1 - w), y = rng.int(1, N - 1 - h);
      if (rectSum(noBuildSat, x, y, w, h)) continue;
      if (rectSum(occSat, x - 2, y - 2, w + 4, h + 4)) continue;         // ≥ 2 m between buildings
      const r = { x, y, w, h };
      let score;
      if (b.cat === 4) {
        const dm = rectMin(mainDist, x, y, w, h);
        if (dm > 4) continue;                                           // fronts the main road
        score = rng.next();
      } else if (b.cat === 3) {
        const gf = rectGap(r, field);
        if (gf > 5) continue;                                           // next to the open area
        score = -gf + rng.next();
      } else if (b.cat === 2) {
        if (rectMin(roadDist, x, y, w, h) > 4) continue;                // fronts a road (1–3 m setback)
        score = rng.next() + (rectSum(occSat, x - 4, y - 4, w + 8, h + 8) ? 0.7 : 0);
      } else {
        const back = rectMin(roadDist, x, y, w, h);
        const edge = Math.min(x, y, N - x - w, N - y - h);
        score = 0.15 * Math.min(back, 12) - 0.2 * edge + 2 * rng.next();
      }
      if (score > bestScore) { bestScore = score; best = { cat: b.cat, ...r }; }
    }
    if (!best) return null;
    placed.push(best);
    fillRect(occ, best, 1);
    occSat = satOf(occ);
  }

  // Back to the final orientation.
  const tr = r => transpose ? { ...r, x: r.y, y: r.x, w: r.h, h: r.w } : { ...r };
  return finalize(roads.map(tr), tr(field), placed.map(tr), transpose);
}

function finalize(roads, field, rects, transposed) {
  const road = new Uint8Array(N * N);
  for (const r of roads.filter(r => r.kind === 1)) fillRect(road, r, 1);
  for (const r of roads.filter(r => r.kind === 2)) fillRect(road, r, 2, true);

  const bid = new Int16Array(N * N).fill(-1);
  const buildings = rects.map((r, id) => ({
    id, cat: r.cat, x: r.x, y: r.y, w: r.w, h: r.h, area: r.w * r.h,
    cx: r.x + r.w / 2, cy: r.y + r.h / 2, d: D_K[r.cat],
  }));
  for (const b of buildings) fillRect(bid, b, b.id);

  const free = new Uint8Array(N * N);
  let built = 0;
  for (let i = 0; i < N * N; i++) { free[i] = bid[i] < 0 ? 1 : 0; built += 1 - free[i]; }
  const footprint = built / (N * N);
  if (Math.abs(footprint - FOOTPRINT_TARGET) > FOOTPRINT_TOL) return null;

  const { lab, sizes } = components(free);
  if (sizes.length !== 1) return null;   // free space must be 4-connected
  let big = 0;
  for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[big]) big = c;
  const comp = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) comp[i] = lab[i] === big ? 1 : 0;

  const dist = distanceToBuildings(bid);
  const B = chooseDisposal(dist, comp);
  const probes = buildProbes(bid, buildings);
  if (probes.count.some(c => c < 4)) return null;

  return { N, roads, field, buildings, bid, free, comp, road, dist, B, probes, footprint, transposed };
}

// Exact Euclidean distance (m, centre to centre) from every cell to the nearest building cell.
export function distanceToBuildings(bid) {
  const bx = [], by = [];
  for (let i = 0; i < N * N; i++) if (bid[i] >= 0) { bx.push(i % N); by.push((i / N) | 0); }
  const d = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (bid[i] >= 0) continue;
    const x = i % N, y = (i / N) | 0;
    let m = Infinity;
    for (let k = 0; k < bx.length; k++) {
      const dx = bx[k] - x, dy = by[k] - y, q = dx * dx + dy * dy;
      if (q < m) m = q;
    }
    d[i] = Math.sqrt(m);
  }
  return d;
}

// B = argmax of the distance transform over the largest free component, at least 3 m
// from the border; ties go to the cell closest to the domain centre, then the lowest index.
export function chooseDisposal(dist, comp) {
  let best = -1, bd = -1, bc = Infinity;
  for (let i = 0; i < N * N; i++) {
    if (!comp[i]) continue;
    const cx = (i % N) + 0.5, cy = ((i / N) | 0) + 0.5;
    if (cx < 3 || cy < 3 || cx > N - 3 || cy > N - 3) continue;
    const dc = (cx - N / 2) ** 2 + (cy - N / 2) ** 2;
    if (dist[i] > bd || (dist[i] === bd && dc < bc)) { best = i; bd = dist[i]; bc = dc; }
  }
  return best;
}

// Facade probes: free cells 4-adjacent to a building, keeping one in two along each facade
// (cells with x + y even), i.e. one probe every 2 m.
export function buildProbes(bid, buildings) {
  const cell = [], bld = [];
  const count = new Int32Array(buildings.length);
  for (const b of buildings) {
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N || (x + y) % 2) continue;
      const i = y * N + x;
      if (bid[i] >= 0) continue;
      const touches = (x > 0 && bid[i - 1] === b.id) || (x < N - 1 && bid[i + 1] === b.id) ||
        (y > 0 && bid[i - N] === b.id) || (y < N - 1 && bid[i + N] === b.id);
      if (touches) { cell.push(i); bld.push(b.id); count[b.id]++; }
    }
  }
  return { cell: Int32Array.from(cell), bld: Int16Array.from(bld), count };
}

// Free cells of the main component, as a list.
export function freeCells(scene) {
  const out = [];
  for (let i = 0; i < N * N; i++) if (scene.comp[i]) out.push(i);
  return Int32Array.from(out);
}

// A sensible start if the visitor presses play without choosing: the road cell farthest from B.
export function defaultStart(scene) {
  const bx = scene.B % N, by = (scene.B / N) | 0;
  let best = -1, bd = -1;
  for (let i = 0; i < N * N; i++) {
    if (!scene.comp[i] || !scene.road[i]) continue;
    const x = i % N, y = (i / N) | 0;
    if (x < 3 || y < 3 || x > N - 4 || y > N - 4) continue;
    const d = (x - bx) ** 2 + (y - by) ** 2;
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}
