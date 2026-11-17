# Phase exit: <project name>

This page holds the project's values for the phase exit; the steps are `gate_phase:` in `.agents/project.yaml`, and the procedure is the kit's `phase-exit` skill. The second half is the shape of the phase record that `lc-gate status phase <id> --write` writes into `docs.phase_records`.

## The project's values

**Evidence folder** (the freeze step's script writes it, at `CANDIDATE`, without judgment):

```bash
git log --first-parent --merges --format='%h %s' START..CANDIDATE > prs.txt
git diff --name-only START CANDIDATE > files.txt
git diff START CANDIDATE -- <public entry points, package manifests, API contract> > surface.diff
git diff -U0 START CANDIDATE -- <quality baseline dir> | grep '^+[^+]' > baseline-grown.txt
<report-only lint on the phase's files> > phase-lint.txt   # no linter: drop this line
<each quality check with --list, filtered to files.txt> > baselined.txt
```

**Regression run** (`verify:phase` in the phase workflow; no CI host: a `gate_phase` command step): <its steps in order, e.g. a fresh stack, the phase journeys, API replay, navigation budgets, data volume last>. It writes one row per acceptance criterion: PASS, FAIL, NOT TESTED or MANUAL, with the trace and the SHA.

**Integration:** <the full integration suite, rerun on `CANDIDATE`>.

**Question files:** <where the review question files live>.

## The phase record (generated)

```markdown
# Phase <id>: <phase name>

- START <sha> · CANDIDATE <sha> · <date> · lead <session>
- PRs: <list from prs.txt>

## Steps
| step | kind | status | commit | by | evidence / reason |
| --- | --- | --- | --- | --- | --- |
| <one row per gate_phase step; N/A and carried rows show their reason> |

## Acceptance criteria
| criterion | result | trace | commit |
| --- | --- | --- | --- |
| <phase>-AC1 | PASS / FAIL / NOT TESTED / MANUAL | <path or url> | <sha> |

## Findings
| id | from step | severity | disposition | follow-up |
| --- | --- | --- | --- | --- |

## What was built and why
<from the docs session>

## Acceptance
<the owner's answer, with its date>

## Lessons
<proposed checklist rules, rules pruned>
```

The step evidence files are copied beside the record (`<id>/<step>.<ext>`). A passed check is not acceptance: the record is complete only with the owner's answer.
