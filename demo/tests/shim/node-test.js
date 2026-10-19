// Minimal browser stand-in for `node:test`, used by tests/run.html only.
// Tests register here; run.html awaits `runAll()` and prints the results.

const queue = [];

export function test(name, fn) { queue.push({ name, fn }); }
export const it = test;
export function describe(name, fn) { fn(); }

export async function runAll(onResult) {
  const results = [];
  while (queue.length) {
    const { name, fn } = queue.shift();
    const t0 = performance.now();
    try { await fn(); results.push({ name, ok: true, ms: performance.now() - t0 }); }
    catch (e) { results.push({ name, ok: false, ms: performance.now() - t0, err: e }); }
    onResult?.(results[results.length - 1]);
  }
  return results;
}

export default test;
