# Testing

## Strategy

- **Flow scripts are the primary way to find bugs.** The project's verification skill (`docs.verification`) keeps one script per journey and runs them by one command. Each drives the real flow: sign in, navigate and use the ordinary controls, assert the result, reload, assert again. For a backend flow, or a project with no browser (`browser: none`), use the public API, CLI or event entry and follow it through workers and storage. A rendered component, a successful request or a queued job alone is not success.
- **Keep behaviour regressions at the lowest reliable level:** the lowest level at which the wrong behaviour can happen and the test stays deterministic.
- **Use focused lower-level tests for core and security invariants** (<the project's invariants>).
- Use no mocked success responses, injected state, or internal calls that bypass the behaviour under check. Fixtures may provide prerequisites; label simulated outside dependencies.

## Writing a test

- Derive expected values from requirements and business rules, never from current output.
- See each new test fail before it passes, and show that in the PR.
- When a test fails because behaviour changed on purpose, delete it, unless what it catches still applies. Never weaken a check to get green.
- **Each bug found live adds a regression check:** a step in its journey's flow script, plus a test at the lowest reliable level. The failing check lands before the fix (pstack's Bug fix playbook).
- **A new behaviour comes with its flow script,** written or updated in the same pull request. Each script names the acceptance criteria it decides (`<stage>-AC<n>`): the stage exit fails on a criterion no script names.
- **A state machine or a concurrent protocol** gets a statechart during design (pstack's **statechart**: a TLA+ model checked by TLC), and where the project has a formal verification skill (`docs.formal`), its model changes in the same pull request.

## When each check runs

| Profile | When | What |
| --- | --- | --- |
| `verify:commit` | before each push | typecheck, and the targeted behaviour tests for the changed files |
| `verify:pr` | every pull request, in CI (no CI host: the swarm's run lane per pull request, and a `gate_pr` command step at the stage exit) | build, typecheck, lint (if any), unit tests, boundaries, API contracts, quality baselines, dependency scanning, and the flow scripts that cover the diff |
| swarm | every pull request, at its code-ready head | the lead's verifiers re-run the checks and the flow scripts, and audit the diff |
| formal | a pull request touching `paths.formal` | the model checker, by the formal verification skill's one command |
| sensitive changes | pull requests on sensitive code paths | targeted tests for the affected invariants; proposed as `rigor: critical` |
| `verify:nightly` | each night on the default branch | the full integration suite; a failure becomes an issue |
| `verify:acceptance` | stage exit | `lc-criteria` on the stage's acceptance file, then every flow script on a fresh stack |
| `verify:stage` | stage exit, in CI | the regression run: API replay, navigation speed, data volume |

## Completion

Keep a PASS / FAIL / BLOCKED / NOT TESTED list of the affected flows and criteria, with the commit, entry point, steps, result and elapsed time. Never claim completion while the real flow fails or is unverified.
