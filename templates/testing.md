# Testing

## What verifies a change

- **Browser end-to-end runs are the primary way to verify and to find bugs.** Drive the real flow: sign in, navigate and use ordinary controls; for a backend flow, use the public API, CLI or event entry and follow it through workers and storage. A rendered component, a successful request or a queued job alone is not success.
- Use no mocked success responses, injected state, or internal calls that bypass the behaviour under check. Fixtures may provide prerequisites; label simulated outside dependencies.

## Which tests to write

- Write tests for **observable behaviour** and **regressions**: what a person, an agent or a caller of a public interface sees.
- Keep **implementation-level tests** for core behaviour and security invariants (<list the project's invariants>).
- Derive expected values from requirements and business rules, never from current output. Each new test is seen red before it is green, and the PR shows that.
- A test that fails because behaviour changed on purpose is deleted, unless what it catches still applies. Never weaken a check to get green.
- **Every bug found live gets a regression step** in the phase run, plus a test at the lowest level where it can happen.

## When each check runs

| Profile | When | What |
| --- | --- | --- |
| `verify:commit` | before each push | typecheck, and the specs covering the changed files |
| `verify:pr` | every PR, in CI | <install, build, typecheck, lint, format, boundaries, contracts, dead code, duplication, complexity, unit tests>; <supply-chain check> |
| live check | every PR that changes a flow | the changed flow, once, on a lane |
| `verify:phase` | phase exit | fresh stack, the browser journeys of the exit criteria, <golden replays>, <speed and volume> |
| `verify:nightly` | each night on main | the full suite; a failure becomes an issue |

## Completion

Keep a PASS / FAIL / BLOCKED / NOT TESTED list of the affected flows, with the commit, entry point, steps, result and elapsed time. Never claim completion while the real flow fails or is unverified.
