# Stack decisions

Which tool owns which capability, and what the project's own code owns (`docs.stack_decisions`). The tool-fit plan and review and the stack hunt read it; it changes only in a PR the owner reads.

One section per capability. Number them: plan lines and findings cite `§<n>`.

## §1 <capability, e.g. durable background work>

- **Tool:** <tool and major version>
- **The tool owns:** <what it does for the project: scheduling, retries, queues, …>
- **The project owns:** <what stays project code, built on the tool>
- **Not for:** <what the tool must not take over>
- **Decided:** <date, by whom, and the decision record if there is one>

## §2 <capability, e.g. input validation>

- **Tool:** <…>
- **The tool owns:** <…>
- **The project owns:** <…>
- **Not for:** <…>
- **Decided:** <…>
