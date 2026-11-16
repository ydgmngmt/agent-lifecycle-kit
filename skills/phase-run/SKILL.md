---
name: phase-run
description: Use when running a phase's end-to-end run on the frozen candidate, or rerunning its steps after a defect fix.
---

# Phase run

Inputs: `CANDIDATE`, a lane, the exit criteria in `docs.roadmap`, and the steps in `docs.phase_review`.

1. Check out `CANDIDATE` detached, on an otherwise quiet machine (`machine`).
2. Run `profiles.phase`. It runs the steps in the order `docs.phase_review` gives: a fresh stack, the browser journeys that cover the exit criteria, the other suites (contract or golden replay, speed budgets), and the volume pass last. Keep each step's log.
3. Each failing step is a finding ([finding.md](../lifecycle/finding.md)), with the step and its log as evidence. Invoke `diagnosing-bugs` to find the cause before you file it.
4. For each bug found live, add the step that would have caught it to the phase run, in the fix PR.
5. After a defect fix, rerun only the steps that cover the changed flows.

Done when every step has PASS / FAIL with its log and elapsed time, and each failure is a finding.
