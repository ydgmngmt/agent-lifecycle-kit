---
name: phase-exit
description: Use when a phase's last PR has merged and the phase must be verified, reviewed and closed.
---

# Phase exit

The project's procedure is `docs.phase_review`; this is the order and who does what.

1. **Freeze.** `START` is main before the phase's first merge. `CANDIDATE` is main after its last merge, with green CI. Everything below reads `CANDIDATE` from a detached worktree.
2. **Evidence.** One session collects the evidence folder, using the commands in `docs.phase_review`. No judgment at this step.
3. **Phase run**, on a lane: invoke `phase-run`.
4. **Review**, alongside the run. One session per dimension: `review-owners-layers`, `review-reuse`, `review-types-boundaries`, `review-effects-security`, `review-docs-tests`, plus `duplication-check` and `dead-code-check`. One session may take them in order for a small phase.
5. **One findings list.** The lead reads the cited lines of every finding and gives each a disposition ([finding.md](../lifecycle/finding.md)). A critical finding goes to the orchestrator at once.
6. **Fixes.** One PR for the fixes and one for the defects, each through `pr-check`. The orchestrator gives them to a session: the implementer if it is still running, otherwise a fresh one. Rerun the phase-run steps that cover each changed flow. Invoke `domain-modeling` to bring the stories, journeys, roadmap and glossary in line with what was built.
7. **Close.** The phase is closed when the run passes its exit criteria, the fixes and defects have merged and their flows were rerun. Write the phase record (`docs.phase_records`): both commits, the PRs, each finding with its disposition, and the time each step took. The next phase's building may start before the close; the phase is not called done until then.
