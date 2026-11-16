# Phase review

The check of a phase's integrated result, between its last merge and the phase being closed. A PR's review sees one change; this one sees what the changes add up to. The order is fixed:

**freeze → evidence → phase run and review → one findings list → fix PRs → rerun the affected flows → close.**

## 1. Freeze
`START` is main before the phase's first merge. `CANDIDATE` is main after its last merge, with green CI. Record both. Everything below reads `CANDIDATE` from a detached worktree.

## 2. Evidence
One session collects the facts every reviewer starts from, without judgment:

```bash
git log --first-parent --merges --format='%h %s' START..CANDIDATE > prs.txt
git diff --name-only START CANDIDATE > files.txt
git diff START CANDIDATE -- <public entry points, package manifests, API contract> > surface.diff
git diff -U0 START CANDIDATE -- <quality baseline dir> | grep '^+[^+]' > baseline-grown.txt
<report-only lint on the phase's files> > phase-lint.txt
<each quality check with --list, filtered to files.txt> > baselined.txt
```

Add the last nightly's result.

## 3. Phase run
`verify:phase` on `CANDIDATE`, on a lane: <steps in order>. A failing step is a finding.

## 4. Review
One session per dimension, or one session in order for a small phase. Each reads the code at `CANDIDATE`, changes nothing, and doesn't see the other files: owners and layers, reuse, types and boundaries, effects and security, docs and tests, duplication, dead code. Reviewers may use `code-review` with its subagents; its output is rewritten into the finding format.

## 5. One findings list
The lead reads the cited lines of every finding and gives each a disposition (fix, defect, issue, owner, rejected). The list is then closed; anything found later becomes an issue. A critical finding goes to the orchestrator at once.

## 6. Fixes
One PR for the fixes and one for the defects, given to a session by the orchestrator. Each passes the PR check. Each defect is checked live through the path it changes.

## 7. Close
Rerun the phase-run steps that cover the changed flows. The phase is closed when the run passes its exit criteria and the fixes have merged and been rerun. Write the phase record: both commits, the PRs, each finding with its disposition and issue or PR, and the time each step took.
