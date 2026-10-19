import test from 'node:test';
import assert from 'node:assert/strict';
import { kinneyGraham, solveCharge, overpressureHpa, radiusFor, buildingsCrossed } from '../js/kb.js';
import { N } from '../js/scene.js';

const close = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);

test('Kinney–Graham law matches the reference values within 1 %', () => {
  for (const [Z, P] of [[1, 1009], [2, 208], [5, 29.2], [10, 10.0], [20, 4.39]]) {
    assert.ok(close(kinneyGraham(Z), P, 0.01), `Z=${Z}: ${kinneyGraham(Z).toFixed(2)} kPa vs ${P}`);
  }
});

test('charge W gives 20 hPa at 50 m within 1 %', () => {
  const W = solveCharge(50, 20);
  assert.ok(W > 1.5 && W < 1.7, `W = ${W}`);
  assert.ok(close(overpressureHpa(50, W), 20, 0.01));
  // the rounded charge shown in the UI still satisfies the target
  const Wr = Math.round(W * 10) / 10;
  assert.ok(close(overpressureHpa(50, Wr), 20, 0.01), `rounded W=${Wr}: ${overpressureHpa(50, Wr)}`);
});

test('ICPE thresholds fall at the expected distances', () => {
  const W = Math.round(solveCharge() * 10) / 10;
  for (const [p, R] of [[300, 5.8], [200, 7.3], [140, 9.3], [50, 21]]) {
    assert.ok(Math.abs(radiusFor(p, W) - R) < 0.6, `${p} hPa at ${radiusFor(p, W).toFixed(2)} m`);
  }
});

test('masking counts each crossed building once', () => {
  const bid = new Int16Array(N * N).fill(-1);
  for (let y = 10; y < 20; y++) for (let x = 20; x < 25; x++) bid[y * N + x] = 0;
  for (let y = 10; y < 20; y++) for (let x = 30; x < 33; x++) bid[y * N + x] = 1;
  const stamp = new Int32Array(2).fill(-1);
  assert.equal(buildingsCrossed(bid, 15 * N + 10, 15 * N + 40, stamp, 1), 2);
  assert.equal(buildingsCrossed(bid, 15 * N + 10, 15 * N + 27, stamp, 2), 1);
  assert.equal(buildingsCrossed(bid, 5 * N + 10, 5 * N + 40, stamp, 3), 0);
});
