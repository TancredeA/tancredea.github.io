*Claim.* The abstract presents the method as an answer to the scalability limits of deep networks.

*Reading.* Tensorising layers is an established line: tensor trains compressed fully connected layers by up to four orders of magnitude (Novikov et al., 2015), matrix product operators compressed whole networks (Gao et al., 2020), and a single matrix product state was already trained with a DMRG-like sweep (Stoudenmire & Schwab, 2016).

*Verdict.* Compression alone is not the novelty. What the paper adds is a multilayer architecture that mixes tensor and dense layers in one training loop.
