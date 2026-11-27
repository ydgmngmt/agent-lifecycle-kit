---
name: lifecycle
description: ADLC (agent-driven development lifecycle) map: its steps, roles and gates, and which skill fires at each. Use at the start of any session in a repository that has `.agents/project.yaml`, or when unsure which step you are in or which skill applies.
---

# ADLC (agent-driven development lifecycle)

Diagram: [docs/adlc.svg](../../docs/adlc.svg). Read `.agents/project.yaml` first; skills name its keys as `docs.testing`, `profiles.pr`. A value is literal or a pointer (`path#section`) to the repo file that holds it: follow the pointer, never copy. Where the project's `docs.lifecycle` page says more than this skill, it wins.

The build runs on pstack. The kit adds what pstack has none of: the plan step, sessions with a board, checks the host enforces, and the stage exit. A pstack skill is used as written wherever one fits; `adlc-mode` is the kit's fork of pstack's poteto-mode and names every difference.

## Steps

A **stage** is one phase of the roadmap, built on its own branch (`stage.branch`).

1. **Plan:** requirements → stories → stages (`docs.roadmap`), then the stage's acceptance criteria (`shape-product`). The lead splits the stage into pull requests with pstack's Multi-phase plan playbook (`lead`).
2. **Build:** pstack's Autopilot-full, through `adlc-mode`. One owner session per pull request, on a branch off the stage branch; it picks the playbook that fits (Feature, Bug fix, Refactoring, Perf issue) and delegates the code to its own subagents.
3. **PR exit**, per pull request: the host's required checks (`ci.required_checks`: tests, rules, the flow scripts covering the diff, the formal check where the project has one), then the lead's swarm of verifiers that wrote none of the code. The PR owner merges into the stage branch only what both cleared.
4. **Nightly on the default branch:** `profiles.nightly`, green and on time.
5. **Stage exit**, once the plan's pull requests have merged: the gate on the stage branch's pull request into the default branch (`stage-exit`). Then the docs sweep (`update-docs`) and the next stage.

A fix found at any gate goes back to the build, and is verified by the same rules.

## The stage exit's gate

`gate_pr:` in the project file declares its steps, one line each (`<step>: <kind> <argument> [if <paths key>] [after <step>]`); the order lives there only. With `gate_pr_only: default-branch`, it judges only a pull request into the default branch. `lc-gate` walks the list; each step leaves a record (PASS, FAIL, or N/A with a reason) bound to the candidate commit, and `lc-gate check` refuses while one is missing, stale or failed.

| Kind | Who does it |
| --- | --- |
| `command` | the runner runs it and records its exit |
| `workflow` | the runner starts the CI workflow and records the run |
| `checks` | the runner reads the host's required checks on the exact commit |
| `session` | the runner spawns a session (`review`) on `sessions.gate_model`; it records its own step |

- `lc-gate run pr <stage branch> --wait` does the next thing for each step without a record, and returns when a step changes.
- `lc-gate status pr <stage branch>`: one row per step. Read it before saying anything about the gate.
- `lc-gate enforcement`: what refuses without each step, and whether each layer is on. Read it before calling a gate binding.
- `lc-gate merge pr <stage branch>`: the one way a stage enters the default branch.

Terms:

- **Full review:** the first review of the stage.
- **Follow-up review:** any later one, scoped to the change since. It starts by itself.
- **Holds:** a record still counts for a new head by rule (a clean merge of the default branch; a command's `if` paths untouched).
- **Carry:** the lead's manual act of keeping a record for a new head, with a reason.
- **Verdict:** the swarm's `PASS`, `PASS+NOTES` or `FAIL` on a pull request into the stage branch, posted as a comment with the commit it covers.

## Roles

- **Owner:** a person. Decides product meaning, scope, access, spend and authority; agrees each stage's acceptance criteria; approves `owner_approval` changes; confirms a brief marked `rigor: critical`.
- **Lead:** one session per stage (`sessions.lead`), the root of Autopilot-full. Plans, starts owner sessions, runs the swarm and owns its verdicts, runs the stage exit, keeps the running log and the board.
- **PR owner:** one session per pull request, from build to merge.
- **Verifiers:** the lead's subagents, per pull request; they wrote none of its code.
- **Gate sessions:** each started by `lc-gate run` with one question file.
- **Board keeper:** a cheap session that keeps the board true (`board`).

Owner sessions reach the lead with `lc-tell lead`. Anything changing scope, a product rule or the plan goes to the lead, and from the lead to the owner on the board.

## What enforces what

Say plainly which part the host enforces (required checks on the stage branch and the default branch) and which holds by a hook and its records (the stage exit); check `ci.enforcement` and `lc-gate enforcement` first. The swarm's verdict is the playbook's rule, kept by the lead and the owner session: no hook reads it. A record shows a step ran, not that its result is right.

## Which skill fires when

| Step | Kit skill | pstack (read at `<pstack>/skills/`), and others |
| --- | --- | --- |
| Product scope, criteria | `shape-product` | `grilling`, `domain-modeling` (mattpocock-skills); Investigation, **how**, **why** for facts |
| Splitting a stage | `lead` | Multi-phase plan, Prototype, **architect** |
| Leading a stage | `lead`, `adlc-mode` | Autopilot-full, **swarm**, **ketchup**, Babysit |
| Building a pull request | `adlc-mode` | Feature, Bug fix, Refactoring, Perf issue, Opening a PR; **architect**, **statechart**, **tdd**, **no-comments**, the principles |
| Proving it live | the project's `verify-<app>` | **create-verification-skill**, **maintain-verification-skill** |
| Stage exit | `stage-exit`, `review` | Thermos (vendored rubrics), the kit's stack hunt |
| A critical brief | `adlc-mode` | **arena**, **interrogate** |
| New repository | `bootstrap` | **setup-pstack**, **create-verification-skill**, **create-formal-verification-skill** |
| "Update the docs" | `update-docs` | `domain-modeling`; **technical-writing**, **unslop** |
| Board | `board` | none |

`lc-pstack path` prints `<pstack>`. Most pstack skills load only by reading their file, as `adlc-mode` says. Shared: [finding.md](finding.md) (the finding format and dispositions), [report.md](report.md) (an owner session's merge-ready report).
