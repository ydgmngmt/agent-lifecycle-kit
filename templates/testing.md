# Testing

## Strategy

- **Browser end-to-end runs are the primary way to find bugs.** Drive the real flow: sign in, navigate and use the ordinary controls. For a backend flow, use the public API, CLI or event entry and follow it through workers and storage. A rendered component, a successful request or a queued job alone is not success.
- **Keep behaviour regressions at the lowest reliable level:** the lowest level at which the wrong behaviour can happen and the test stays deterministic.
- **Use focused lower-level tests for core and security invariants** (<the project's invariants>).
- Use no mocked success responses, injected state, or internal calls that bypass the behaviour under check. Fixtures may provide prerequisites; label simulated outside dependencies.

## Writing a test

- Derive expected values from requirements and business rules, never from current output.
- See each new test fail before it passes, and show that in the PR.
- When a test fails because behaviour changed on purpose, delete it, unless what it catches still applies. Never weaken a check to get green.
- **Each bug found live adds a regression check:** a step in the phase run, plus a test at the lowest reliable level.

## When each check runs

| Profile | When | What |
| --- | --- | --- |
| `verify:commit` | before each push | typecheck, and the targeted behaviour tests for the changed files |
| changed flow | every PR that changes behaviour | the affected flow, once, in the browser or the live API |
| `verify:pr` | every PR, in CI | build, typecheck, lint, unit tests, boundaries, API contracts, quality baselines (dead code, duplication), dependency scanning |
| sensitive changes | PRs on protected files or sensitive code paths | targeted tests for the affected invariants; approval by the role the project file names |
| `verify:nightly` | each night on main, and after a phase's last merge | the full integration suite; a failure becomes an issue |
| `verify:phase` | phase exit | fresh stack, the phase journeys, API replay, navigation speed, data volume; evidence per acceptance criterion |

## Completion

Keep a PASS / FAIL / BLOCKED / NOT TESTED list of the affected flows and criteria, with the commit, entry point, steps, result and elapsed time. Never claim completion while the real flow fails or is unverified.
