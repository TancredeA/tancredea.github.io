*Problem.* The decision runs on an Arduino Nano 33 BLE Sense Rev2 (Cortex-M4 at 64 MHz, 1 MB of flash, 256 KB of RAM, built-in inertial unit), every 200–500 ms, beside the firmware and the Bluetooth stack.

*Choice.* Budgets set before training: under 100 KB of flash and 30 KB of RAM for the model, under 100 ms per decision. Gradient-boosted trees (XGBoost) are the lead candidate, constrained to depth 4 and at most 100 trees, and exported to plain C.

*Why.* A tree ensemble costs a few hundred comparisons, tens of microseconds, needs no ML runtime on the board, and stays readable (feature importances, SHAP) when a decision on the road has to be explained. Its weakness, no native sense of time, is covered by hand-built temporal features: trends, rolling statistics, time since the last shift.
