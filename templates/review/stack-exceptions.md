# Stack exceptions

The mechanisms the owner allowed to deviate from the stack decisions (`docs.stack_exceptions`). A `## Tool fit` line names its row (`- Exception EX-01 (<this file>) for <what>`); the stack hunt treats a covered mechanism as P3, an uncovered one as P2. Rows are added only by the owner's decision, in a PR the owner reads.

| Id | Mechanism | Deviates from | The invariant the tool can't hold | Docs page read | Decided | Until |
| --- | --- | --- | --- | --- | --- | --- |
| EX-01 | <what was built, at `<path>`> | §<n> <tool> | <why the chosen tool doesn't fit> | <url> | <date, owner> | <the condition that ends it> |
