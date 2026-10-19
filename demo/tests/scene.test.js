import test from 'node:test';
import assert from 'node:assert/strict';
import { generateScene, components, chooseDisposal, N } from '../js/scene.js';

const SEEDS = [1, 2, 3, 7, 42, 123, 999, 2026, 31337, 271828];
const scenes = SEEDS.map(s => generateScene(s));

test('footprint is 20 % ± 3 %', () => {
  for (const sc of scenes) assert.ok(Math.abs(sc.footprint - 0.2) <= 0.03, `seed ${sc.seed}: ${sc.footprint}`);
});

test('category counts follow the table', () => {
  for (const sc of scenes) {
    const n = sc.buildings.length;
    const c = [0, 0, 0, 0, 0];
    for (const b of sc.buildings) c[b.cat]++;
    assert.ok(n >= 10 && n <= 14, `seed ${sc.seed}: ${n} buildings`);
    assert.equal(c[4], 1, `seed ${sc.seed}: strategic`);
    assert.ok(c[3] >= 1 && c[3] <= 2, `seed ${sc.seed}: collective`);
    assert.ok(c[2] / n >= 0.4 && c[2] / n <= 0.7, `seed ${sc.seed}: residential share ${c[2] / n}`);
    assert.ok(c[1] / n >= 0.15 && c[1] / n <= 0.45, `seed ${sc.seed}: secondary share ${c[1] / n}`);
    for (const b of sc.buildings) assert.ok(b.w >= 4 && b.h >= 4);
  }
});

test('free space is 4-connected', () => {
  for (const sc of scenes) assert.equal(components(sc.free).sizes.length, 1, `seed ${sc.seed}`);
});

test('open area of at least 15 × 15 m', () => {
  for (const sc of scenes) {
    assert.ok(sc.field.w >= 15 && sc.field.h >= 15);
    for (let y = sc.field.y; y < sc.field.y + sc.field.h; y++)
      for (let x = sc.field.x; x < sc.field.x + sc.field.w; x++) assert.ok(sc.free[y * N + x]);
  }
});

test('B is the argmax of the distance transform under the restrictions', () => {
  for (const sc of scenes) {
    let best = -1;
    for (let i = 0; i < N * N; i++) {
      const x = i % N + 0.5, y = ((i / N) | 0) + 0.5;
      if (!sc.comp[i] || x < 3 || y < 3 || x > N - 3 || y > N - 3) continue;
      best = Math.max(best, sc.dist[i]);
    }
    assert.equal(sc.dist[sc.B], best, `seed ${sc.seed}`);
    assert.equal(chooseDisposal(sc.dist, sc.comp), sc.B);
    assert.ok(sc.comp[sc.B]);
  }
});

test('generation is deterministic', () => {
  const a = generateScene(42), b = generateScene(42);
  assert.deepEqual(a.buildings, b.buildings);
  assert.equal(a.B, b.B);
});
