---
name: phase-run
description: Use when running a phase's browser E2E run and other checks on the frozen candidate, or rerunning their steps after a fix.
---

# Phase run

Inputs: `CANDIDATE`, a lane, the phase's acceptance criteria, and the steps in `docs.phase_review`.

1. Check out `CANDIDATE` detached, on an otherwise quiet machine (`machine`).
2. Run `profiles.phase`. It runs the steps in the order `docs.phase_review` gives: a fresh stack, the phase journeys, the API replay tests, navigation speed and the data-volume pass last. Keep each step's log and traces.
3. **Evidence per acceptance criterion:** fill the evidence table of the [acceptance template](../../templates/acceptance.md) with PASS or FAIL, the trace (log, screenshot, network trace) and the commit SHA. A criterion that no step decided is NOT TESTED, never PASS.
4. Each failure is a finding ([finding.md](../lifecycle/finding.md)), with the step and its log as evidence. Invoke `diagnosing-bugs` to find the cause before you file it.
5. For each bug found live, add the regression check that would have caught it, in the fix PR.
6. After a fix, rerun the steps that decide the criteria it touches, at the new candidate.

Done when every acceptance criterion has a result with a trace and a SHA, and each failure is a finding.
