# <Stage name>: acceptance criteria

Agreed with the owner on <date>. The stage exits when every criterion below has a flow script and every flow script passes on the stage's head (`lc-criteria`, `verify:acceptance`).

## User outcomes

| ID | Outcome | Decided by |
| --- | --- | --- |
| <stage>-AC1 | <a person or agent can …> | <the flow script that runs it> |

## Failure cases

| ID | When | Then | Decided by |
| --- | --- | --- | --- |
| <stage>-AC<n> | <it goes wrong like this> | <this observable result> | <flow script step> |

## Invariants

| ID | Stays true | Check that shows a breach |
| --- | --- | --- |
| <stage>-AC<n> | <isolation, authority, no duplicate effect, …> | <focused test / flow script step / formal check> |
