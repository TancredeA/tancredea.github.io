import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/rng.js';
import { corridorMask, eligibleMask, acquisitionScore, sigmaRel, stopRule, EXCLUDE_R } from '../js/acquisition.js';

const N = 80;

test('masked cells never win', () => {
  for (let s = 1; s <= 20; s++) {
    const rng = makeRng(s);
    const free = new Uint8Array(N * N).map(() => (rng.next() < 0.8 ? 1 : 0));
    const mu = new Float32Array(N * N).map(() => rng.next() * 0.1);
    const sigma = new Float32Array(N * N).map(() => rng.next() * 0.05);
    const sims = Array.from({ length: 8 }, () => rng.int(0, N * N - 1));
    // make the masked cells the most attractive ones on purpose
    for (const c of sims) sigma[c] = 10;
    for (let i = 0; i < N * N; i++) if (!free[i]) sigma[i] = 10;
    const path = Array.from({ length: 60 }, (_, k) => 40 * N + 10 + k);
    const C = corridorMask(path, free, N);
    const E = eligibleMask(free, sims, N);
    const { score, best } = acquisitionScore(mu, sigma, C, E);
    assert.ok(free[best], 'best is on a building');
    for (const c of sims) assert.ok(Math.hypot(best % N - c % N, ((best / N) | 0) - ((c / N) | 0)) > EXCLUDE_R);
    for (let i = 0; i < N * N; i++) if (!E[i]) assert.ok(Number.isNaN(score[i]));
  }
});

test('corridor is the free cells within 5 m of the path', () => {
  const free = new Uint8Array(N * N).fill(1);
  const C = corridorMask([40 * N + 40], free, N);
  assert.ok(C[40 * N + 45] && !C[40 * N + 46] && C[43 * N + 44] && !C[44 * N + 44]);
});

test('stopping rule triggers correctly', () => {
  assert.equal(stopRule(0.049, 6), 'converged');
  assert.equal(stopRule(0.049, 12), 'converged');
  assert.equal(stopRule(0.2, 12), 'budget');
  assert.equal(stopRule(0.2, 11), null);
  const mu = new Float32Array([1, 1, 1, 1]), sd = new Float32Array([0.01, 0.03, 9, 9]);
  assert.ok(Math.abs(sigmaRel(mu, sd, new Uint8Array([1, 1, 0, 0])) - 0.02) < 1e-9);
});
