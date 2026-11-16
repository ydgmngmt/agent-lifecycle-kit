---
name: dead-code-check
description: Use when the dead-code check (e.g. Knip) reports a new unused file, export or dependency, or at phase exit to review the dead code the phase added.
---

# Dead-code check

Inputs: `checks.dead_code` (the command; `--list` prints every finding), its baseline file, and at phase exit `START`, `CANDIDATE` and the evidence folder.

1. Run the check. Take only findings in files the change or phase touched.
2. For each one, find out why nothing uses it: left behind by a refactor (delete it), built ahead of need (delete it; the brief's later PR adds it back), or used only by a test (move it next to the test, or delete both if the test only covers it).
3. Before deleting, confirm no dynamic use: search for the name as a string, a route, or a config key.
4. After a fix, run `checks.dead_code --prune`. A grown baseline entry needs the PR's reason.

Output: [finding.md](../lifecycle/finding.md).
