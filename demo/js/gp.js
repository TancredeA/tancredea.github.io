// Gaussian process on the residual between the simulator and the KB surrogate.
// Matérn 5/2 kernel plus a nugget, hyperparameters by grid-search maximum likelihood,
// Cholesky solves throughout. Pure functions, no DOM.

const SQ5 = Math.sqrt(5);

export const GRID = {
  ell: logspace(3, 30, 16),      // m
  sn: logspace(1e-4, 1e-1, 7),   // nugget sd, standardised units
  sf: logspace(0.3, 3, 9),       // signal sd, standardised units
};

export function logspace(a, b, n) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(a * (b / a) ** (k / (n - 1)));
  return out;
}

export function matern52(d, ell, sf2) {
  const u = SQ5 * d / ell;
  return sf2 * (1 + u + u * u / 3) * Math.exp(-u);
}

// In-place lower Cholesky factor of a symmetric n × n matrix (row-major). Null if not SPD.
export function cholesky(A, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * n + j];
    for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    if (i === j) { if (!(s > 0)) return null; L[i * n + i] = Math.sqrt(s); }
    else L[i * n + j] = s / L[j * n + j];
  }
  return L;
}

function forward(L, n, b) {           // solves L x = b
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

function backward(L, n, b) {          // solves Lᵀ x = b
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

function distMatrix(X, n) {
  const D = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    D[i * n + j] = Math.hypot(X[2 * i] - X[2 * j], X[2 * i + 1] - X[2 * j + 1]);
  return D;
}

// Log marginal likelihood for standardised targets z. Returns { lml, L, alpha } or null.
export function logMarginal(D, z, n, ell, sf, sn) {
  const K = new Float64Array(n * n), sf2 = sf * sf;
  for (let i = 0; i < n * n; i++) K[i] = matern52(D[i], ell, sf2);
  for (let i = 0; i < n; i++) K[i * n + i] += sn * sn + 1e-10;
  const L = cholesky(K, n);
  if (!L) return null;
  const alpha = backward(L, n, forward(L, n, z));
  let lml = -0.5 * n * Math.log(2 * Math.PI);
  for (let i = 0; i < n; i++) lml -= 0.5 * z[i] * alpha[i] + Math.log(L[i * n + i]);
  return { lml, L, alpha };
}

// Fits the GP to points X (flat [x0, y0, x1, y1, ...], metres) and targets y.
export function fitGP(X, y, grid = GRID) {
  const n = y.length;
  let mean = 0;
  for (const v of y) mean += v;
  mean /= n;
  let sd = 0;
  for (const v of y) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / Math.max(n - 1, 1)) || 1e-6;
  const z = Float64Array.from(y, v => (v - mean) / sd);
  const D = distMatrix(X, n);
  let best = null;
  for (const ell of grid.ell) for (const sn of grid.sn) for (const sf of grid.sf) {
    const r = logMarginal(D, z, n, ell, sf, sn);
    if (r && (!best || r.lml > best.lml)) best = { ...r, ell, sf, sn };
  }
  return { X: Float64Array.from(X), n, mean, sd, ell: best.ell, sf: best.sf, sn: best.sn, L: best.L, alpha: best.alpha, lml: best.lml };
}

// Posterior mean and latent standard deviation (nugget excluded) at point (x, y), in data units.
export function predictAt(m, x, y) {
  const k = new Float64Array(m.n), sf2 = m.sf * m.sf;
  let mu = 0;
  for (let i = 0; i < m.n; i++) {
    k[i] = matern52(Math.hypot(x - m.X[2 * i], y - m.X[2 * i + 1]), m.ell, sf2);
    mu += k[i] * m.alpha[i];
  }
  const v = forward(m.L, m.n, k);
  let vv = 0;
  for (let i = 0; i < m.n; i++) vv += v[i] * v[i];
  return { mean: m.mean + m.sd * mu, sd: m.sd * Math.sqrt(Math.max(sf2 - vv, 0)) };
}

// Posterior over every cell of an N × N grid where mask[i] is set (cell centres).
export function predictGrid(m, N, mask) {
  const mean = new Float32Array(N * N), sd = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (!mask[i]) continue;
    const p = predictAt(m, (i % N) + 0.5, ((i / N) | 0) + 0.5);
    mean[i] = p.mean; sd[i] = p.sd;
  }
  return { mean, sd };
}

export function priorSd(m) { return m.sd * m.sf; }
