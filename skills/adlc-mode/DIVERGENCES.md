# Where adlc-mode differs from pstack

`adlc-mode` is a fork of five files of pstack's poteto-mode (MIT, © its authors; licence in [upstream/LICENSE](upstream/LICENSE)). The untouched copies are in [upstream/](upstream/), so `diff -u upstream/<file> <file>` shows every change exactly, and `lc-pstack diff` shows what moved upstream since. Everything else in pstack (its 24 principles, every other skill and playbook) is read from the installed plugin, unmodified.

The rule for a change: pstack is used as written unless the owner decided otherwise, or the step names something that only exists in Cursor.

| File | Change | Why |
| --- | --- | --- |
| `SKILL.md` | Name, description, and where pstack's files are (`lc-pstack path`); whoever is told to read poteto-mode reads this file | It lives in the kit, not beside pstack's skills |
| `SKILL.md` | arena and interrogate only for a kickoff marked `rigor: critical`; this overrides the skills and playbooks that route to them | Owner's decision: bake-offs only for very complex or critical work, confirmed on the board |
| `SKILL.md` | A statechart during design when a state machine or concurrent protocol changes; the project's formal verification skill kept in step | Owner's decision: formal verification where feasible. Upstream only offers it |
| `SKILL.md` | A correction runs **correct** in the same fix, into `lc-rules` and the rule table; no comments in new code; a proof for an algorithm with a property over every input; properties for a changed screen | Owner's decision after the author's talk "All Code Is Slop (Except Mine)": every correction becomes a deterministic check. Upstream leaves `/correct` to the operator |
| `SKILL.md` | "Always pause" covers a change that loosens a `protected_files` file | The kit's rule: rule files change only in a PR the owner reads; adding a rule must not wait |
| `playbooks/opening-a-pr.md` | `## Verification` links the artifacts: recording or screenshot, statechart, proof output | Owner's decision: review by artifacts, as the talk describes |
| `SKILL.md` | A missing tool is installed from the kit's baseline list | Upstream assumes mise and its own team's tools are present |
| `SKILL.md` | Trunk is the stage branch; only the stage exit merges into the default branch | The kit's stage exit gates the default branch |
| `SKILL.md` | A control skill is the project's verification skill, its flow scripts first | `control-ui` and `control-cli` are Cursor's; scripts cost no model tokens on a green run |
| `SKILL.md` | deslop is read from the kit's vendored copy | `cursor-team-kit` is not installable in Claude Code |
| `SKILL.md` | `/loop` is Claude Code's; the owner is asked on the board | Cursor's loop and question tool don't exist here; an open dialog stops the watchdog |
| `SKILL.md` | show-me-your-work's cross-model review of the trail only when critical | A second vendor is not available in Claude Code, and it is a panel seat |
| `SKILL.md` | The swarm's audit lane runs on the `judgment and prose` model | Owner's decision: scripts on Sonnet, judgement on Opus |
| `playbooks/feature.md` | Step 2 names the statechart; step 4's arena and step 7's interrogate only when critical | As above |
| `playbooks/autopilot-full.md` | PR owners are `lc-spawn` sessions that report with `lc-tell`; the trail lives in `handoff_dir` | Cursor cloud agents don't exist here; a tmux session is the closest thing that outlives the lead |
| `playbooks/autopilot-full.md` | A full swarm is two named lanes (run, audit); the verdict is posted on the PR | Owner's decision on lanes and models; the comment is pstack's own Shipping rule |
| `playbooks/autopilot-full.md` | The PR owner merges with `gh pr merge --squash` into the stage branch, behind the host's required checks | Owner's decision: plain autopilot merge, with the mechanical checks enforced by the host |
| `playbooks/autopilot-full.md` | The audit is the kit's watchdog job, scheduled at session start (the `lead` skill); a new step 7 hands over to the stage exit | The watchdog also keeps the board and its keeper, which the lead needs before the go; the stage exit is the kit's |
| `playbooks/autopilot-full.md` | Trunk is the stage branch and the queue is the stage's plan file; the reply keeps the board true | The kit's branches and plan step; the owner watches the board |
| `playbooks/autopilot-full.md`, `playbooks/opening-a-pr.md` | deslop is read from the kit's vendored copy | As in `SKILL.md` |
| `playbooks/opening-a-pr.md` | Base is the stage branch; the commit profile and rules before each push; the `## Tool fit` section | The kit's checks, and the claim the stack review reads |
| `worker.md` | None | It must sit beside the skill that names it |

Vendored, unmodified (`vendor/`, checked by `lc-pstack check`): the Thermos plugin's two audit rubrics and `cursor-team-kit`'s deslop skill. Neither plugin is published for Claude Code.
