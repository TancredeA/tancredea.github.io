*Claim.* The benchmarks validate the accuracy and the efficiency of the method.

*Reading.* On MNIST, the tensor network reaches 95.8 % after one epoch, against 94.2 % for a dense network after one epoch; but the dense network climbs to 97.6 % after 60 epochs, and earlier tensor-network classifiers perform comparably. The authors themselves report a training time per epoch that grows exponentially with the number of tensors.

*Verdict.* Accuracy, yes; efficiency, not yet. The authors present MNIST as a proof of concept, and it should be read that way.
