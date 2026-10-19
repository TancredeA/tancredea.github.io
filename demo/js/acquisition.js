// Path-coupled active acquisition and stopping rule. Pure functions, no DOM.

export const BETA = 0.7;          // weight of the corridor term
export const CORRIDOR_R = 5;      // m around the current route
export const EXCLUDE_R = 3;       // m around points already simulated
export const TOL = 0.05;          // stop when sigma_cum,rel < 5 %
export const N_INIT = 5;
export const BUDGET = 12;         // simulations in total

// Free cells within R metres of any cell of the path.
export function corridorMask(path, free, N, R = CORRIDOR_R) {
  const C = new Uint8Array(N * N);
  const r = Math.ceil(R), R2 = R * R;
  for (const c of path) {
    const x = c % N, y = (c / N) | 0;
    for (let j = Math.max(0, y - r); j <= Math.min(N - 1, y + r); j++)
      for (let i = Math.max(0, x - r); i <= Math.min(N - 1, x + r); i++)
        if ((i - x) ** 2 + (j - y) ** 2 <= R2 && free[j * N + i]) C[j * N + i] = 1;
  }
  return C;
}

// Cells that may be simulated next: free, and farther than R from every simulated point.
export function eligibleMask(free, simulated, N, R = EXCLUDE_R) {
  const E = Uint8Array.from(free);
  for (const c of simulated) {
    const x = c % N, y = (c / N) | 0, r = Math.ceil(R);
    for (let j = Math.max(0, y - r); j <= Math.min(N - 1, y + r); j++)
      for (let i = Math.max(0, x - r); i <= Math.min(N - 1, x + r); i++)
        if ((i - x) ** 2 + (j - y) ** 2 <= R * R) E[j * N + i] = 0;
  }
  return E;
}

// a(x) = β · σ/max σ · 1_C + (1 − β) · [σ/(μ + 1e-3)] / max(same). NaN on masked cells.
export function acquisitionScore(mu, sigma, corridor, eligible, beta = BETA) {
  const n = mu.length;
  let ms = 0, mr = 0;
  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    ms = Math.max(ms, sigma[i]);
    mr = Math.max(mr, sigma[i] / (Math.max(mu[i], 0) + 1e-3));
  }
  const score = new Float32Array(n).fill(NaN);
  let best = -1, bv = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    const a = beta * (ms > 0 ? sigma[i] / ms : 0) * (corridor[i] ? 1 : 0)
      + (1 - beta) * (mr > 0 ? sigma[i] / (Math.max(mu[i], 0) + 1e-3) / mr : 0);
    score[i] = a;
    if (a > bv) { bv = a; best = i; }
  }
  return { score, best };
}

// sigma_cum,rel = Σ_C σ / Σ_C μ over the corridor.
export function sigmaRel(mu, sigma, corridor) {
  let s = 0, m = 0;
  for (let i = 0; i < mu.length; i++) if (corridor[i]) { s += sigma[i]; m += Math.max(mu[i], 0); }
  return m > 0 ? s / m : Infinity;
}

// 'converged', 'budget' or null (keep going). Convergence is checked first.
export function stopRule(rel, nSims, tol = TOL, budget = BUDGET) {
  if (rel < tol) return 'converged';
  if (nSims >= budget) return 'budget';
  return null;
}
