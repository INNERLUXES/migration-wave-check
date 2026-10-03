# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "migration-wave-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up plan that shows the problem, what you expected and what happened. Use made-up names, and no real host names, internal addresses, people or customer data.

## Scope

In scope:

- an input that makes the tool open a network connection, open a file other than the one it was given, or run a program
- an input that makes the tool print the text of a name, an owner, a data sync method, a rollback or a test plan, which it is documented not to print
- a plan that makes a reader accept something its documented format does not allow, such as a CSV record with a stray quote, a YAML anchor, an alias or a tag
- an input that makes the tool hang, take very long, or use unbounded memory or stack, such as deep nesting, very many rows or values, a very long field, a quote that is never closed, a long chain or a loop of dependencies, or a path that is not a regular file
- text from a path, an id or a column name that breaks a Markdown table, injects a formula into a CSV report, or rewrites the terminal through control or direction characters
- a key or an id such as `__proto__` that changes how objects behave inside the tool
- a finding that docs/method.md says is reported, for an input the tool accepts, that the report leaves out, or a value that the tool did not read and shows as passed
- a sentence in src/data.js that differs from the saved page in research/sources

Out of scope: whether the migration that a plan describes is safe (docs/limits.md lists what a plan cannot show), the guidance pages and the RFCs the tool follows, and how your pipeline stores the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
