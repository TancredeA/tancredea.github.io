*Problem.* Two models scoring 0.84 and 0.83 on one test set may not differ at all; and riding data are autocorrelated, so a random split leaks the test set into training.

*Choice.* Split by whole riding sessions (70 / 15 / 15), tune on validation only, open the test set once per model; compare models pairwise with McNemar's test and bootstrap confidence intervals on macro F1; measure size, latency and the rate of spurious shifts on the board itself.

*Why.* The model kept for the board has to win on statistics, not on one lucky ride, and the gap between the offline score and the behaviour on the road has to be measured rather than assumed.
