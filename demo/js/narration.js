// Step texts (English). Each step: a short title, one or two plain sentences, and a "Why?"
// note for the one technical term it introduces.

export const STEPS = 6;

const fmt = (v, d = 1) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export function narration(step, c = {}) {
  switch (step) {
    case 0: return {
      title: 'Where was the device found?',
      body: 'A synthetic neighbourhood, 80 × 80 m. Buildings are coloured by how critical they are; B is the disposal site. Click (or tap) where the device was found.',
      term: 'disposal site', why: 'Disposal site: the point farthest from any building, among cells at least 3 m from the edge of the map.',
    };
    case 1: return {
      title: 'A cheap first estimate',
      body: 'Physics formulas give a fast but rough danger map. They ignore how blast waves bounce off and around buildings. The dashed line is the safest route according to this map: a first guess.',
      term: 'physics formulas', why: `An empirical blast law (Kinney–Graham, a Kingery–Bulmash-type scaled-distance law) gives the overpressure from distance and charge mass. Each building in the way multiplies it by 0.8. Danger at a point = damage an explosion there would do to the buildings, weighted by their importance.`,
    };
    case 2: return c.single ? {
      title: `Simulation ${c.n}`,
      body: 'One more simulation, at the point chosen for the route.',
      term: 'simulation', why: whySim,
    } : {
      title: 'A few real simulations',
      body: 'A simulation solves the wave equation around the buildings: watch the front reflect off walls and leave shadows behind them. Simulations are expensive, so they are spent sparingly.',
      term: 'simulation', why: whySim,
    };
    case 3: return c.iter ? {
      title: 'Update the correction',
      body: `With ${c.n} simulations, the model of where the cheap map is wrong gets sharper, and its uncertainty shrinks.`,
      term: 'uncertainty', why: whyGP,
    } : {
      title: 'Learn the correction',
      body: 'A statistical model learns where the cheap map was wrong (+ it under-estimated, − it over-estimated) and how sure it is. Uncertainty collapses around the simulated points.',
      term: 'statistical model', why: whyGP,
    };
    case 4: return {
      title: c.iter ? 'Search the route again' : 'Search the route',
      body: c.iter
        ? 'The search runs again on the corrected map. The faint line is the previous route.'
        : 'The safest route minimises the danger accumulated along the way. The search spreads out from A in bands of equal cost until it reaches B.',
      term: 'bands of equal cost', why: 'Delta-Stepping: a shortest-path algorithm that settles nodes in buckets of width Δ (here the 25th percentile of the edge costs), so that each bucket could be processed in parallel. It finds the same route as Dijkstra.',
    };
    case 5: return {
      title: 'Choose where to simulate next',
      body: 'Only uncertainty that could change the route matters. The next simulation goes where the danger near the route is least certain.',
      term: 'least certain', why: 'Acquisition score = 0.7 × uncertainty inside a 5 m corridor around the route + 0.3 × uncertainty relative to the estimated danger anywhere. Cells within 3 m of a past simulation are excluded.',
    };
    case 6: return {
      title: c.reason === 'converged' ? 'Result: converged' : 'Result: budget reached',
      body: c.reason === 'converged'
        ? `Uncertainty along the route fell below 5 % of its danger (${fmt(100 * c.rel)} %) after ${c.n} simulations.`
        : `The budget of ${c.n} simulations ran out before uncertainty along the route fell below 5 % of its danger (it is ${fmt(100 * c.rel)} %). The route is the best estimate with that budget, not a converged one.`,
      term: 'uncertainty along the route', why: 'σ_cum,rel = sum of the uncertainty σ over the corridor ÷ sum of the estimated danger μ over the corridor.',
    };
  }
  return { title: '', body: '' };
}

const whySim = 'Here a simple 2D acoustic solver stands in for the high-fidelity blast code. It is linear and has no shocks; it is calibrated so that in open space it agrees with the blast law, and differs only through reflections, diffraction and shadows.';
const whyGP = 'A Gaussian process (Matérn 5/2 kernel) fitted to the differences between simulation and blast law. Its mean corrects the map; its standard deviation σ says how much to trust the correction.';

export const REAL_PROJECT = 'In the real project: 19 simulations instead of 10,000 positions; each run took minutes to hours on a supercomputer.';

export const DISCLAIMER = 'Toy reimplementation for illustration only. The original project used ARMEN, a high-fidelity hydrodynamics code from CEA-DAM, on a supercomputer. Here a simple 2D acoustic solver plays that role. No code, data or results from the original project are used. The scenario (moving an unexploded device to a disposal site) is a motivating example. The scene is synthetic and randomly generated.';
