---
name: phase-exit
description: Use when a phase's PRs have all merged and the phase must be verified against its acceptance criteria, reviewed and closed.
---

# Phase exit

The project's procedure is `docs.phase_review`; this is the order and who does what.

1. **Freeze.** `START` is main before the phase's first merge. `CANDIDATE` is main after its last merge, with green CI and a green nightly on it, or one started now. Everything below reads `CANDIDATE` from a detached worktree.
2. **Evidence folder.** One session collects the review evidence using the commands in `docs.phase_review`. No judgment at this step.
3. **Browser E2E and other checks**, on a lane: invoke `phase-run`. It records pass or fail for each acceptance criterion, with traces and the commit SHA.
4. **Phase review**, alongside the run. One session per dimension: `review-owners-layers`, `review-reuse`, `review-types-boundaries`, `review-effects-security`, `review-docs-tests`, plus `duplication-check` and `dead-code-check`. One session may take them in order for a small phase.
5. **Disposition.** The lead reads the cited lines of every finding and gives each a disposition ([finding.md](../lifecycle/finding.md)).
   - A **failed acceptance criterion blocks** the phase.
   - Every other finding becomes a **follow-up PR** or an issue. It is tracked in the roadmap and doesn't block.
   - Each bug found live adds a regression check to the phase run.
6. **Fix and retest.** Blocking failures loop back to implementation. The orchestrator gives each fix to a session: the PR's implementer if it is still running, otherwise a fresh one. Each fix passes `pr-check`, and the phase-run steps for its criteria are rerun at the new candidate.
7. **Present to the owner.** A passed check is not acceptance. Show the owner each of the phase's journeys run live on a fresh stack, and give him, per journey, the exact steps to try it himself. He decides whether the phase is accepted.
8. **Exit.** When every acceptance criterion passes and the owner has accepted the journeys, the phase exits and the next one starts. Run `update-docs` to bring both sets of documents in line with what was built. Freeze also runs the full integration suite once on `CANDIDATE`, after the last merge. Exit needs a green phase run on `CANDIDATE` (the workflow run URL where the project has one) with every MANUAL row decided. Write the phase record (`docs.phase_records`): the phase run URL, both commits, the evidence per criterion, the PRs, each finding with its disposition and follow-up, and the time each step took.
