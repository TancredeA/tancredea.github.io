*The question.* If Timothé may only ask yes/no questions, how many does he need, whatever Perrine answers?

*A lower bound.* There are n! possible plans. Whatever the question, the worst answer leaves the larger part of the plans still possible, so at best each answer halves them.

*A strategy that reaches it.* Number all the plans and write their numbers in base 2. Timothé asks for the digits one by one: each answer reveals one bit, and ⌊log₂(n!)⌋ + 1 questions are enough. We proved this number optimal.
