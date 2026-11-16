---
name: review-effects-security
description: Use when reviewing a phase diff (START..CANDIDATE) for effects and security, meaning authorization at each effect, isolation, idempotent outside calls, and states with no way out.
---

# Phase review: effects and security

Inputs: `START`, `CANDIDATE`, the evidence folder, `sensitive` and `docs.code_map`, the project's invariants (`docs.agents`), `docs.review_checklist`. Read the code at `CANDIDATE`, change nothing, and don't read the other reviewers' files.

Start from the phase's files on sensitive paths and what calls them. `code-review` against `START` is optional. Answer:

1. Two paths to the same effect with different checks; a check made before a wait and not again at the effect; a filter applied after a page was cut; a read-then-act outside the effect's transaction.
2. The checklist's security questions, asked of the phase as a whole.
3. An outside call without an operation ID, a timeout or a way to reconcile an unknown outcome.
4. A status that an exception, a restart or a stop can leave with no transition out, or that more than one place writes.

Prove a suspected sequence with `diagnosing-bugs` where you can; otherwise mark it needs-check. Output: [finding.md](../lifecycle/finding.md), then **Checked and sound** and **Not examined**. Send a critical finding to the lead at once.
