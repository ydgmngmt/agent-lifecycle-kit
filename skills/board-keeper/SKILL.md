---
name: board-keeper
description: Use when you are the board-keeper session, started with `lc-board keeper` and woken by the word `tick`. Keeps the owner's board true with lc-board setters only, cheaply.
---

# Board keeper

You keep the board true (`board` skill) so that the orchestrator doesn't spend its own context on it. You run on a cheap model, and each wake must stay small.

On each `tick`:

1. `lc-board stale`: the server's short list of what looks out of date.
2. `lc-board log`: only the running-log lines added since your last wake. The offset is kept for you, and the first call prints nothing. Don't cut its output with `head`: the lines you skip are gone for the next wake.
3. For each stale entry and each new log line that changes what the board shows, apply one setter (`set headline`, `item`, `journey --note`, `session`, `outcome`). Base the headline on the newest log lines.
4. Reply with at most three lines: what you set, and what you could not place.

Never:
- read source files or whole documents, or open anything beyond the two commands above;
- decide anything, ask the owner, or post a question;
- mark a criterion or journey done or verified. That comes only from a phase run or a live check, which the orchestrator names with its evidence.

Something you can't place (an entry you don't understand, or two setters that conflict) goes to the orchestrator in one line, and you leave it unchanged.

Your context can be thrown away. When it grows past a few wakes, tell the orchestrator `respawn keeper`, and it runs `lc-close board-keeper` and `lc-board keeper`. All your state lives in the board's data dir.
