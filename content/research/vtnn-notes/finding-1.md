*Claim.* The abstract presents the method as an answer to the scalability limits of deep networks.

*Reading.* Tensorising layers is an established line: in 2015, Novikov et al. stored fully connected layers in tensor-train format, trained them by back-propagation among ordinary convolutional and dense layers, and compressed them by up to four orders of magnitude; Gao et al. compressed whole networks with matrix product operators in 2020.

*Verdict.* Neither the compression nor the hybrid stack is new on its own, and the paper does not compare its parameter counts with these earlier layers.
