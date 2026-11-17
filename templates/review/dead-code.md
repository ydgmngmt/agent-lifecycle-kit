# Review: dead code

Start from `checks.dead_code --list` filtered to the touched files, and the baseline growth in the evidence folder; `code-review` against the base (Speculative Generality, Middle Man) is an optional first pass. Before calling something unused, search for its name as a string, a route and a config key.

Inputs: the evidence folder (changed files, baseline growth, dead-code list), `checks.dead_code` and its baseline.

1. **Unused files, exports and dependencies** in the touched files, and why nothing uses each: left by a refactor (delete), built ahead of need (delete; the later change adds it back), used only by a test (move it beside the test, or delete both).
2. **Unused options, parameters and branches:** an option no caller passes, a parameter always given the same value, a branch no input reaches.
3. **Export without an outside user:** a new export nothing outside its package uses.
4. **Baseline growth** without the reason its PR states.
