// Shortest path on the danger map: Delta-Stepping (sequential, with an exploration trace)
// and a plain Dijkstra used to check it. Pure functions, no DOM.
//
// Graph: free cells, 8-connectivity without cutting building corners.
// Edge weight w(u → v) = mu(v) · d(u, v), d ∈ {1, √2}.

export const EPS = 1e-3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const LEN = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

// Calls fn(v, d) for every neighbour v of u.
export function forNeighbours(u, free, N, fn) {
  const x = u % N, y = (u / N) | 0;
  for (let k = 0; k < 8; k++) {
    const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
    if (nx < 0 || ny < 0 || nx >= N || ny >= N || !free[ny * N + nx]) continue;
    if (k >= 4 && (!free[y * N + nx] || !free[ny * N + x])) continue;   // no corner cutting
    fn(ny * N + nx, LEN[k]);
  }
}

// Clips the danger to EPS so every weight stays positive.
export function clipWeights(mu, free) {
  const w = new Float64Array(mu.length);
  for (let i = 0; i < mu.length; i++) w[i] = free[i] ? Math.max(mu[i], EPS) : Infinity;
  return w;
}

// Delta = q-quantile of the finite edge weights.
export function deltaFor(w, free, N, q = 0.25) {
  const ws = [];
  for (let u = 0; u < N * N; u++) if (free[u]) forNeighbours(u, free, N, (v, d) => ws.push(w[v] * d));
  const a = Float64Array.from(ws).sort();
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
}

function walkBack(prev, dst) {
  if (prev[dst] < 0) return [];
  const out = [];
  for (let v = dst; v >= 0; v = prev[v]) out.push(v);
  return out.reverse();
}

// Delta-Stepping from src to dst. Stops once the bucket holding dst is settled.
// trace: settled nodes in order, traceBucket: the bucket index each one was settled in.
export function deltaStepping(w, free, N, src, dst, delta) {
  const n = N * N;
  const tent = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const settled = new Uint8Array(n);
  const buckets = [];
  const trace = [], traceBucket = [];
  const relax = (v, x, from) => {
    if (x < tent[v]) {
      tent[v] = x; prev[v] = from;
      const b = Math.floor(x / delta);
      (buckets[b] || (buckets[b] = [])).push(v);
    }
  };
  relax(src, 0, -1);
  let i = 0, nBuckets = 0;
  while (true) {
    while (i < buckets.length && !(buckets[i] && buckets[i].length)) i++;
    if (i >= buckets.length) break;
    const R = [];
    // light phase: may refill bucket i, so loop until it stays empty
    while (buckets[i] && buckets[i].length) {
      const cur = buckets[i];
      buckets[i] = [];
      for (const u of cur) {
        if (Math.floor(tent[u] / delta) !== i) continue;    // stale entry
        if (!settled[u]) { settled[u] = 1; R.push(u); }
        const tu = tent[u];
        forNeighbours(u, free, N, (v, d) => { const c = w[v] * d; if (c <= delta) relax(v, tu + c, u); });
      }
    }
    // heavy phase
    for (const u of R) {
      const tu = tent[u];
      forNeighbours(u, free, N, (v, d) => { const c = w[v] * d; if (c > delta) relax(v, tu + c, u); });
    }
    for (const u of R) { trace.push(u); traceBucket.push(nBuckets); }
    nBuckets++;
    if (settled[dst]) break;
    i++;
  }
  const path = walkBack(prev, dst);
  return { dist: tent, prev, path, cost: tent[dst], trace: Int32Array.from(trace), traceBucket: Int32Array.from(traceBucket), nBuckets, delta };
}

// Binary-heap Dijkstra (reference implementation for the tests).
export function dijkstra(w, free, N, src, dst) {
  const n = N * N;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const hk = [], hv = [];
  const push = (k, v) => {
    hk.push(k); hv.push(v);
    let i = hk.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= hk[i]) break;
      [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p;
    }
  };
  const pop = () => {
    const k = hk[0], v = hv[0], lk = hk.pop(), lv = hv.pop();
    if (hk.length) {
      hk[0] = lk; hv[0] = lv;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < hk.length && hk[l] < hk[m]) m = l;
        if (r < hk.length && hk[r] < hk[m]) m = r;
        if (m === i) break;
        [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m;
      }
    }
    return [k, v];
  };
  dist[src] = 0;
  push(0, src);
  while (hk.length) {
    const [k, u] = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === dst) break;
    forNeighbours(u, free, N, (v, d) => {
      const c = k + w[v] * d;
      if (c < dist[v]) { dist[v] = c; prev[v] = u; push(c, v); }
    });
  }
  return { dist, prev, path: walkBack(prev, dst), cost: dist[dst] };
}

// Geometric length (m) of a path of cell indices.
export function pathLength(path, N) {
  let L = 0;
  for (let k = 1; k < path.length; k++)
    L += Math.hypot((path[k] % N) - (path[k - 1] % N), ((path[k] / N) | 0) - ((path[k - 1] / N) | 0));
  return L;
}

// Cost of a given path under weights w (same convention as the search).
export function pathCost(path, w, N) {
  let c = 0;
  for (let k = 1; k < path.length; k++)
    c += w[path[k]] * Math.hypot((path[k] % N) - (path[k - 1] % N), ((path[k] / N) | 0) - ((path[k - 1] / N) | 0));
  return c;
}

// Nearest free cell (of `mask`) to cell i, by Euclidean distance.
export function snapToFree(i, mask, N) {
  if (mask[i]) return i;
  const x = i % N, y = (i / N) | 0;
  let best = -1, bd = Infinity;
  for (let k = 0; k < N * N; k++) {
    if (!mask[k]) continue;
    const d = ((k % N) - x) ** 2 + (((k / N) | 0) - y) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
