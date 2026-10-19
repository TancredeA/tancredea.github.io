// Expensive-simulator stand-in: 2D linear acoustics on a staggered grid (FDTD).
// Pressure at cell centres, velocities on faces, rigid buildings, quadratic sponge layer.
// A toy oracle: linear, no shocks. Pure functions, no DOM.

import { N } from './scene.js';
import { overpressureHpa } from './kb.js';
import { scoreFromProbes, scoreMax } from './scoring.js';

export const C0 = 343;          // m/s
export const RHO = 1;           // the solver is linear: only ratios matter
export const DX = 0.5;          // m
export const SPONGE = 20;       // cells
export const R_REF = 2;         // m, reference radius of the spreading correction
export const FIT_RANGE = [3, 40];

// Calibration from the 2D field to a blast-like field.
//  'curve'  (default): spreading and amplitude corrected by the free-field profile, so an
//           empty domain reproduces the blast law exactly and buildings only add the residual.
//  'scalar': the spec's single factor, alpha · sqrt(R_REF / r) · peak. Kept for comparison.
export const CAL_MODE = 'curve';

export function makeSolver(bid, { dx = DX, sponge = SPONGE } = {}) {
  const f = Math.round(1 / dx);               // solver cells per metre
  const NI = N * f, NX = NI + 2 * sponge;
  const dt = 0.9 * dx / (C0 * Math.SQRT2);    // 2D CFL with a 0.9 safety factor

  const solid = new Uint8Array(NX * NX);
  if (bid) for (let j = 0; j < NI; j++) for (let i = 0; i < NI; i++)
    if (bid[((j / f) | 0) * N + ((i / f) | 0)] >= 0) solid[(j + sponge) * NX + i + sponge] = 1;

  // Quadratic damping ramp in the sponge; sigma_max chosen for ~1e-3 nominal reflection.
  const sigMax = 3 * C0 / (2 * sponge * dx) * Math.log(1000);
  const sig = new Float32Array(NX * NX);
  for (let j = 0; j < NX; j++) for (let i = 0; i < NX; i++) {
    const d = Math.max(sponge - i, i - (NX - 1 - sponge), sponge - j, j - (NX - 1 - sponge), 0);
    sig[j * NX + i] = sigMax * (d / sponge) ** 2;
  }
  const fc = new Float32Array(NX * NX);
  for (let k = 0; k < NX * NX; k++) fc[k] = Math.exp(-sig[k] * dt);
  // Face factors: damping, and zero normal velocity on any face touching a building or the outer edge.
  const fx = new Float32Array((NX + 1) * NX);
  for (let j = 0; j < NX; j++) for (let i = 1; i < NX; i++) {
    const a = j * NX + i - 1, b = a + 1;
    fx[j * (NX + 1) + i] = solid[a] || solid[b] ? 0 : Math.exp(-0.5 * (sig[a] + sig[b]) * dt);
  }
  const fy = new Float32Array(NX * (NX + 1));
  for (let j = 1; j < NX; j++) for (let i = 0; i < NX; i++) {
    const a = (j - 1) * NX + i, b = j * NX + i;
    fy[j * NX + i] = solid[a] || solid[b] ? 0 : Math.exp(-0.5 * (sig[a] + sig[b]) * dt);
  }
  const tEnd = 1.3 * Math.hypot(N, N) / C0;
  return { f, NI, NX, sponge, dx, dt, fx, fy, fc, solid, steps: Math.ceil(tEnd / dt) };
}

// One run from the centre of analysis cell `cell`. Returns the peak pressure per solver cell
// of the domain (NI × NI) and, optionally, frames of the pressure field every `frameEvery` steps.
export function runShot(sol, cell, { frameEvery = 8, frames = false, energy = false } = {}) {
  const { f, NI, NX, sponge: off, dx, dt, fx, fy, fc, steps } = sol;
  const p = new Float32Array(NX * NX);
  const vx = new Float32Array((NX + 1) * NX);
  const vy = new Float32Array(NX * (NX + 1));
  const peak = new Float32Array(NI * NI);
  const kv = dt / (RHO * dx), kp = RHO * C0 * C0 * dt / dx;

  // The analysis-cell centre is the shared corner of an f × f block of solver cells.
  const cx = cell % N, cy = (cell / N) | 0;
  const src = [];
  for (let b = 0; b < f; b++) for (let a = 0; a < f; a++) src.push((off + cy * f + b) * NX + off + cx * f + a);
  const tau = 4 * dx / C0, t0 = 3 * tau;      // Gaussian pulse, width ≈ 4 cells / c

  const nFrames = frames ? Math.floor((steps - 1) / frameEvery) + 1 : 0;
  const frameBuf = frames ? new Float32Array(nFrames * NI * NI) : null;
  const energyTrace = energy ? [] : null;
  const W1 = NX + 1;

  for (let s = 0; s < steps; s++) {
    for (let j = 0; j < NX; j++) {
      const rp = j * NX, rv = j * W1;
      for (let i = 1; i < NX; i++) {
        const k = rv + i;
        vx[k] = (vx[k] - kv * (p[rp + i] - p[rp + i - 1])) * fx[k];
      }
    }
    for (let j = 1; j < NX; j++) {
      const rp = j * NX;
      for (let i = 0; i < NX; i++) {
        const k = rp + i;
        vy[k] = (vy[k] - kv * (p[k] - p[k - NX])) * fy[k];
      }
    }
    for (let j = 0; j < NX; j++) {
      const rp = j * NX, rv = j * W1;
      for (let i = 0; i < NX; i++) {
        const c = rp + i;
        p[c] = (p[c] - kp * (vx[rv + i + 1] - vx[rv + i] + vy[c + NX] - vy[c])) * fc[c];
      }
    }
    const t = (s + 1) * dt, q = Math.exp(-(((t - t0) / tau) ** 2)) / src.length;
    for (const c of src) p[c] += q;

    for (let j = 0; j < NI; j++) {
      const rp = (j + off) * NX + off, rk = j * NI;
      for (let i = 0; i < NI; i++) if (p[rp + i] > peak[rk + i]) peak[rk + i] = p[rp + i];
    }
    if (frames && s % frameEvery === 0) {
      const base = (s / frameEvery) * NI * NI;
      for (let j = 0; j < NI; j++) frameBuf.set(p.subarray((j + off) * NX + off, (j + off) * NX + off + NI), base + j * NI);
    }
    if (energy && s % 10 === 0) {
      let e = 0;
      for (let k = 0; k < p.length; k++) e += p[k] * p[k] / (RHO * C0 * C0);
      for (let k = 0; k < vx.length; k++) e += RHO * vx[k] * vx[k];
      for (let k = 0; k < vy.length; k++) e += RHO * vy[k] * vy[k];
      energyTrace.push(0.5 * e * dx * dx);
    }
  }
  return { peak, frames: frameBuf, nFrames, frameSize: NI, frameDt: frameEvery * dt, steps, energy: energyTrace };
}

