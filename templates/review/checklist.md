# Review checklist

The project's per-change checklist (`docs.review_checklist`): the question file of the PR gate's reviewer session. Each item carries its severity: a finding on a `(must-fix)` item fails the step; on a `(comment)` item it is a follow-up. Only items are list entries. The phase exit's lessons propose items to add and prune; the owner decides.

## The project's rules

1. (must-fix) <a rule a diff can break, e.g. every query filters by tenant>. Where: <paths>.
2. (comment) <a convention, e.g. one way to page a list>.
