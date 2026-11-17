# Review checklist

The project's per-change checklist (`docs.review_checklist`): the question file of the PR gate's reviewer session, on every PR. Each item carries its severity: a finding on a `(must-fix)` item fails the step; on a `(comment)` item it is a follow-up. Only items are list entries. The phase exit's lessons propose items to add and prune; the owner decides.

**By kind of diff.** A prose-only diff (docs, no code, config or rules) answers only the Docs items. A diff of only rules and their tests (`.agents/rules.yaml`, its baseline, the rules' tests) answers only the Rules items, in one round: a way around a rule is listed as a comment, not fixed. Any other diff, mixed included, answers every item. A row outside the diff's kind is `no` (naming the kind) and `n/a`.

## Docs

1. (must-fix) Is every statement the diff makes true of the code at the candidate?
2. (must-fix) Is every doc the diff makes stale updated in this diff?

## Rules

3. (must-fix) Does each new or changed rule enforce a decision the project has written down, the one its `decision` names?
4. (must-fix) Does it decide exactly, leaving no judgment to whoever reads its finding?
5. (must-fix) Does it flag no sound code? Run `lc-rules check` at the candidate and read every finding it adds.
6. (must-fix) Is it shown red and green: `lc-rules selftest` passes, and each example is the case its decision names?

## The project's rules

7. (must-fix) <a written decision a diff can break that no rule kind fits exactly>. Where: <paths>.
8. (comment) <a convention, e.g. one way to page a list>.
