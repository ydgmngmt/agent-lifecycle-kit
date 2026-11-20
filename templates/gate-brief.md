# Gate step {{gate}}/{{id}}/{{step}}

One job: answer every question in `{{question}}` for the change the scope names, with the `review` skill. The whole change is `git diff {{base}} {{candidate}}`.

- Base `{{base}}`; candidate `{{candidate}}`, {{checkout}}.
- Scope: {{scope}}
- {{spec}}
- Evidence folder: `{{evidence}}`.
- Output: `{{findings}}`, one row per question, then the findings.
- Fail rule: any P1 or P2 row, or the question file's fail condition, is `lc-gate record {{gate}} {{id}} {{step}} fail --evidence {{findings}} --candidate {{candidate}}`; otherwise the same with `pass`. A question without a row fails the step.

Read-only: fix nothing. Then stop.
