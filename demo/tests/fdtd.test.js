import test from 'node:test';
import assert from 'node:assert/strict';
import { N } from '../js/scene.js';
import { makeSolver, runShot, cellPeaks, calibrate, freeFieldError, CAL_SOURCE } from '../js/fdtd.js';

const W = 1.6;
const empty = makeSolver(null);
const free0 = cellPeaks(empty, runShot(empty, CAL_SOURCE).peak);
const cal = calibrate(free0, CAL_SOURCE, W);

test('no blow-up over the full run (bounded energy)', () => {
  const sol = makeSolver(wallScene());
  const r = runShot(sol, 40 * N + 30, { energy: true });
  const e = r.energy;
  assert.ok(e.every(Number.isFinite));
  assert.ok(r.peak.every(Number.isFinite));
  // After the source has stopped (~35 ms, i.e. ~40 steps) the energy may only stay level
  // (to within the ~1 % wobble of a staggered-grid energy measure) or decay into the sponge.
  const ref = e[4];
  for (let k = 5; k < e.length; k++) assert.ok(e[k] <= ref * 1.02, `energy grows at sample ${k}`);
  assert.ok(e[e.length - 1] < 0.01 * ref, 'sponge should absorb the energy');
});

test('calibrated free field within ±15 % of the blast law for r in [3, 40] m', () => {
  const src = 25 * N + 22;   // a different source than the calibration one
  const pk = cellPeaks(empty, runShot(empty, src).peak);
  const err = freeFieldError(cal, W, pk, src, 'curve');
  assert.ok(err < 0.15, `max error ${(100 * err).toFixed(1)} %`);
});

test('a wall produces a measurable shadow behind it', () => {
  const sol = makeSolver(wallScene());
  const src = 40 * N + 30;
  const pk = cellPeaks(sol, runShot(sol, src).peak);
  const behind = 40 * N + 52, ref = 40 * N + 52;
  const pkFree = cellPeaks(empty, runShot(empty, src).peak);
  const ratio = pk[behind] / pkFree[ref];
  assert.ok(ratio < 0.6, `shadow ratio ${ratio.toFixed(2)}`);
  // and the facade facing the source sees reflection (pressure doubling, roughly)
  const front = 40 * N + 39;
  assert.ok(pk[front] / pkFree[front] > 1.4, `front ratio ${(pk[front] / pkFree[front]).toFixed(2)}`);
});

function wallScene() {
  const bid = new Int16Array(N * N).fill(-1);
  for (let y = 20; y < 60; y++) for (let x = 40; x < 43; x++) bid[y * N + x] = 0;
  return bid;
}
