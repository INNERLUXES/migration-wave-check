# 1. Read the plan, not the estate

## Context

The tool needs to say whether a migration wave plan is safe to run before the first wave starts. There are richer ways to know: run a discovery tool on the network, read connection logs, measure the data and time a copy, rehearse the cutover and the rollback. Each of them needs access to the estate, agents on the servers, time and permission, and the answer comes late. The people who need the answer often need it earlier: when the plan changes in a pull request, when a partner or a vendor hands over a plan, or when a plan is reviewed before the waves are fixed.

A plan does not say everything. A dependency that nobody wrote down is not in it, and a rollback written as one line may never have been tried. A check that treated a clean plan as a safe migration would be wrong in the way that matters most. The reverse is true as well: a gap in the plan is not proof that the move will fail.

## Decision

The tool reads one plan file (CSV, JSON or YAML) as data. It reads the strategy names and the sentences it quotes from pages that are saved with their addresses, and a test compares the code with the saved text. It never connects to an application, never queries DNS, never fetches anything and never runs a program.

Every check says what it can and cannot see. A finding is worded as what the plan shows, and the severities are the tool's own and are said to be. A value that the tool cannot read is an error, not a pass. Findings carry the row or the JSON pointer and the line. They name applications by id, and never copy the text of a rollback, a test plan or an owner.

The tool reads the plan of moving applications only. Database schema migrations are the subject of `sql-migration-check`; this tool does not read SQL, and says nothing about a schema.

## Consequences

The check runs in a second, on Linux, macOS or Windows, with only Node, no account and no network access, and no input can make it run code or reach out to a host. The same file gives the same report, so it can run every time the plan changes and gate the start of a wave. The cost is that it sees what the plan says, not what the estate does: a dependency that is missing from the plan is missing from the report, and a filled rollback field is not a tested rollback. The tool says what it left out, lists its limits in docs/limits.md, and leaves the final answer to the people who know the systems.
