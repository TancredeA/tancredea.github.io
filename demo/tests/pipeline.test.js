// Headless end-to-end run of the whole loop (seed 42, fixed A), plus the performance budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateScene, defaultStart, N } from '../js/scene.js';
import { kbMap, solveCharge } from '../js/kb.js';
import { makeSolver, runShot, cellPeaks, calibrate, shotScore, CAL_SOURCE } from '../js/fdtd.js';
import { initialDesign, posterior, route, acquire } from '../js/pipeline.js';
import { BUDGET } from '../js/acquisition.js';

const now = () => performance.now();

test('seed 42: full loop runs to a valid stop with a route that avoids buildings', () => {
  const W = Math.round(solveCharge() * 10) / 10;
  const sc = generateScene(42);
  let t = now();
  const sKB = kbMap(sc, W);
  const tKB = now() - t;
  const empty = makeSolver(null);
  const cal = calibrate(cellPeaks(empty, runShot(empty, CAL_SOURCE).peak), CAL_SOURCE, W);
  const sol = makeSolver(sc.bid);
  let tShot = 0;
  const sim = c => { const t0 = now(); const pk = cellPeaks(sol, runShot(sol, c).peak); tShot = Math.max(tShot, now() - t0); return shotScore(sc, cal, W, pk, c).s; };
  const A = defaultStart(sc);
  const obs = initialDesign(sc, 42).map(c => ({ cell: c, s: sim(c) }));
  let acq, r;
  for (;;) {
    const post = posterior(sc, sKB, obs);
    r = route(sc, post.mu, A, sc.B);
    acq = acquire(sc, post.mu, post.sigma, r.path, obs.map(o => o.cell));
    if (acq.stop) break;
    obs.push({ cell: acq.next, s: sim(acq.next) });
  }
  assert.ok(['converged', 'budget'].includes(acq.stop));
  assert.ok(obs.length <= BUDGET);
  assert.equal(r.path[0], A);
  assert.equal(r.path[r.path.length - 1], sc.B);
  for (const c of r.path) assert.ok(sc.free[c]);
  assert.ok(tKB < 2000, `KB map ${tKB.toFixed(0)} ms`);
  assert.ok(tShot < 500, `FDTD shot ${tShot.toFixed(0)} ms`);
  console.log(`seed 42: ${obs.length} sims, stop=${acq.stop}, rel=${acq.rel.toFixed(3)}, KB ${tKB.toFixed(0)} ms, shot ≤ ${tShot.toFixed(0)} ms, N=${N}`);
});
