## The problem

An explosion in a dense urban area does not spread evenly: buildings reflect, channel and shadow the blast wave. The question set by the CEA-DAM was how to move from high-fidelity blast simulations to a decision that someone can act on, namely the least dangerous route between two points.

<span class="todo">TODO: exact framing of the brief, scale of the domain, constraints.</span>

## Approach

1. **Simulation.** <span class="todo">TODO: solver, mesh, what the HPC runs produced.</span>
2. **Exposure field.** <span class="todo">TODO: how pressure fields were turned into a cost per cell.</span>
3. **Pathfinding.** <span class="todo">TODO: algorithm (A*, Dijkstra, other), cost function, 3D aspects.</span>

The demo above keeps only the last two steps, with a deliberately crude physics: exposure decays with distance and is attenuated behind walls. It shows the trade-off the real pipeline has to make, a longer route against a lower dose.

## Results

<span class="todo">TODO: what the pipeline computes, how long it takes, how it was validated.</span>

## My part

<span class="todo">TODO: what you personally designed, wrote or decided.</span>
