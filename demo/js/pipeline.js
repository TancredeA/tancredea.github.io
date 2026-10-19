// Glue between the pure modules: initial design, GP posterior, route, next point.
// Shared by the guided experience (main.js) and the headless tests. No DOM.

import { N } from './scene.js';
import { makeRng } from './rng.js';
import { fitGP, predictGrid } from './gp.js';
import { clipWeights, deltaFor, deltaStepping, pathLength, pathCost } from './path.js';
import { corridorMask, eligibleMask, acquisitionScore, sigmaRel, stopRule, N_INIT } from './acquisition.js';

// Greedy maximin over the free cells of the main component, from a seeded first point.
// Cells closer than 3 m to the border are left out (as for B): plain maximin would
// otherwise spend points in the corners, where a blast threatens almost nothing.
export function initialDesign(scene, seed, k = N_INIT) {
  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if (scene.comp[i] && x >= 3 && y >= 3 && x < N - 3 && y < N - 3) cells.push(i);
  }
  const rng = makeRng((seed ^ 0x5eed) >>> 0);
  const chosen = [cells[Math.floor(rng.next() * cells.length)]];
  const dmin = new Float64Array(cells.length).fill(Infinity);
  while (chosen.length < k) {
    const c = chosen[chosen.length - 1], cx = c % N, cy = (c / N) | 0;
    let best = -1, bd = -1;
    for (let m = 0; m < cells.length; m++) {
      const d = ((cells[m] % N) - cx) ** 2 + (((cells[m] / N) | 0) - cy) ** 2;
      if (d < dmin[m]) dmin[m] = d;
      if (dmin[m] > bd) { bd = dmin[m]; best = m; }
    }
    chosen.push(cells[best]);
  }
  return chosen;
}

// GP on residuals r_i = s_true(x_i) − s_KB(x_i) (normalised danger units).
// Returns mu = s_KB + posterior residual mean, sigma, the model and the residuals.
export function posterior(scene, sKB, obs) {
  const X = [], y = [];
  for (const o of obs) { X.push((o.cell % N) + 0.5, ((o.cell / N) | 0) + 0.5); y.push(o.s - sKB[o.cell]); }
  const model = fitGP(X, y);
  const { mean, sd } = predictGrid(model, N, scene.free);
  const mu = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) if (scene.free[i]) mu[i] = sKB[i] + mean[i];
  return { model, mu, sigma: sd, resid: y };
}

// Delta-Stepping route on a danger map.
export function route(scene, mu, A, B) {
  const w = clipWeights(mu, scene.comp);
  const delta = deltaFor(w, scene.comp, N);
  const r = deltaStepping(w, scene.comp, N, A, B, delta);
  return { ...r, w, length: pathLength(r.path, N) };
}

// Corridor, acquisition score, convergence measure and decision for the current route.
export function acquire(scene, mu, sigma, path, simulated) {
  const corridor = corridorMask(path, scene.comp, N);
  const eligible = eligibleMask(scene.comp, simulated, N);
  const { score, best } = acquisitionScore(mu, sigma, corridor, eligible);
  const rel = sigmaRel(mu, sigma, corridor);
  return { corridor, score, next: best, rel, stop: stopRule(rel, simulated.length) };
}

// Share of the route lying more than `tol` m away from the other route.
export function routeShift(path, other, tol = 2) {
  if (!path.length) return 0;
  let off = 0;
  for (const c of path) {
    const x = c % N, y = (c / N) | 0;
    let near = false;
    for (const o of other) if (((o % N) - x) ** 2 + (((o / N) | 0) - y) ** 2 <= tol * tol) { near = true; break; }
    if (!near) off++;
  }
  return off / path.length;
}

export { pathCost };
