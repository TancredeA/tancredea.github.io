import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/rng.js';
import { components } from '../js/scene.js';
import { clipWeights, deltaFor, deltaStepping, dijkstra, pathCost } from '../js/path.js';

const N = 80;

function randomGrid(seed) {
  const rng = makeRng(seed);
  const free = new Uint8Array(N * N).fill(1);
  const nb = rng.int(5, 25);
  for (let k = 0; k < nb; k++) {
    const w = rng.int(3, 15), h = rng.int(3, 15), x = rng.int(0, N - w), y = rng.int(0, N - h);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) free[j * N + i] = 0;
  }
  const mu = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) mu[i] = rng.next() < 0.3 ? 0 : rng.next() ** 3;
  // keep the largest component, pick two of its cells
  const { lab, sizes } = components(free);
  const big = sizes.indexOf(Math.max(...sizes));
  const cells = [];
  for (let i = 0; i < N * N; i++) { free[i] = lab[i] === big ? 1 : 0; if (free[i]) cells.push(i); }
  return { free, mu, src: rng.pick(cells), dst: rng.pick(cells) };
}

test('Delta-Stepping cost equals Dijkstra on 50 random grids; paths avoid buildings', () => {
  for (let s = 1; s <= 50; s++) {
    const { free, mu, src, dst } = randomGrid(s);
    const w = clipWeights(mu, free);
    const ds = deltaStepping(w, free, N, src, dst, deltaFor(w, free, N));
    const dj = dijkstra(w, free, N, src, dst);
    assert.ok(Math.abs(ds.cost - dj.cost) <= 1e-9 * Math.max(1, dj.cost), `grid ${s}: ${ds.cost} vs ${dj.cost}`);
    assert.equal(ds.path[0], src);
    assert.equal(ds.path[ds.path.length - 1], dst);
    for (let k = 0; k < ds.path.length; k++) {
      assert.ok(free[ds.path[k]], `grid ${s}: path enters a building`);
      if (k) {
        const a = ds.path[k - 1], b = ds.path[k];
        assert.ok(Math.abs(a % N - b % N) <= 1 && Math.abs(((a / N) | 0) - ((b / N) | 0)) <= 1);
      }
    }
    assert.ok(Math.abs(pathCost(ds.path, w, N) - ds.cost) <= 1e-9 * Math.max(1, ds.cost));
  }
});

test('exploration trace settles nodes bucket by bucket', () => {
  const { free, mu, src, dst } = randomGrid(99);
  const w = clipWeights(mu, free);
  const r = deltaStepping(w, free, N, src, dst, deltaFor(w, free, N));
  assert.equal(r.trace[0], src);
  for (let k = 1; k < r.traceBucket.length; k++) assert.ok(r.traceBucket[k] >= r.traceBucket[k - 1]);
  assert.ok(r.trace.includes(dst));
  assert.equal(new Set(r.trace).size, r.trace.length);
});
