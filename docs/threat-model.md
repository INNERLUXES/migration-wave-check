# Threat model

## What the tool touches

- It reads the one file named on the command line. Nothing else on the disk is opened.
- It does not follow a path or an address written inside the file. A symbolic link given as the argument is followed, because the person who runs the tool named it; the target must be a regular file.
- It writes only to the screen (standard output and standard error).
- It opens no network connection and runs no program: not a shell, not `git`, not a DNS lookup.

## What the input may hold

A plan is often a spreadsheet edited by many people, exported to CSV, and checked in a pipeline that runs on pull requests. It may come from a partner or a vendor. The tool treats the file as possibly hostile. It can be huge, hold very many rows or very long fields, or a quote that is never closed. A JSON or YAML plan can be very deeply nested or hold very many values. A YAML file can use anchors and aliases that expand to far more than the file holds. An id can be named `__proto__` or `constructor`, or hold control and direction characters. A cell can start with `=` so that a spreadsheet runs it. The dependencies can form a chain of thousands of applications, or a loop. A rollback or an owner field can hold text that should not be copied into a job log.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A huge file, very many rows or values, or deep nesting exhaust memory or time | A file over 10 MB is refused from the size of the open file before it is read; at most 20,000 applications, 100 columns, 20,000 characters in a field; JSON deeper than 64 levels, or with more than 500,000 values, is refused; YAML has limits on depth, lines and line length. The readers recurse only as deep as their limits |
| A CSV quote that is never closed makes the reader scan the file again and again | The CSV reader walks the text once, character by character, and stops with the line of the record |
| A YAML alias bomb expands a small file into a huge structure | Anchors, aliases and tags are refused with their line; nothing is ever expanded |
| A long chain or a loop of dependencies overflows the stack or runs for ever | The loop search (Tarjan's strongly connected components) walks a list, not the call stack, and visits each application once; at most 1,000 entries in one `depends_on` and 200,000 in the plan |
| Tens of thousands of findings of one kind make the report huge | A check lists its first 200 findings in a fixed order, counts the rest in the totals and the gate, and says so in a note |
| A crafted value makes a pattern run for a very long time | Text is cut to a fixed length before a pattern runs on it; the patterns are anchored and have bounded repeats and no nested repetition. Tests run very long near misses and check the time |
| An id or a column named `__proto__` or `constructor` changes how objects behave | JSON and YAML are read into objects without a prototype, CSV columns and ids are kept in maps. A test checks that no prototype changes |
| An id or a path rewrites the terminal through escape sequences, or reorders text with direction characters | Control characters (C0 and C1), line and paragraph separators and Unicode direction controls are replaced by a space before any text reaches a report or an error message, and the length is capped |
| An id breaks the Markdown table in the job summary, makes a link, or hides text as an HTML tag | Pipes, backslashes, square brackets, backticks, line breaks, `<`, `>` and `&` are escaped in every table cell |
| A CSV report runs a formula when opened in a spreadsheet | Cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'`; every cell is quoted as RFC 4180 says |
| The text of a rollback, a test plan, an owner or a name is copied into a report, a job log or the job summary | No such text is copied into a finding; only ids, numbers and strategy names are. Tests put marker values in these fields and check that they appear in no report |
| A value that cannot be read is skipped, and a check passes without having run | A value that cannot be read is an error (`value-invalid`); a missing column, a missing stateful value and a missing wave limit are notes. Nothing is guessed |
| The argument names a URL, so the tool becomes a fetcher | Arguments that look like addresses are refused; reading from standard input is refused |
| A pipe or a device in place of the file makes the tool hang | The type is looked at before the file is opened and again on the open file, and anything that is not a regular file is refused |

## Out of scope

What the estate does: the real dependencies, the data, the DNS records, the people. The correctness of the guidance pages and the RFCs the tool follows. [limits.md](limits.md) lists what a plan file cannot show.
