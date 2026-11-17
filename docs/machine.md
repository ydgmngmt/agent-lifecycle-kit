# Machine-specific pieces

Nothing machine-specific belongs in this repository. What differs per machine is set in the shell profile, or in the `sessions:` block of a project file where it says so.

- **A terminal tab per new session.** `lc-spawn` starts sessions in the background and opens nothing, so spawning never takes focus. To get a tab, set `LC_OPEN_TAB` (or `sessions.open_tab`) to a command that receives the window name as `$1`, for example one that opens a terminal running `lc-view "$1"`.
- **Session overrides.** `LC_TMUX_SESSION` overrides `sessions.tmux_session` for `lc-spawn`, `lc-close` and `lc-view`; `LC_AGENT_CMD`, `LC_MODEL`, `LC_EFFORT` and `LC_AGENT_FLAGS` override the rest of the block for `lc-spawn`. A gate session (`lc-gate run`) runs on `sessions.gate_model` and `sessions.gate_effort` (`opus`, `xhigh`), never the lead's `LC_MODEL`/`LC_EFFORT`. For `claude`, `lc-spawn` watches the new window for up to `LC_TRUST_WAIT` seconds (15) and answers the folder-trust prompt for a folder inside the repository's worktrees or `handoff_dir`; for any other folder it prints that the session waits on it.
- **The board.** `LC_BOARD_PORT` and `LC_BOARD_DIR` override `board.port` and `board.data_dir` for `lc-board`.
