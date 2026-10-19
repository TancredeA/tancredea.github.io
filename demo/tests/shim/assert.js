// Minimal browser stand-in for `node:assert/strict` (the subset the tests use).

class AssertionError extends Error {}

function fail(msg, dflt) { throw new AssertionError(msg || dflt); }

function ok(v, msg) { if (!v) fail(msg, 'expected truthy, got ' + v); }
function equal(a, b, msg) { if (!Object.is(a, b)) fail(msg, `expected ${b}, got ${a}`); }
function notEqual(a, b, msg) { if (Object.is(a, b)) fail(msg, `expected value other than ${b}`); }
function deepEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(msg, `deepEqual failed:\n${JSON.stringify(a)}\n${JSON.stringify(b)}`);
}
function throws(fn, msg) {
  try { fn(); } catch { return; }
  fail(msg, 'expected function to throw');
}

const assert = Object.assign(ok, { ok, equal, strictEqual: equal, notEqual, deepEqual, deepStrictEqual: deepEqual, throws, AssertionError });
export default assert;
export { ok, equal, notEqual, deepEqual, throws, AssertionError };
export const strictEqual = equal;
export const deepStrictEqual = deepEqual;
