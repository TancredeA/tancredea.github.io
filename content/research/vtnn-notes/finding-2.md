*Claim.* A local, DMRG-inspired gradient descent trains the tensorised layers.

*Reading.* The update acts on two neighbouring tensors at once: they are contracted into a bond tensor, updated, then split again by SVD and truncated. That split is what puts the singular values in view at every step; a one-site update, as in earlier tensor-train work, would not produce them.

*Verdict.* This is the technical heart of the paper: the training procedure doubles as a measuring instrument.
