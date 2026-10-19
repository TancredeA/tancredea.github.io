// Computes the KB danger map over all free cells, off the main thread.
import { kbMap } from './kb.js';

self.onmessage = e => {
  const { scene, W } = e.data;
  const t0 = performance.now();
  const s = kbMap(scene, W);
  self.postMessage({ s, ms: performance.now() - t0 }, [s.buffer]);
};
