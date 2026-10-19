*Problem.* The layout χ has one degree of freedom per wall node; finite differences would need one Helmholtz solve per node and per iteration.

*Choice.* An adjoint state q, solution of one more Helmholtz problem, gives the derivative of J at every point of the wall at once.

*Why.* The cost of the gradient no longer depends on the number of wall nodes: two solves per iteration, for p and q, which is what makes the descent affordable.
