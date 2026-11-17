---
name: board
description: Use when there is a question for the owner, a status the owner should see, someone says "put it on the board", the board must be started or checked, or you are the board-keeper session woken by the word `tick`. How every session uses the owner's board with one-line lc-board commands.
---

# The board

The owner watches the board, not the sessions. One local page per repository (`lc-board start`, `board.port`), served from the kit's `board/`. It derives the phases, journeys, changes and criteria from the roadmap and the acceptance files, PRs and CI from the host, and sessions from tmux. A session's brief title is its default note, and its branch finds its PR; for a window lc-spawn did not start, the board reads the brief from the agent's prompt (`Read <brief> in full`) and the branch from the window's directory. A session shows as working, waiting (its turn ended but a background agent or shell it started still runs), idle, or at a limit. `state.json` keeps only what no file shows, and it changes through `lc-board` setters. Never edit it by hand.

## Rules

1. **Questions go on the board.** Every new question for the owner: `lc-board ask <id> --title … --body … --option "label|description" … --recommended <n>`. The recommended option goes first, and the page always offers free text. Never ask only in chat. While the owner is present, you may also ask it interactively.
2. **Same turn.** A decision, a merge that no PR shows, a session started or stopped, or an answer acted on shows on the board within the turn it happens. Use one setter, or send one line to the board keeper.
3. **Answers.** Wait with `lc-board answers --wait` as a background command (it watches the file and never matches processes). Act on each answer, log it in the running log, then `lc-board outcome <id> "<what was done>"`. An answer without an outcome shows as not acted on.
4. **Nothing unverified shown as done.** A criterion is done only with evidence from a phase run or a live check (`lc-board criterion <id> done --evidence <url>`). A journey works the same way. An item is done when its PR merged; the board derives that.
5. **Live.** The page refreshes itself every 5 seconds. Nobody reloads it, and nobody restarts the server to show a change.

## Commands (repository root, or any directory in it)

| Need | Command |
| --- | --- |
| Start or check | `lc-board start` (does nothing when running) · `lc-board status` |
| Headline, phase note | `lc-board set headline "<text>"` · `lc-board set note "<text>"` |
| A change | `lc-board item <label match> [--pr N] [--status s] [--owner session] [--note text]`; `--new` adds one not in the roadmap |
| A journey | `lc-board journey <id> [--status s] [--note text] [--evidence url]` |
| A criterion | `lc-board criterion <id> <status> [--evidence url]` |
| A session note | `lc-board session <name> "<note>"` |
| Ask, answer, outcome | `lc-board ask …` · `lc-board answers [--wait]` · `lc-board outcome <id> "<text>"` |
| What looks stale | `lc-board stale` |
| Board keeper | `lc-board keeper` starts it |

Setters refuse an ambiguous match, a done criterion or journey without evidence, and a file that would not parse.

## Board keeper

You are the keeper when `lc-board keeper` started you. You keep the board true so the orchestrator doesn't spend its own context on it. You run on a cheap model; each wake stays small.

On each `tick`:

1. `lc-board stale`: the server's short list of what looks out of date.
2. `lc-board log`: only the running-log lines added since your last wake (the offset is kept for you; the first call prints nothing). Read all of its output: lines you cut are gone for the next wake.
3. For each stale entry and each new log line that changes what the board shows, apply one setter (`set headline`, `item`, `journey --note`, `session`, `outcome`). Base the headline on the newest log lines.
4. Reply in at most three lines: what you set, and what you could not place.

Your whole job is those two commands and the setters: read no source files or whole documents, decide nothing, ask the owner nothing, and leave every criterion and journey status to the orchestrator, who sets done with its evidence. Something you can't place (an entry you don't understand, two setters that conflict) goes to the orchestrator in one line, and you leave it unchanged.

Your context can be thrown away. When it grows past a few wakes, tell the orchestrator `respawn keeper`; it runs `lc-close board-keeper` and `lc-board keeper`. All your state lives in the board's data dir.
