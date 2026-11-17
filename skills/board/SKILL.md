---
name: board
description: Use when there is a question for the owner, a status the owner should see, someone says "put it on the board", the board must be started or checked, or you are the board-keeper session woken by the word `tick`. How every session uses the owner's board with one-line lc-board commands.
---

# The board

The owner watches the board, not the sessions: one local page per repository (`lc-board start`, `board.port`). It derives phases, journeys, changes and criteria from the roadmap and acceptance files, PRs and CI from the host, and sessions from tmux. `state.json` keeps only what no file shows and changes only through `lc-board` setters, never by hand.

## Rules

1. **Questions go on the board:** `lc-board ask <id> --title … --body … --option "label|description" … --recommended <n>`, the recommended option first; the page always offers free text. Never ask only in chat; while the owner is present you may also ask interactively.
2. **Same turn.** A decision, a merge no PR shows, a session started or stopped, or an answer acted on shows on the board within the turn: one setter, or one line to the keeper.
3. **Answers.** Wait with `lc-board answers --wait` in the background. Act on each, log it in the running log, then `lc-board outcome <id> "<what was done>"`; without an outcome it shows as not acted on.
4. **Nothing unverified shown as done.** A criterion or journey is done only with evidence from a phase run or live check (`lc-board criterion <id> done --evidence <url>`). An item is done when its PR merged; the board derives that.
5. **Live.** The page refreshes itself every 5 seconds; nobody reloads it or restarts the server to show a change.

## Commands (anywhere in the repository)

| Need | Command |
| --- | --- |
| Start or check | `lc-board start` (no-op when running) · `lc-board status` |
| Headline, phase note | `lc-board set headline "<text>"` · `lc-board set note "<text>"` |
| A change | `lc-board item <label match> [--pr N] [--status s] [--owner session] [--note text]`; `--new` adds one not in the roadmap |
| A journey | `lc-board journey <id> [--status s] [--note text] [--evidence url]` |
| A criterion | `lc-board criterion <id> <status> [--evidence url]` |
| A session note | `lc-board session <name> "<note>"` |
| Ask, answer, outcome | `lc-board ask …` · `lc-board answers [--wait]` · `lc-board outcome <id> "<text>"` |
| What looks stale | `lc-board stale` |

Setters refuse an ambiguous match, a done criterion or journey without evidence, and a file that would not parse.

## Board keeper

You are the keeper when `lc-board keeper` started you, on a cheap model; each wake stays small. On each `tick`:

1. `lc-board stale`: what looks out of date.
2. `lc-board log`: the running-log lines added since your last wake (the first call prints nothing). Read all of it; lines you cut are gone.
3. For each stale entry and each new line that changes what the board shows, one setter (`set headline`, `item`, `journey --note`, `session`, `outcome`). Base the headline on the newest lines.
4. Reply in at most three lines: what you set, and what you could not place.

Read no source files or whole documents, decide nothing, ask the owner nothing, and leave criterion and journey status to the orchestrator. What you can't place goes to the orchestrator in one line, unchanged on the board. When your context grows past a few wakes, tell the orchestrator `respawn keeper` (it runs `lc-close board-keeper` and `lc-board keeper`); your state lives in the board's data dir.
