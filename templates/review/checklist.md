# Review checklist

The project's per-change checklist (`docs.review_checklist`): the question file of the PR gate's reviewer session, on every PR. Each item carries its level (the `review` skill); a P1 or P2 finding fails the step. Only items are list entries. The phase exit's lessons propose items to add and prune; the owner decides.

**By kind of diff.** Every diff answers the Brief item first. A prose-only diff (docs, no code, config or rules) answers only the Docs items besides. A diff of only rules and their tests (`.agents/rules.yaml`, its baseline, the rules' tests) answers only the Rules items, in one round: a way around a rule is P3. Any other diff, mixed included, answers every item. A row outside the diff's kind is `no` (naming the kind) and `n/a`.

## The brief

1. (P2) Does the diff do everything its brief's "Done when" lines say, and nothing outside its scope? With no brief known, the PR body is the brief.

## Docs

2. (P2) Is every statement the diff makes true of the code at the candidate?
3. (P2) Is every doc the diff makes stale updated in this diff?

## Rules

4. (P2) Does each new or changed rule enforce a decision the project has written down, the one its `decision` names?
5. (P2) Does it decide exactly, leaving no judgment to whoever reads its finding?
6. (P2) Does it flag no sound code? Run `lc-rules check` at the candidate and read every finding it adds.
7. (P2) Is it shown red and green: `lc-rules selftest` passes, and each example is the case its decision names?

## The project's rules

8. (P2) <a written decision a diff can break that no rule kind fits exactly>. Where: <paths>.
9. (P3) <a convention, e.g. one way to page a list>.
