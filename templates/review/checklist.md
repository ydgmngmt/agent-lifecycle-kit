# Review checklist

The project's per-change checklist (`docs.review_checklist`): the question file of the PR gate's reviewer session. Each item carries its severity: a finding on a `(must-fix)` item fails the step; on a `(comment)` item it is a follow-up. Only items are list entries. The phase exit's lessons propose items to add and prune; the owner decides.

## Asked on every diff

1. (must-fix) **Dependencies.** Who owns each new dependency: the stack decision that chose it (`docs.stack_decisions`), or the exception row that allows it?
2. (must-fix) **Core exports.** Each new export or re-export of a core package: which caller outside the package needs it today?
3. (comment) **Options.** Who sets each new option or parameter: a caller that passes it today, or the config key it reads? One nothing sets is dead.
4. (comment) **Tests through the entry.** Does each test import through the package's public entry, not its internals?

## The project's rules

5. (must-fix) <a rule a diff can break, e.g. every query filters by tenant>. Where: <paths>.
6. (comment) <a convention, e.g. one way to page a list>.
