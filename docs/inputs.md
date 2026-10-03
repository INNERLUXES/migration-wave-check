# Inputs

The tool takes one argument: the path of one plan file. It reads that file and nothing else. It opens nothing that a file names, and never reads from standard input. A symbolic link given as the argument is followed, because the person who runs the tool named it; the file it leads to must be a regular file.

## The file

- CSV, JSON or YAML. The format is chosen from the file name (`.csv`, `.json`, `.yaml`, `.yml`). For any other name, a file that starts with `{` or `[` is read as JSON, a file whose first line is `key:`, `- `, `---` or a `#` comment is read as YAML, and anything else as CSV.
- A file over 10 MB is refused from the size of the open file, before it is read. A folder, a pipe or a device is refused.
- An argument that looks like an address (`https://...`) is refused. Nothing is downloaded.
- At most 20,000 applications, at most 1,000 entries in one `depends_on`, and at most 200,000 dependencies in the plan.

## The fields of an application

| Field | Type | Used for |
| --- | --- | --- |
| `id` | a text or a whole number; required | `duplicate-id`, and every finding names the application by it |
| `name` | a text | not checked; for people |
| `wave` | a whole number from 0 to 999999 | `wave-missing`, `dependency-later-wave`, `wave-over-limit`, `wave-summary` |
| `strategy` | one of `retire`, `retain`, `rehost`, `relocate`, `replatform`, `repurchase`, `refactor` (any case; `re-architect` is read as `refactor`) | `strategy-missing`, `strategy-unknown`, and which checks apply |
| `owner` | a text | `no-owner` |
| `depends_on` | a list of ids | the dependency checks |
| `stateful` | yes or no: `true`, `false`, `yes`, `no`, `y`, `n`, `1` or `0` (any case) | `stateful-no-data-sync` |
| `data_sync` | a text, for example `replication` or `backup-restore` | `stateful-no-data-sync` |
| `rollback` | a text | `no-rollback` |
| `test_plan` | a text | `no-test-plan` |
| `dns_ttl_seconds` | a whole number from 0 to 2147483647 | `dns-ttl-longer-than-window` |
| `cutover_window_minutes` | a number from 0 to 1000000, with at most four decimals | `dns-ttl-longer-than-window` |

A text that is empty, or only one of the words `none`, `n/a`, `na`, `-`, `tbd`, `todo` or `null` (any case), counts as empty. So `data_sync: none` and a blank rollback cell are the same. A value that cannot be read (a wave of `two`, a stateful value of `maybe`, a TTL of `-1`) is reported as `value-invalid`, and the checks that need it are skipped for that application.

Other fields are not read. The text of `name`, `owner`, `data_sync`, `rollback` and `test_plan` is never copied into a report.

## Which strategies move

`rehost`, `relocate`, `replatform`, `repurchase` and `refactor` move the application in a wave. `retain` keeps it in the source environment, and a wave written for it is not used. `retire` shuts it down; a wave is optional, and when it is given the application is counted in that wave. The checks of the cutover (`no-rollback`, `no-test-plan`, `stateful-no-data-sync`, `dns-ttl-longer-than-window`) and `wave-missing` apply to the applications that move.

## CSV

The CSV reader follows RFC 4180, section 2:

- The first record is the header. Column names are read in lower case, with spaces and `-` read as `_`, so `Depends On` is `depends_on`. A column given twice, or a column with no name, is refused. The `id` column is required; any other column can be left out, and a note says which ones are missing.
- Records are separated by CRLF or by LF alone. Fields are separated by commas.
- A field in double quotes can hold commas, line breaks and double quotes; a double quote inside is written twice, as the RFC says: "If double-quotes are used to enclose fields, then a double-quote appearing inside a field must be escaped by preceding it with another double quote."
- Every record must have as many fields as the header. A record with more or fewer is refused with its line. The RFC says: "Each line should contain the same number of fields throughout the file." The tool makes that a rule, so that a shifted column is never read as the wrong field.
- A double quote inside a field that is not quoted, text after a closing quote, and a quote that is never closed are refused with the line.
- A record that is entirely empty is skipped. A byte order mark at the start is skipped.
- In `depends_on`, ids are separated by `;` (or `,` or `|` inside a quoted field). Spaces around an id are removed.
- At most 100 columns, and at most 20,000 characters in one field.

A finding in a CSV plan names the row and the column, such as `row 4, rollback`, and the line. The row is the number of the record, counting the header as row 1. It is the row a spreadsheet shows, as long as no field holds a line break and the file has no empty lines; the line is the line of the file where the record starts.

## JSON and YAML

A JSON or YAML plan is either a list of applications, or an object:

```yaml
plan:
  name: Orders estate
  max_apps_per_wave: 3
waves:
  - wave: 1
    max_apps: 2
applications:
  - id: orders-db
    wave: 1
    strategy: replatform
    owner: data-team
    depends_on: [pricing]
    stateful: true
    data_sync: replication
    rollback: Keep the source database read-write until sign-off, then switch back
    test_plan: Row counts and checksums on every table
    dns_ttl_seconds: 300
    cutover_window_minutes: 120
```

- `plan.max_apps_per_wave`: the most applications one wave may hold, a whole number from 1 to 100000.
- `waves`: a list of `{ wave, max_apps }`, a limit for one wave. It replaces the plan limit for that wave. Two entries for one wave are reported.
- `--max-apps-per-wave` on the command line replaces `plan.max_apps_per_wave`, but not a limit of one wave.
- `depends_on` is a list of ids, or one text split as a CSV cell is.

A finding names the JSON pointer of the field, such as `#/applications/3/rollback`, and its line. A field that is absent is named by the pointer it would have, with the line of the application.

### JSON

The JSON reader accepts the JSON of RFC 8259 and nothing more: no comments, no trailing commas, no single quotes, no duplicate keys in one object. A byte order mark at the start is skipped. Nesting deeper than 64 levels, or more than 500,000 values, is refused. A key such as `__proto__` is only a name.

### The YAML subset

The YAML reader accepts what most plan files are written with, and refuses everything else with the line, never guessing.

Accepted:

- block mappings and block sequences, indented with spaces
- plain, single-quoted and double-quoted scalars (a double-quoted string may use `\"`, `\\`, `\/`, `\n`, `\t`, `\r`, `\0`, `\b` and `\f`)
- comments that start with `#` after a space or at the start of a line
- flow sequences of scalars on one line (`[a, b]`, `[]`) and the empty flow mapping `{}`
- one document, with or without a leading `---`

Refused, with the line:

- anchors, aliases, tags (`&`, `*`, `!`), directives, merge keys (`<<`). The specification describes the alias: "An alias node can then be used to indicate additional inclusions of the anchored node." A few lines of aliases can stand for a very large plan, so the tool reads none.
- block scalars (`|` and `>`): a long rollback text has to be written on one line, or the file converted to JSON
- flow mappings with content (`{a: 1}`), and a flow sequence that is split over lines or nested
- plain values that continue on the next line
- tabs in the indentation, more than one document, a key given twice in one mapping
- more than 200,000 lines, a line over 20,000 characters, nesting deeper than 64 levels

A scalar that looks like a number is a number (`2`, `1.5`), `true`, `false`, `null` and `~` are what they say, and `yes` and `no` are texts (which the `stateful` field reads as yes and no).
