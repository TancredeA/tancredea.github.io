// Cheap surrogate: empirical blast law (Kinney–Graham, a Kingery–Bulmash-type
// scaled-distance law) with building masking. Pure functions, no DOM.

import { N } from './scene.js';
import { damage, D_K, scoreMax } from './scoring.js';

export const P_ATM = 101.325;        // kPa
export const MASK_FACTOR = 0.8;      // per building crossed by the source–probe segment
export const R_MIN = 1;              // m

// Kinney & Graham (1985) incident overpressure, kPa, at scaled distance Z (m·kg^-1/3).
export function kinneyGraham(Z) {
  const a = Z / 4.5, b = Z / 0.048, c = Z / 0.32, d = Z / 1.35;
  return P_ATM * 808 * (1 + a * a) / Math.sqrt((1 + b * b) * (1 + c * c) * (1 + d * d));
}

// Free-field peak overpressure (hPa) at distance R (m) from a charge of W kg TNT.
export function overpressureHpa(R, W) {
  return 10 * kinneyGraham(Math.max(R, R_MIN) / Math.cbrt(W));
}

// Charge W (kg TNT) such that the overpressure equals pHpa at distance R.
export function solveCharge(R = 50, pHpa = 20) {
  const target = pHpa / 10;              // kPa
  let lo = 0.05, hi = 500;               // kinneyGraham is decreasing in Z
  for (let k = 0; k < 200; k++) {
    const mid = Math.sqrt(lo * hi);
    if (kinneyGraham(mid) > target) lo = mid; else hi = mid;
  }
  const Z = Math.sqrt(lo * hi);
  return (R / Z) ** 3;
}

// Distance at which the free-field overpressure drops to pHpa (used for labels and pruning).
export function radiusFor(pHpa, W) {
  let lo = R_MIN, hi = 1000;
  for (let k = 0; k < 100; k++) {
    const mid = 0.5 * (lo + hi);
    if (overpressureHpa(mid, W) > pHpa) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// Number of distinct buildings crossed by the segment between two cell centres
// (Amanatides–Woo grid traversal). `stamp` is scratch space indexed by building id.
export function buildingsCrossed(bid, i0, i1, stamp, tag) {
  let x = i0 % N, y = (i0 / N) | 0;
  const x1 = i1 % N, y1 = (i1 / N) | 0;
  const dx = x1 - x, dy = y1 - y;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity;
  let tx = tdx / 2, ty = tdy / 2;       // the segment starts at a cell centre
  let n = 0;
  while (x !== x1 || y !== y1) {
    if (tx < ty) { tx += tdx; x += sx; }
    else if (ty < tx) { ty += tdy; y += sy; }
    else { tx += tdx; ty += tdy; x += sx; y += sy; }   // exact corner: step diagonally
    const b = bid[y * N + x];
    if (b >= 0 && stamp[b] !== tag) { stamp[b] = tag; n++; }
  }
  return n;
}

// KB score S(x) for a source at cell `src`. `reach` prunes probes beyond the 20 hPa radius
// (masking only lowers pressure, so they contribute g = 0).
export function kbScoreAt(scene, W, src, reach = radiusFor(20, W), stamp = new Int32Array(scene.buildings.length), sum = new Float64Array(scene.buildings.length)) {
  const { probes, buildings, bid } = scene;
  const sx = src % N, sy = (src / N) | 0;
  sum.fill(0);
  for (let j = 0; j < probes.cell.length; j++) {
    const c = probes.cell[j], dx = (c % N) - sx, dy = ((c / N) | 0) - sy;
    const R = Math.sqrt(dx * dx + dy * dy);
    if (R >= reach) continue;
    const tag = src * 4096 + j + 1;
    const nb = buildingsCrossed(bid, src, c, stamp, tag);
    sum[probes.bld[j]] += damage(overpressureHpa(R, W) * MASK_FACTOR ** nb);
  }
  let S = 0;
  for (const b of buildings) S += D_K[b.cat] * sum[b.id] / probes.count[b.id];
  return S;
}

// Normalised KB danger s_KB = S / S_max over all free cells (0 on buildings).
export function kbMap(scene, W, onProgress) {
  const s = new Float32Array(N * N);
  const Smax = scoreMax(scene.buildings);
  const reach = radiusFor(20, W);
  const stamp = new Int32Array(scene.buildings.length).fill(-1);
  const sum = new Float64Array(scene.buildings.length);
  for (let i = 0; i < N * N; i++) {
    if (!scene.free[i]) continue;
    s[i] = kbScoreAt(scene, W, i, reach, stamp, sum) / Smax;
    if (onProgress && i % (N * 8) === 0) onProgress(i / (N * N));
  }
  return s;
}
