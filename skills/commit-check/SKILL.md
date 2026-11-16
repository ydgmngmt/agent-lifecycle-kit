---
name: commit-check
description: Use before each push, and before handing a branch to review or to the gate.
---

# Commit check

1. Check memory or CPU limits in the project file (`machine`) before a heavy command, and follow them.
2. Run `profiles.commit`. It typechecks and runs the targeted behaviour tests: those that cover the changed files, plus any you name.
3. On a failure, fix the cause and rerun. A failure in code you didn't change is still yours: fix it if it is small, otherwise file an issue and say so in the report.
4. Don't rerun after a rebase without conflicts.

Done when `profiles.commit` exits 0 on the head you are about to push. Record the command and its result for the report.
