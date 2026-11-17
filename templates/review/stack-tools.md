# Stack tools

The tools the stack decisions chose, at the versions this repository installs, with their documentation and the functions to call (`docs.stack_tools`). Read it before writing a tool-fit plan: each plan line cites a function from here and the docs page it came from.

## Looking up documentation

Each entry's **Look up** line is the route to the installed version's docs: a documentation lookup service's library id and version, else the project's `llms.txt`, else its versioned docs.

- Look up before planning a mechanism, and before concluding a tool can't do something.
- A query carries the library name and the API question only: no project, repository, customer or person name, internal path or pasted code.
- When the lookup and the installed version disagree, the installed version's own docs win.

## <Tool name>

§<n> of the stack decisions. <package> <version> (`<manifest>:<line>`). [Docs](<url>) (<version>).

Look up: <lookup library id>, version `<version>`.

Use it for:
- <feature> — `<function or API>` — [<docs page>](<url>) — for <what the project uses it for>

Reach it through: <the project's wrapper, if any, at `<file>:<line>`>.
The project owns: <what stays project code beside this tool>.
Not for: <what it must not take over>.
