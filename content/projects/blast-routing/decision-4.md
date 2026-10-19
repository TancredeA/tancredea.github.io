*Problem.* A turn penalty depends on three consecutive nodes, so it is not additive over edges and a plain shortest-path search cannot optimize it.

*Choice.* Parallel Delta-Stepping (MPI) on 2D and volumetric graphs. On the 3D terrain surface, A* on states (node, incoming direction).

*Why.* The augmented state makes turn and slope penalties edge-additive, and a consistent heuristic keeps A* optimal. On 2,500 surface nodes, sequential A* beats parallel Delta-Stepping.
