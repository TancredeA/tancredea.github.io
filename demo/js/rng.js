// Seeded PRNG (mulberry32) and URL seed handling.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),   // inclusive bounds
    chance: p => next() < p,
    pick: arr => arr[Math.floor(next() * arr.length)],
  };
}

// Reads ?seed= (an integer, or any string hashed to one). Without it, draws a random
// seed and writes it back into the URL so the run can be shared and reproduced.
export function seedFromUrl(win = globalThis.window) {
  const url = new URL(win.location.href);
  const raw = url.searchParams.get('seed');
  if (raw !== null && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n >>> 0 : hashString(raw);
  }
  const seed = 1 + Math.floor(Math.random() * 999999);
  writeSeed(seed, win);
  return seed;
}

export function writeSeed(seed, win = globalThis.window) {
  const url = new URL(win.location.href);
  url.searchParams.set('seed', String(seed));
  try { win.history.replaceState(null, '', url); } catch { /* sandboxed iframe: ignore */ }
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
