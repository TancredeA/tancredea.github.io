// Runs the acoustic solver: one calibration run in an empty domain at init, then one shot per
// request (score, corrected peak field and animation frames, buffers transferred).
import { makeSolver, runShot, cellPeaks, calibrate, shotScore, freeFieldError, CAL_SOURCE } from './fdtd.js';

let scene, W, sol, cal;

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    scene = m.scene; W = m.W;
    const empty = makeSolver(null);
    const free = cellPeaks(empty, runShot(empty, CAL_SOURCE).peak);
    cal = calibrate(free, CAL_SOURCE, W);
    sol = makeSolver(scene.bid);
    self.postMessage({ type: 'ready', alpha: cal.alpha, freeErr: freeFieldError(cal, W, free, CAL_SOURCE) });
  } else if (m.type === 'shot') {
    const t0 = performance.now();
    const r = runShot(sol, m.cell, { frames: true, frameEvery: 8 });
    const ms = performance.now() - t0;
    const sc = shotScore(scene, cal, W, cellPeaks(sol, r.peak), m.cell);
    self.postMessage({
      type: 'shot', id: m.id, cell: m.cell, S: sc.S, s: sc.s, field: sc.field,
      frames: r.frames, nFrames: r.nFrames, frameSize: r.frameSize, ms,
    }, [sc.field.buffer, r.frames.buffer]);
  }
};
