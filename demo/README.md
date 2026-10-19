# Blast-aware route planning: interactive demo

A self-contained, in-browser proof of concept of *Optimal Routing under Blast-Exposure Constraints* (CentraleSupélec × CEA-DAM, 2026). A device that may detonate has to be moved from where it was found (A) to a disposal site (B). The demo searches for the route that minimises the damage an accidental detonation along the way would cause to the surrounding buildings, weighted by how critical they are. It spends only a handful of expensive simulations, choosing where to run them with Bayesian optimisation.

The visitor makes exactly one choice: where the device was found. Everything else is generated or computed, deterministically from `?seed=`.

## What it shows, step by step

| Step | On screen | Real-pipeline counterpart |
|---|---|---|
| 0. Scene | 80 × 80 m peri-urban block, 10–14 buildings in 4 ICPE categories (importance ×1, ×2.5, ×7, ×20), B = the point farthest from any building | 2D city block, criticality weights d_k |
| 1. Cheap estimate | Danger map from an empirical blast law (Kinney–Graham, a Kingery–Bulmash-type scaled-distance law), ×0.8 per building in the way; dashed first-guess route | KB surrogate with building masking |
| 2. Simulations | 5 space-filling shots of a 2D acoustic wave solver, with the wave animated over the map | High-fidelity hydrodynamics runs |
| 3. Correction | Gaussian process (Matérn 5/2 + nugget, ML hyperparameters) on simulator − KB residuals; mini-maps μ, σ and acquisition score | GP on residuals |
| 4. Route | Delta-Stepping on the corrected map, animated bucket by bucket; the previous route stays as a ghost | Delta-Stepping |
| 5. Next point | 5 m corridor around the route; acquisition a = 0.7·σ/maxσ·1_C + 0.3·(σ/μ)/max; the winner is simulated next | Path-coupled active acquisition |
| 6. Result | Simulations used, σ_cum,rel, route length, cumulative danger, change versus the first guess | 19 runs instead of 10,000 positions |

The loop stops when σ_cum,rel = Σ_C σ / Σ_C μ < 5 % over the corridor, or after 12 simulations (5 initial + up to 7 acquisitions). If the budget runs out first, the result card says so.

## Run it locally

The page uses ES modules and Web Workers, which browsers block over `file://`. From the repository root:

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000/demo/>. Useful URL parameters:

- `?seed=42`: a reproducible map (without it, a random seed is drawn and written back into the URL);
- `?theme=light` or `?theme=dark`: force a theme (the default follows `prefers-color-scheme`).

Keyboard: arrow keys move a cursor on the focused map and Enter places the device; Space plays or pauses and → steps when the map is not focused. Before a spot is chosen, the play button starts from a suggested one. "new start" draws a new random map (new seed, same generation rules) and asks for a new start; "restart" replays the same map and start.

## Tests

From `demo/`, with Node ≥ 20 and no install step:

```bash
node --test tests/
```

The same files also run in a browser, which is handy without Node: serve the repository root as above and open <http://localhost:8000/demo/tests/run.html>. An import map points `node:test` and `node:assert/strict` at two small shims in `tests/shim/`.

The tests cover:
- the blast law against its reference values, and the charge W;
- g(p);
- the scene rules (footprint, category counts, connectivity, open area, B);
- FDTD stability, free-field calibration (±15 %) and wall shadowing;
- the GP (interpolation, σ near the data and far from it, ℓ inside its bounds);
- Delta-Stepping against Dijkstra on 50 random grids;
- the acquisition masks and the stopping rule;
- a headless end-to-end run on seed 42, with the performance budget (KB map ≤ 2 s, one shot ≤ 0.5 s).

## Files

```
index.html, style.css     page and theme tokens (all colours are CSS custom properties)
js/main.js                state machine, controls, narration wiring
js/rng.js                 mulberry32, URL seed
js/scene.js               generator, distance transform, B, facade probes
js/scoring.js             g(p), d_k, S(x)
js/kb.js, kb.worker.js    blast law + masking; KB map in a worker
js/fdtd.js, fdtd.worker.js  staggered-grid acoustic solver, calibration; shots in a worker
js/gp.js                  Matérn 5/2, Cholesky, grid-search MLE, posterior
js/path.js                Delta-Stepping (with exploration trace), Dijkstra
js/acquisition.js         corridor, acquisition score, stopping rule
js/pipeline.js            glue shared by the page and the headless test
js/render.js              canvas layers, colour ramps, mini-maps, legends
js/narration.js           step texts
fonts/                    Space Grotesk, IBM Plex Mono (SIL OFL)
tests/                    node --test files, browser runner and shims
```

Data layout: every map is a row-major typed array of 80 × 80 cells (cell = y·80 + x, 1 m, centre at x + 0.5, y + 0.5). The math modules are pure and DOM-free, so the same code runs in the workers, on the main thread and in Node.

Weight: about 117 KB of HTML, CSS and JS, plus about 50 KB of fonts. No dependencies, no build step, works offline once loaded.

## Modelling choices that differ from the brief, and why

- **FDTD calibration curve instead of a single scale factor.** With one factor (√(r_ref/r) spreading correction, least squares on log p over 3–40 m), the free field misses the blast law by up to 71 % near the source (ratio 0.29 at 3 m, 0.53 at 5 m, ≈ 1.0 beyond 12 m). The linear solver has no shock, so its decay is much flatter than the blast law's near field. The demo therefore divides each peak by the empty-domain peak at the same distance and multiplies by the blast law, which leaves a free-field error of 5.4 %. Open space then matches the cheap model, and the GP only learns reflections, diffraction and shadows. The single-factor mode is still in `fdtd.js` (`CAL_MODE = 'scalar'`).
- **Convergence is rarely reached within 12 simulations.** On seeds 1, 2, 3, 42 and 77, σ_cum,rel at 12 simulations is 15 %, 15 %, 18 %, 23 % and 43 %, and it plateaus around 7–16 % even with 24. The demo keeps the 5 % / 12 rule from the brief and says plainly when the budget ends the run.
- **Initial design** is greedy maximin over free cells at least 3 m from the border, the same restriction as for B. Without it, maximin puts points in the corners.
- **Layout retries** use seeds drawn from a stream derived from the requested seed, rather than seed + 1, so that neighbouring seeds don't produce the same map.
- **Routes may hug the map edge.** Danger is lowest far from buildings and the edge weight is μ·d with μ ≥ 10⁻³, so a long detour along the border is often genuinely cheaper.

## Disclaimer

Toy reimplementation for illustration only. The original project used ARMEN, a high-fidelity hydrodynamics code from CEA-DAM, on a supercomputer. Here a simple 2D acoustic solver plays that role. No code, data or results from the original project are used. The scenario (moving an unexploded device to a disposal site) is a motivating example. The scene is synthetic and randomly generated.

## Embedding

In the portfolio, the project page shows a recording of one run (`assets/video/pipeline-3d.mp4`, made with `tools/record_demo.py`) and the live demo is embedded on `/projects/pipeline-3d/simulation/` by `js/demos.js`. The general pattern:

```html
<iframe id="blast-demo" src="demo/?theme=light" title="Blast-aware route planning, interactive demo"
        loading="lazy" style="display:block;width:100%;height:960px;border:0"></iframe>
<script>
  // the demo posts its height so the iframe can fit it at any width
  addEventListener('message', e => {
    const f = document.getElementById('blast-demo');
    if (f && e.source === f.contentWindow && e.data && e.data.type === 'blast-demo:height') f.style.height = e.data.height + 'px';
  });
</script>
```
