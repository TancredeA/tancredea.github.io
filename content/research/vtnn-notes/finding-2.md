*Claim.* A local, DMRG-inspired gradient descent trains the tensorised layers, alongside dense layers.

*Reading.* Two neighbouring tensors are merged into a bond tensor, updated by a gradient step (computed by hand, or by automatic differentiation for non-linear activations), then split again by SVD and truncated. The two-site sweep is the heart of DMRG and had trained standalone matrix product states (Stoudenmire & Schwab, 2016; Han et al., 2018); here it trains layers that are part of an ordinary deep network. One slip in passing: the article's gradient step (its Eq. 7), taken literally, climbs the loss instead of descending it.

*Verdict.* This is the paper's real novelty: the training procedure, applied inside a hybrid network, doubles as a measuring instrument.
