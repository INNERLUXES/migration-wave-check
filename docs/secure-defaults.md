# Secure defaults

The default run is the safe run. Nothing below needs a flag, and none of it can be switched off.

## How the tool behaves by default

- **No network.** The tool reads the one file it is given and sends nothing anywhere. It does not look up DNS, does not connect to an application of the plan and does not check for updates. An argument that looks like an address is refused. It can run in a locked-down job with no outbound access at all.
- **No commands.** The tool never runs a program, a shell, `git` or a package manager. No name, path or value from the input is ever put on a command line.
- **No dependencies.** Node 22 or newer and nothing else, so a check does not add a supply chain of its own. There is no `node_modules` to install before it runs.
- **Strict readers.** The CSV reader follows RFC 4180 and refuses a stray quote, a quote that is never closed and a record with the wrong number of fields. The JSON reader accepts only JSON: no comments, no trailing commas, nesting no deeper than 64 levels, a key twice in one object refused. The YAML reader reads a documented subset and refuses anchors, aliases, tags and everything else outside it with its line. A file that is not understood stops the run with exit code `2`; it is never read halfway and passed.
- **Reads only what is named.** The tool opens the file you name, and nothing that the file names.
- **Regular files only, bounded.** The file is opened once, its type and size are taken from the open file, and anything that is not a regular file or is over 10 MB is refused before it is read.
- **Values stay out of the report.** The text of a name, an owner, a data sync method, a rollback and a test plan is never copied into a finding, a note or any format. A finding names an application by its id, and a wave or a TTL by its number.
- **Clean output.** Text from the input has control characters, line separators and direction controls removed and its length capped before it reaches a report or an error message, so a hostile id or path cannot rewrite the terminal or reorder what a reader sees. Markdown cells escape pipes, backslashes, square brackets, backticks, line breaks and `<`, `>` and `&`. CSV cells are quoted as RFC 4180 says, and a cell that a spreadsheet would read as a formula gets a leading `'`.
- **No prototype tricks.** JSON and YAML are read into objects without a prototype, and CSV columns are looked up in a map, so an id or a column named `__proto__` or `constructor` is just data.
- **Loops are cut.** The search for dependency loops walks a list, not the call stack, so a chain of 20,000 applications cannot overflow it.
- **A part that was not read is said.** A value that cannot be read is an error, a missing column is a note, a stateful value that is not given is a note, and a wave limit that is not given is a note. Nothing is guessed, and a part that the tool did not read is never shown as passed.
- **The gate is on.** Without any option, an error makes the run exit with `1`.
- **Writes nothing to disk.** The report goes to the screen. Redirect it to a file or the job summary only when you need to keep it.

## Running it safely on a plan you do not know

1. A plan is data, and the tool treats it as data. Still, run it as a user with read access to the file and nothing else; it needs no account, no key and no network.
2. Read the notes and the info findings: they say what was not read, so a pass is not taken for more than it is.
3. Keep secrets out of the plan. The tool does not print the text of the fields, but the file may travel through other tools of your pipeline.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline, with `ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS, with hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
