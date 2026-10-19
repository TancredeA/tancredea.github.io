*Problem.* Routing needs neither the maximum nor the minimum of the danger map, only an accurate map along the route.

*Choice.* In 2D, acquire inside an 8 m corridor around the current optimal path, keep some global exploration, and stop at 5 %. The 3D pipeline uses a standard UCB rule.

*Why.* The stopping rule measures uncertainty accumulated along the route, which matches a sum-of-costs objective.
