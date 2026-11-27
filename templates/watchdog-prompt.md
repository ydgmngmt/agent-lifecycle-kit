# Watchdog prompt

The lead schedules this as a recurring job at session start, every 30 minutes (for example `13,43 * * * *`, off the hour), and recreates it whenever its session restarts. It is the audit of pstack's Autopilot-full playbook, step 6. Fill the `<…>` values from `.agents/project.yaml` and the stage's plan.

```
Watchdog (<stage name>). Plan: <plan file>. Re-read the Autopilot-full playbook in the adlc-mode skill and fix drift from it. Check each tmux window in session <sessions.tmux_session> and each of your own subagents: judge each by what it did since the last tick (a push, a trail row in <handoff_dir>/trails/, a report), not by what it says. Working, waiting on someone, at a limit prompt, stuck, or done? Answer one that waits on you. Replace a stuck one at once with a fresh session and its trail. Start the swarm for each code-ready head not yet verified; never merge a pull request yourself. Parked work is not handed out. Bound all output. Append to <running log path> with `lc-log "<line>"` when something changed. Run `lc-board status` and, if the board is down, `lc-board start`; then send the board-keeper session the word `tick`.
```

Notes from use:
- An open question dialog to the owner stops the watchdog and all relays. Never leave one open while the owner is away.
- The job dies with the lead's session and may expire; recreate it at session start.
- A usage-limit prompt in a session needs a person's or the lead's choice; the watchdog only reports it.
- A verdict covers one patch: after a rebase, compare `git patch-id` before trusting an older one (pstack's Shipping playbook, step 3).

# Running log

One file per stage in `handoff_dir`, append-only, one line per event:

```
- <date time>: <what changed: merged PR and one-line content, verdict and its commit, decision taken and by whom, session started or stopped, thing owed to the owner>
```

Lines the owner must act on start with `FOR THE OWNER`.
