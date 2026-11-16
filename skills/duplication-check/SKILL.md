---
name: duplication-check
description: Use when the duplication check (e.g. jscpd) reports a new clone, or at phase exit to review the clones and baseline entries the phase added.
---

# Duplication check

Inputs: `checks.duplicates` (the command; `--list` prints every finding), its baseline file, `docs.code_map`, and at phase exit `START`, `CANDIDATE` and the evidence folder.

1. Run the check. Take only clones the change or phase added or grew: compare with the baseline, or with `baseline-grown.txt` at phase exit.
2. For each new clone, find which copy is the owner (`docs.code_map`). The remedy is to call the owner, or to move one shared copy to the owner's package. A clone in tests counts too.
3. A baseline entry may grow only with the reason the PR states (a generated file, two formats that must stay separate). At phase exit, a grown entry without a reason is a finding.
4. After a fix, run `checks.duplicates --prune` so the baseline shrinks.

Invoke `codebase-design` when the shared copy needs a new interface. Output: [finding.md](../lifecycle/finding.md), with both `path:line` ranges as the evidence.
