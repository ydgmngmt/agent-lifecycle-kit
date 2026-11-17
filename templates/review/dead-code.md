# Review: dead code

Start from the dead-code check's list (`checks.dead_code --list`) filtered to the touched files, and the baseline growth in the evidence folder; `code-review` against `START` (its Speculative Generality and Middle Man smells) is an optional first pass.

Inputs: the evidence folder (changed files, baseline growth, dead-code list), `checks.dead_code` and its baseline.

1. **Unused files, exports and dependencies** in the touched files. For each, why does nothing use it?
   - left behind by a refactor: delete it;
   - built ahead of need: delete it, and the later change adds it back;
   - used only by a test: move it next to the test, or delete both when the test covers only it.
2. **Unused options, parameters and branches**: an option no caller passes, a parameter always given the same value, a branch no input reaches.
3. **Export without an outside user**: a new export nothing outside its package uses.
4. **Baseline growth** without the reason its PR states.

Before proposing a deletion, confirm there is no dynamic use: search for the name as a string, a route, or a config key. After a fix, `checks.dead_code --prune`.

**Fail condition:** a critical finding (a project invariant can be broken now). Everything else is a follow-up for the lead.
