---
name: live-check
description: Use when a change to a flow a person or agent uses must be exercised once through the real flow, or a bug found live must be re-checked through the path that failed.
---

# Live check

Inputs: the change's head, an assigned lane (`lanes`), the flow under check, and the browser tooling in `browser`.

1. Bring up the stack on your lane only (`lanes.up`). Without a lane, ask the orchestrator for one; never start a stack without one.
2. Drive the real flow. For UI, sign in, navigate and use the ordinary controls. For a backend flow, use the public API, CLI or event entry and follow it through workers and storage. Use no mocked responses and no injected state.
3. Verify the observable result, persistence after a reload, and the next dependent action. For a bug fix, check the path that failed.
4. When it fails, invoke `diagnosing-bugs` and build a red loop on this flow before you change code.
5. Record PASS / FAIL / BLOCKED / NOT TESTED with the commit, entry point, steps, result and elapsed time. Take the stack down and say the lane is free.
