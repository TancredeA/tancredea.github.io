// Damage scoring: local damage g(p), criticality weights d_k and the score S(x).
// Pure functions, no DOM: used by the workers, the main thread and the tests.

// Criticality weight per building category (index = category, 1..4).
export const D_K = [0, 1.0, 2.5, 7.0, 20.0];

// Overpressure thresholds (hPa) and damage levels at each threshold.
export const P_THRESH = [20, 50, 140, 200, 300];
export const G_LEVELS = [0, 0.03, 0.18, 0.70, 2.20];
export const G_MAX = 2.20;

const LN_P = P_THRESH.map(Math.log);

// g(p): smoothstep in log-pressure between consecutive thresholds.
export function damage(p) {
  if (!(p > P_THRESH[0])) return 0;
  if (p >= P_THRESH[4]) return G_MAX;
  let i = 0;
  while (p > P_THRESH[i + 1]) i++;
  const u = (Math.log(p) - LN_P[i]) / (LN_P[i + 1] - LN_P[i]);
  return G_LEVELS[i] + (G_LEVELS[i + 1] - G_LEVELS[i]) * u * u * (3 - 2 * u);
}

// S_max = 2.20 * sum_k d_k: the score if every building were fully destroyed.
export function scoreMax(buildings) {
  let s = 0;
  for (const b of buildings) s += D_K[b.cat];
  return G_MAX * s;
}

// S = sum_k d_k * mean over the probes of building k of g(p).
// pHpa[j] is the peak overpressure (hPa) at probe j; probes.bld[j] its building id.
export function scoreFromProbes(probes, buildings, pHpa) {
  const sum = new Float64Array(buildings.length);
  for (let j = 0; j < probes.cell.length; j++) sum[probes.bld[j]] += damage(pHpa[j]);
  let S = 0;
  for (const b of buildings) S += D_K[b.cat] * sum[b.id] / probes.count[b.id];
  return S;
}
