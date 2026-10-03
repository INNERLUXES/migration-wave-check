# Changes

## 1.0.0

First release.

- Reads one application migration wave plan, as CSV (RFC 4180), JSON or the YAML subset of docs/inputs.md, with one entry per application: id, name, wave, strategy, owner, depends_on, stateful, data_sync, rollback, test_plan, dns_ttl_seconds and cutover_window_minutes, and the wave limits of the plan. Never connects to anything and never fetches anything.
- Inventory: two applications with one id (`duplicate-id`), a value that cannot be read (`value-invalid`), a strategy that is not one of the seven (`strategy-unknown`) or is missing (`strategy-missing`), an application that moves with no wave (`wave-missing`), and an application with no owner (`no-owner`).
- Dependencies: an id that is not in the plan (`dependency-unknown`), a loop (`dependency-cycle`), an application that moves before what it depends on (`dependency-later-wave`), a dependency on an application planned for retire (`retire-with-dependents`), and a link between an application that moves and one that is retained (`dependency-cross-environment`, info).
- Cutover readiness, for the applications that move: no rollback (`no-rollback`), stateful data with no sync method (`stateful-no-data-sync`), no test plan (`no-test-plan`), and a DNS TTL longer than the cutover window (`dns-ttl-longer-than-window`).
- Waves: a wave over its limit (`wave-over-limit`), and one summary line per wave (`wave-summary`, info). The limit comes from the plan, from one wave, or from `--max-apps-per-wave`.
- Every finding has an id, a severity (error, warning, info), the row or the JSON pointer and the line, a message, a fix, and the sentence of the guidance page or the RFC it rests on, with the address. The text of a name, an owner, a data sync method, a rollback or a test plan is never printed.
- The strategy names and every quoted sentence come from pages that are saved in `research/sources`; a test compares `src/data.js` and the documents with the saved text.
- Reports as text, Markdown, JSON and CSV; `--fail-on` for a pipeline gate; info never fails the run; exit code `2` for a usage or input error.
- Safe input: one file is read, files over 10 MB are refused, the CSV reader refuses stray quotes and records of the wrong length, JSON nested more than 64 deep is refused, the YAML reader accepts a documented subset only and refuses anchors, aliases and tags, the loop search walks a list instead of the call stack, patterns are bounded, and control characters are removed from every text shown.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
