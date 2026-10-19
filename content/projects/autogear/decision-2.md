*Problem.* Out of 100 samples, about 95 say “keep the gear”, 3 “shift up” and 2 “shift down”. A model that never shifts scores 95 % accuracy and is useless; and a shift at the wrong moment hurts more than a missed one.

*Choice.* Stage 1 decides whether to shift, with class weights and a tuned threshold; stage 2, trained only on real shifts (a small but balanced set), decides up or down. Then safeguards: a 1–2 s cooldown, a vote over consecutive samples, no shift below the first gear or above the last.

*Why.* The imbalance is confined to one binary model that handles it explicitly, the threshold becomes a knob between reactivity and caution, and models are scored on macro F1 rather than accuracy.
