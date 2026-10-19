import test from 'node:test';
import assert from 'node:assert/strict';
import { damage, P_THRESH, G_LEVELS } from '../js/scoring.js';

test('g(p) equals G_i at the thresholds and saturates', () => {
  P_THRESH.forEach((p, i) => assert.ok(Math.abs(damage(p) - G_LEVELS[i]) < 1e-12, `g(${p})`));
  assert.equal(damage(5), 0);
  assert.equal(damage(1e5), 2.2);
});

test('g(p) is continuous and monotone', () => {
  let prev = damage(1);
  for (let lp = 0; lp < Math.log(1000); lp += 1e-4) {
    const g = damage(Math.exp(lp));
    assert.ok(g >= prev - 1e-15, `not monotone at p=${Math.exp(lp)}`);
    assert.ok(g - prev < 2e-3, `jump at p=${Math.exp(lp)}`);
    prev = g;
  }
});
