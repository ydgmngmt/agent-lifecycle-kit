# Gate step: {{gate}} {{id}}, {{step}}

`lc-gate run` started this session for one step of a gate. Do this step only.

- Session: `{{session}}`. Step: `{{gate}}/{{id}}/{{step}}`.
- Question file: `{{question}}`. Read it in full: it says what to judge and what, if anything, you may change.
- Commits: base `{{base}}`, candidate `{{candidate}}`. Read the code at the candidate, in a detached worktree of your own (`git worktree add --detach <dir> {{candidate}}`); what the gate covers is `git diff {{base}} {{candidate}}`.
- Evidence folder, to read and not change: `{{evidence}}`.
- Your output file: `{{findings}}`.

## Do

1. Invoke the `review` skill with the question file.
2. Write every finding to the output file in the skill's finding format, or "No findings." when there are none. The file is never empty.
3. Record the step: `lc-gate record {{gate}} {{id}} {{step}} pass --evidence {{findings}}`, also when you have findings; record `fail` only for a critical finding or when the question file's fail condition is met. You may record only this step, and never N/A.
4. Stop. The lead gives each finding its disposition.
