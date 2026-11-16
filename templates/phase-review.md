# Phase exit

The check of a phase's integrated result against its acceptance criteria, after its last merge. A PR's review sees one change; this one sees what the changes add up to. The order is fixed:

**freeze → evidence folder → browser E2E and other checks, with the phase review → disposition → fix and retest → exit.**

## 1. Freeze
`START` is main before the phase's first merge. `CANDIDATE` is main after its last merge, with green CI and a green nightly. Record both. Everything below reads `CANDIDATE` from a detached worktree.

## 2. Evidence folder
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

## 3. Browser E2E and other checks
`verify:phase` on `CANDIDATE`, on a lane: <steps in order>. It records PASS or FAIL for each acceptance criterion, with traces and the commit SHA, in the phase's acceptance file.

## 4. Phase review
One session per dimension, or one session in order for a small phase. Each reads the code at `CANDIDATE`, changes nothing, and doesn't see the others' files. The dimensions are owners and layers, reuse, types and boundaries, effects and security, docs and tests, duplication, and dead code. Reviewers may use `code-review` with its subagents; its output is rewritten into the finding format.

## 5. Disposition
The lead reads the cited lines of every finding and gives each a disposition:
- A failed acceptance criterion is **blocking**.
- A fix or defect becomes a **follow-up** PR, tracked in the roadmap, and doesn't block.
- The rest is an **issue**, **owner** or **rejected**.

Each bug found live adds a regression check. A critical finding goes to the orchestrator at once.

## 6. Fix and retest
Blocking failures go back to implementation, through the PR check. The phase-run steps for the affected criteria are rerun at the new candidate.

## 7. Exit
When every acceptance criterion passes, the phase exits and the next one starts. Write the phase record: both commits, the evidence per criterion, the PRs, each finding with its disposition and follow-up, and the time each step took.
