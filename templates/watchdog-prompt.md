# Watchdog prompt

The orchestrator schedules this as a recurring job at session start, every 30 minutes (for example `13,43 * * * *`, off the hour), and recreates it whenever its session restarts. Fill the `<…>` values from `.agents/project.yaml` and the phase's roadmap entry.

```
Watchdog (<phase name> phase). Stories: <stories doc>; plans: <plan paths>. Check each tmux window in session <sessions.tmux_session>: working, waiting on someone, at a limit prompt, or done? Nudge anything idle that owes work; answer findings; route reviews (<reviewer sessions>); merge PRs that are reported ready, green on a head that includes current main, reviewed where sensitive, and touch no protected or pinned file (<merge.command>), then fast-forward local main. Pinned-file changes are batched into one PR that the orchestrator coordinates. Parked work is not handed out. Bound all output. Append to <running log path> when something changed. Run `lc-board status` and, if the board is down, `lc-board start`; then send the board-keeper session the word `tick`.
```

Notes from use:
- An open question dialog to the owner stops the watchdog and all relays. Never leave one open while the owner is away.
- The job dies with the orchestrator's session and may expire; recreate it at session start.
- A usage-limit prompt in a session needs a person's or the orchestrator's choice; the watchdog only reports it.
- Before merging, check that the PR's CI ran on a head that includes the current main. A new lint rule on main makes an older green stale.
- When the gate adds commits after a reviewer's approval on a sensitive path, the reviewer reads those commits before the merge.

# Running log

One file per phase in `handoff_dir`, append-only, one line per event:

```
- <date time>: <what changed: merged PR and one-line content, decision taken and by whom, session started or stopped, thing owed to the owner>
```

Lines the owner must act on start with `FOR THE OWNER`.