// Peak per 1 m analysis cell: mean of its f × f solver cells.
export function cellPeaks(sol, peak) {
  const { f, NI } = sol, out = new Float32Array(N * N);
  for (let j = 0; j < NI; j++) for (let i = 0; i < NI; i++) out[((j / f) | 0) * N + ((i / f) | 0)] += peak[j * NI + i];
  for (let k = 0; k < N * N; k++) out[k] /= f * f;
  return out;
}

const BIN = 0.25;   // m

// Calibrates against a run in an empty domain from cell `src`: the free-field raw peak as a
// function of r (binned), and the single scalar alpha (least squares on log p over FIT_RANGE).
export function calibrate(freeCellPeaks, src, W) {
  const sx = src % N, sy = (src / N) | 0;
  const nb = Math.ceil(Math.hypot(N, N) / BIN) + 2;
  const sum = new Float64Array(nb), cnt = new Float64Array(nb);
  let la = 0, ln = 0;
  for (let k = 0; k < N * N; k++) {
    const r = Math.hypot((k % N) - sx, ((k / N) | 0) - sy), q = freeCellPeaks[k];
    const b = Math.round(r / BIN);
    sum[b] += q; cnt[b]++;
    if (r >= FIT_RANGE[0] && r <= FIT_RANGE[1]) {
      la += Math.log(overpressureHpa(r, W)) - Math.log(Math.sqrt(R_REF / r) * q);
      ln++;
    }
  }
  // Fill empty bins by linear interpolation; extrapolate past the last one as a 2D field (r^-1/2).
  const table = new Float64Array(nb);
  let last = -1;
  for (let b = 0; b < nb; b++) {
    if (!cnt[b]) continue;
    table[b] = sum[b] / cnt[b];
    if (last >= 0) for (let m = last + 1; m < b; m++) table[m] = table[last] + (table[b] - table[last]) * (m - last) / (b - last);
    last = b;
  }
  for (let b = last + 1; b < nb; b++) table[b] = table[last] * Math.sqrt(last / b);
  if (!cnt[0]) table[0] = table[1];
  return { table, bin: BIN, alpha: Math.exp(la / ln), mode: CAL_MODE };
}

export function freePeakAt(cal, r) {
  const x = r / cal.bin, b = Math.floor(x), n = cal.table.length;
  if (b >= n - 1) return cal.table[n - 1] * Math.sqrt((n - 1) / x);
  return cal.table[b] + (cal.table[b + 1] - cal.table[b]) * (x - b);
}

// Blast-like peak overpressure (hPa) from a raw 2D peak q at distance r.
export function correctedHpa(cal, W, q, r, mode = cal.mode) {
  if (mode === 'scalar') return cal.alpha * Math.sqrt(R_REF / Math.max(r, 0.5)) * q;
  return overpressureHpa(r, W) * q / freePeakAt(cal, r);
}

// Corrected peak field (hPa) of one shot, and its damage score through the same probes as KB.
export function shotScore(scene, cal, W, cellPk, src, mode = cal.mode) {
  const sx = src % N, sy = (src / N) | 0;
  const field = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) {
    if (!scene.free[k]) continue;
    field[k] = correctedHpa(cal, W, cellPk[k], Math.hypot((k % N) - sx, ((k / N) | 0) - sy), mode);
  }
  const pr = scene.probes, p = new Float64Array(pr.cell.length);
  for (let j = 0; j < p.length; j++) p[j] = field[pr.cell[j]];
  const S = scoreFromProbes(pr, scene.buildings, p);
  return { S, s: S / scoreMax(scene.buildings), field };
}

// Largest relative error of the calibrated free field against the blast law over FIT_RANGE.
export function freeFieldError(cal, W, freeCellPeaks, src, mode = cal.mode) {
  const sx = src % N, sy = (src / N) | 0;
  let worst = 0;
  for (let k = 0; k < N * N; k++) {
    const r = Math.hypot((k % N) - sx, ((k / N) | 0) - sy);
    if (r < FIT_RANGE[0] || r > FIT_RANGE[1]) continue;
    const e = Math.abs(correctedHpa(cal, W, freeCellPeaks[k], r, mode) / overpressureHpa(r, W) - 1);
    if (e > worst) worst = e;
  }
  return worst;
}

export const CAL_SOURCE = (N / 2) * N + N / 2;   // calibration source: domain centre
