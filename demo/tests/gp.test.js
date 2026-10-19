import test from 'node:test';
import assert from 'node:assert/strict';
import { fitGP, predictAt, priorSd, matern52, cholesky, GRID } from '../js/gp.js';
import { makeRng } from '../js/rng.js';

const pts = [[10, 10], [30, 15], [50, 40], [20, 60], [65, 70], [40, 30], [70, 20]];
const f = (x, y) => 0.02 * Math.sin(x / 9) + 0.01 * Math.cos(y / 7) + 0.03;
const X = pts.flat(), y = pts.map(([a, b]) => f(a, b));
const m = fitGP(X, y);

test('posterior mean interpolates the observations within the nugget', () => {
  pts.forEach(([a, b], i) => {
    const p = predictAt(m, a, b);
    assert.ok(Math.abs(p.mean - y[i]) <= Math.max(3 * m.sn * m.sd, 1e-6), `point ${i}: ${p.mean} vs ${y[i]}`);
  });
});

test('sigma shrinks near the data and returns to the prior far away', () => {
  for (const [a, b] of pts) assert.ok(predictAt(m, a, b).sd < 0.2 * priorSd(m));
  const far = predictAt(m, 1000, 1000);
  assert.ok(Math.abs(far.sd - priorSd(m)) < 1e-3 * priorSd(m));
  assert.ok(Math.abs(far.mean - m.mean) < 1e-9);
});

test('MLE picks a finite length scale inside its bounds', () => {
  // draw from a GP with ell = 10 m and recover a length scale strictly inside [3, 30]
  const rng = makeRng(7), n = 12, P = [];
  for (let k = 0; k < n; k++) P.push(rng.range(0, 80), rng.range(0, 80));
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    K[i * n + j] = matern52(Math.hypot(P[2 * i] - P[2 * j], P[2 * i + 1] - P[2 * j + 1]), 10, 1) + (i === j ? 1e-6 : 0);
  const L = cholesky(K, n);
  const z = Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(rng.next() + 1e-12)) * Math.cos(2 * Math.PI * rng.next()));
  const yy = Array.from({ length: n }, (_, i) => z.slice(0, i + 1).reduce((s, v, k) => s + L[i * n + k] * v, 0));
  const g = fitGP(P, yy);
  assert.ok(Number.isFinite(g.ell));
  assert.ok(g.ell > GRID.ell[0] && g.ell < GRID.ell[GRID.ell.length - 1], `ell = ${g.ell}`);
});
