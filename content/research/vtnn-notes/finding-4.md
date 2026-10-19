*Claim.* The benchmarks validate the accuracy and the efficiency of the method.

*Reading.* On MNIST, the tensor network reaches 95.8 % after one epoch, against 94.2 % for a dense network after one epoch; but the dense network climbs to 97.6 % after 60 epochs, and the standalone MPS classifier of Stoudenmire & Schwab, which the authors plot for reference, had already reported a test error below 1 %. Training time per epoch grows exponentially with the number of tensors, from minutes against about ten seconds for the dense network.

*Verdict.* Accuracy, yes; efficiency and scalability, no. The authors present MNIST as a proof of concept, and it should be read that way.
