# Stack exceptions

The mechanisms the owner allowed to deviate from the stack decisions (`docs.stack_exceptions`). A tool-fit plan line names a row (`- Exception EX-01 (<this file>) for <what>`); the stack hunt treats a mechanism a row covers as a comment, and one no row covers as blocking. A row is added only by the owner's decision, in a pull request the owner reads (`protected_files`).

| Id | Mechanism | Deviates from | The invariant the tool can't hold | Docs page read | Decided | Until |
| --- | --- | --- | --- | --- | --- | --- |
| EX-01 | <what was built, at `<path>`> | §<n> <tool> | <why the chosen tool doesn't fit> | <url> | <date, owner> | <the condition that ends it> |
