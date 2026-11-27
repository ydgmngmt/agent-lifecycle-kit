# Baseline tools

What the lifecycle expects on a machine and in CI, and the tool the kit recommends for each job. `lc-tools` lists which are present and prints the install line for each that is missing. A session that finds one missing installs the baseline tool and says so; it does not work around it.

A project may choose another tool for a job. It then says so in its testing doc, and its verification or formal verification skill names the command.

| Job | Baseline | Why this one | Install | Used by |
| --- | --- | --- | --- | --- |
| Sessions, gate, pull requests | git 2.36+, Node 18+, tmux, `gh`, Claude Code | The kit's own tools need them | your package manager; `lc-tools` | everything |
| TLA+ model checking | **mise**, which installs Temurin Java and TLC 1.7.4 at the checksum pstack pins | pstack's statechart installs and pins its own TLC and Java through mise on first use, so every machine checks with the same versions | `curl https://mise.run \| sh` | pstack **statechart**, the formal verification skill |
| Lean proofs | **elan**, which installs `lean` and `lake` at the version the project's `lean-toolchain` file pins | It is Lean's own toolchain manager | `curl https://elan.lean-lang.org/elan-init.sh -sSf \| sh` | the formal verification skill |
| Property-based UI tests | **Bombadil** (`@antithesishq/bombadil`), for web and terminal UIs | It explores a running app by itself, checks properties written in TypeScript, and shrinks a violation to a short reproduction. It is the tool the pstack author's team uses | `npm install --save-dev @antithesishq/bombadil`; in CI, `antithesishq/bombadil-action` | `verify:acceptance`, `verify:nightly` |
| Flow scripts in a browser | **Playwright** (`@playwright/test`) | Assertions, traces, screenshots and recordings from one runner, with no model on a passing run | `npm install --save-dev @playwright/test` | the verification skill, `verify:pr`, `verify:acceptance` |
| Watching a pull request | **bun** | pstack's Babysit playbook ships its watcher as a bun script | https://bun.sh | pstack Babysit |

Without mise, statechart still runs when `TLA2TOOLS` points at a `tla2tools.jar` and `JAVA` at a Java 11 or later. That is a fallback for a machine that cannot install mise, not the recommended setup: the versions are then yours to keep equal across machines and CI.
