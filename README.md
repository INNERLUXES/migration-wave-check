# migration-wave-check

Reads an application migration wave plan (CSV, JSON or YAML) and reports what makes a wave unsafe to run. You give it the file. It reads every application with its wave, its strategy (one of the 7 Rs), its owner, what it depends on, whether it holds data, how the data is kept in sync, the rollback, the test plan, the DNS TTL and the cutover window. It reports an application that moves before something it depends on, a dependency loop, a dependency on an id that is not in the plan, an application that still depends on one planned for retire, a move with no rollback or no test plan, stateful data with no sync method, a DNS TTL longer than the cutover window, a missing or unknown strategy, a missing owner, and a wave that is over its limit. Every finding names the row (CSV) or the JSON pointer (JSON and YAML) and the line, the severity, a sentence on how to fix it, and the sentence of the guidance page or the RFC that it rests on, with its address.

A wave plan is usually a spreadsheet. Many people edit it, and it decides the order in which systems move. A wrong order or a missing rollback does not show until the night of the cutover. A dependency that moves a wave too late, a database with no sync method, a TTL of a day for a window of an hour: all of these are visible in the plan. This tool reads them in a second, so the check can run every time the plan changes.

- Every finding has an id, a severity (error, warning or info), the row or JSON pointer and the line, a plain message, a fix, and the quoted sentence of the page it rests on, with the address of the saved page.
- What a plan cannot show is said, not guessed. A plan file does not show the real network dependencies or the real data volumes; [docs/limits.md](docs/limits.md) lists what is out of reach.
- The strategy names and every quoted sentence come from the official pages, which are saved in [research/sources](research/sources); a test compares [src/data.js](src/data.js) and the documents with the saved text.
- Reports as text, Markdown, JSON and CSV, with an exit code for a pipeline gate. Info findings never fail the run.
- Plain JavaScript, no dependencies; the same file always gives the same report. The CSV reader follows RFC 4180, and the YAML reader is strict: anchors, aliases and tags are refused.

```
npm test
```

```
tests 124
pass 119
fail 0
skipped 5
```

These are the summary lines that `npm test` prints at the end. The five skipped tests are the ones that need a system other than Windows: two symbolic link tests, a device file, a file name with a control character, and a file name with a backslash. They are guarded with `process.platform`. On Linux and macOS only the test for Windows paths is skipped, and 123 of the 124 run.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/migration-wave-check.git
cd migration-wave-check
node bin/migration-wave-check.js examples/orders-estate.csv
```

Or without a clone, in the folder of your plan:

```
npx --yes github:INNERLUXES/migration-wave-check wave-plan.csv
```

`examples/` holds a made-up estate. `examples/orders-estate.csv` is an online shop that moves to the cloud in three waves, wrong on purpose: the orders API moves a wave before its database, the database has no sync method, the pricing service has no owner and no rollback, the reports still read from a ledger that is planned for retire, the web shop keeps a DNS TTL of an hour for a window of half an hour, and wave 2 is over the limit. `examples/orders-estate-fixed.csv` is the same estate repaired, and passes at the strictest level. `examples/orders-estate.yaml` is a smaller plan in YAML, with the wave limits written in the plan itself.

## Usage

```
node bin/migration-wave-check.js examples/orders-estate.csv --fail-on warning --max-apps-per-wave 3
```

```
migration-wave-check: examples/orders-estate.csv
plan: csv, 11 applications (7 move, 1 retained, 1 retired) in 3 waves, limit 3 applications per wave
areas:
  Inventory           fail   strategy-unknown x1, strategy-missing x1, no-owner x1
  Dependencies        fail   dependency-unknown x1, dependency-cycle x1, dependency-later-wave x1, retire-with-dependents x1, dependency-cross-environment x1
  Cutover readiness   fail   no-rollback x1, stateful-no-data-sync x1, no-test-plan x1, dns-ttl-longer-than-window x1
  Waves               warn   wave-over-limit x1, wave-summary x3
findings: 7 error, 5 warning, 4 info

Inventory (3 findings)

  ERROR    strategy-unknown  row 10, strategy  line 10
           The strategy "lift and shift" of the application "search" is not one of the seven (retire, retain, rehost, relocate, repurchase, replatform, refactor), so the cutover and wave checks were skipped for it.
           basis: "There are seven migration strategies for moving applications to the cloud, known as the 7 Rs:" (About the migration strategies, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
           basis: "A migration strategy is the approach used to migrate a workload into the AWS Cloud." (About the migration strategies, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
           fix: Use one of the seven names.

  WARNING  strategy-missing  row 12, strategy  line 12
           The application "inventory-sync" has no strategy, so the tool cannot tell whether it moves, stays or is retired, and the cutover and wave checks were skipped for it.
           basis: "A migration strategy is the approach used to migrate a workload into the AWS Cloud." (About the migration strategies, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
           fix: Choose one of the seven strategies for the application: retire, retain, rehost, relocate, repurchase, replatform or refactor.

  WARNING  no-owner  row 5, owner  line 5
           The application "pricing" has no owner, so nobody is named to approve its cutover, its rollback or its retirement.
           basis: "Use the migration adoption plan to verify details like business unit, workload owner, technical dependencies, and criticality classification." (Prioritize workloads to migrate, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           fix: Name the team or the person who owns the application.

Dependencies (5 findings)

  ERROR    dependency-unknown  row 9, depends_on  line 9
           The application "notifications" depends on "email-relay", which is not an id in this plan, so nothing says where or when that dependency moves.
           basis: "Map internal and external dependencies to discover these connections before creating migration groups." (Group dependent systems within the same wave, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Add "email-relay" to the plan (with the strategy retain if it does not move), or correct the id.

  ERROR    dependency-cycle  row 11, depends_on  line 11
           The applications "catalog" and "inventory-sync" depend on each other in a loop, so no order of waves can put each one after what it needs.
           basis: "Move all directly connected components together to maintain performance and avoid disruptions." (Group dependent systems within the same wave, direct dependencies, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Check the links and remove the one that is not real. If the applications truly need each other, plan them as one unit: one entry of the plan, in one wave.

  ERROR    dependency-later-wave  row 3, depends_on  line 3
           The application "orders-api" moves in wave 1 and depends on "orders-db", which moves later, in wave 2. Between the two waves "orders-api" runs in the new environment and calls back to the old one, or does not work at all.
           basis: "Dependencies between workloads cause service disruptions if not migrated together." (Group dependent systems within the same wave, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           basis: "You must identify workloads that communicate or share resources and group them into the same migration wave." (Group dependent systems within the same wave, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Move "orders-db" in wave 1 or earlier, or move "orders-api" in wave 2 with it.

  ERROR    retire-with-dependents  row 6, depends_on  line 6
           The application "reports" (rehost, wave 3) depends on "legacy-ledger", which is planned for retire. When "legacy-ledger" is shut down, "reports" loses something it needs.
           basis: "Retiring the application means that you can shut down the servers within that application stack." (Retire, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
           basis: "Dependencies between workloads cause service disruptions if not migrated together." (Group dependent systems within the same wave, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Remove the dependency first (replace or move what "reports" uses), or do not retire "legacy-ledger" while something depends on it.

  INFO     dependency-cross-environment  row 5, depends_on  line 5
           The application "pricing" moves (refactor, wave 1) and depends on "mainframe-billing", which is retained in the source environment. After the move this link crosses from the new environment to the old one. This is not an error; it is a link to plan for.
           basis: "This is the migration strategy for applications that you want to keep in your source environment or applications that you are not ready to migrate." (Retain, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
           basis: "Create a clear plan with timelines and risk management approaches to reduce the time your workload operates across both environments." (Address split-environment operations, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           fix: Plan the link across both environments (network path, latency, firewall rules and who owns it), and write down when "mainframe-billing" will move, if ever.

Cutover readiness (4 findings)

  ERROR    no-rollback  row 5, rollback  line 5
           The application "pricing" (refactor, wave 1) has no rollback plan, so if the cutover fails nothing written says how to go back or when to decide it.
           basis: "Always establish rollback criteria and procedures before initiating any migration or deployment." (Define rollback plan, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           basis: "A rollback plan enables teams to quickly reverse changes when a deployment fails or introduces risk." (Define rollback plan, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           fix: Write the rollback steps, and the condition that starts them, in the rollback field.

  ERROR    stateful-no-data-sync  row 4, data_sync  line 4
           The application "orders-db" (replatform, wave 2) is stateful and names no data sync method, so nothing says how its data reaches the new environment and stays current until the cutover.
           basis: "Near-zero downtime migration ensures that critical workloads remain operational during the transition through continuous data replication and cutover techniques." (Choose the migration method for each workload, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           basis: "Downtime migration is simpler and faster because it doesn't require real-time synchronization between source and target environments." (Choose the migration method for each workload, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           fix: Name the method in data_sync (for example replication or backup-restore), and say how writes are paused at the cutover.

  WARNING  no-test-plan  row 6, test_plan  line 6
           The application "reports" (rehost, wave 3) has no test plan, so nothing says how the team will know that the application works after the move.
           basis: "Run end-to-end tests to confirm that the application functions correctly with the migrated data." (Execute migration with downtime, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration)
           fix: Write the tests that prove the application works after the cutover, for example end-to-end tests of its main business flows, in the test_plan field.

  WARNING  dns-ttl-longer-than-window  row 2, dns_ttl_seconds  line 2
           The DNS TTL of the application "orders-web" is 3,600 seconds and its cutover window is 30 minutes (1,800 seconds). A resolver may keep the old address for as long as the TTL, so clients can still reach the old environment after the window has closed.
           basis: "a 32 bit signed integer that specifies the time interval that the resource record may be cached before the source of the information should again be consulted." (3.2.1 Format, TTL, https://www.rfc-editor.org/rfc/rfc1035.txt)
           basis: "Update DNS records and load balancer configurations to direct user traffic to the Azure environment." (Execute near-zero downtime migration, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration)
           fix: Lower the TTL to the length of the window or less, and do it at least one old TTL before the cutover starts.

Waves (4 findings)

  WARNING  wave-over-limit  wave 2  line 2
           Wave 2 holds 4 applications, and the limit given with --max-apps-per-wave is 3. A wave that is bigger than the team planned for leaves less room to test, to fix and to roll back.
           basis: "Migration wave planning divides large migration projects into smaller, manageable groups of workloads that can be migrated together." (Migration wave planning, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           basis: "Set wave durations based on workload complexity and team capacity." (Define timelines for each wave, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Move 1 application to another wave (keeping dependencies in order), or raise the limit if the team can carry it.

  INFO     wave-summary  wave 1  line 3
           Wave 1 holds 2 applications: 1 replatform, 1 refactor; 0 are stateful.
           basis: "By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations." (Migration wave planning, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Nothing to fix; this line shows the shape of the wave.

  INFO     wave-summary  wave 2  line 2
           Wave 2 holds 4 applications: 3 rehost, 1 replatform; 1 is stateful.
           basis: "By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations." (Migration wave planning, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Nothing to fix; this line shows the shape of the wave.

  INFO     wave-summary  wave 3  line 6
           Wave 3 holds 1 application: 1 rehost; 0 are stateful.
           basis: "By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations." (Migration wave planning, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Nothing to fix; this line shows the shape of the wave.

GATE: FAIL - 7 errors, 5 warnings
```

The exit code is `1`: errors fail the run by default. The five warnings do not, unless you run with `--fail-on warning`, as here. The four `info` findings never fail a run. A link to an application that stays behind (`dependency-cross-environment`) is info: it is not a mistake, but it is a link to plan for. The `wave-summary` lines show the shape of each wave.

The repaired plan passes, also with `--fail-on warning`:

```
node bin/migration-wave-check.js examples/orders-estate-fixed.csv --fail-on warning --max-apps-per-wave 3
```

```
migration-wave-check: examples/orders-estate-fixed.csv
plan: csv, 12 applications (9 move, 2 retained, 1 retired) in 3 waves, limit 3 applications per wave
areas:
  Inventory           pass   no finding
  Dependencies        info   dependency-cross-environment x2
  Cutover readiness   pass   no finding
  Waves               info   wave-summary x3
findings: 0 error, 0 warning, 5 info

Dependencies (2 findings)

  INFO     dependency-cross-environment  row 3, depends_on  line 3
           The application "pricing" moves (refactor, wave 1) and depends on "mainframe-billing", which is retained in the source environment. After the move this link crosses from the new environment to the old one. This is not an error; it is a link to plan for.
           basis: "This is the migration strategy for applications that you want to keep in your source environment or applications that you are not ready to migrate." (Retain, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
           basis: "Create a clear plan with timelines and risk management approaches to reduce the time your workload operates across both environments." (Address split-environment operations, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           fix: Plan the link across both environments (network path, latency, firewall rules and who owns it), and write down when "mainframe-billing" will move, if ever.

  INFO     dependency-cross-environment  row 6, depends_on  line 6
           The application "notifications" moves (rehost, wave 2) and depends on "email-relay", which is retained in the source environment. After the move this link crosses from the new environment to the old one. This is not an error; it is a link to plan for.
           basis: "This is the migration strategy for applications that you want to keep in your source environment or applications that you are not ready to migrate." (Retain, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html)
           basis: "Create a clear plan with timelines and risk management approaches to reduce the time your workload operates across both environments." (Address split-environment operations, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           fix: Plan the link across both environments (network path, latency, firewall rules and who owns it), and write down when "email-relay" will move, if ever.

Waves (3 findings)

  INFO     wave-summary  wave 1  line 2
           Wave 1 holds 3 applications: 2 replatform, 1 refactor; 1 is stateful.
           basis: "By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations." (Migration wave planning, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Nothing to fix; this line shows the shape of the wave.

  INFO     wave-summary  wave 2  line 5
           Wave 2 holds 3 applications: 2 rehost, 1 replatform; 0 are stateful.
           basis: "By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations." (Migration wave planning, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Nothing to fix; this line shows the shape of the wave.

  INFO     wave-summary  wave 3  line 8
           Wave 3 holds 3 applications: 3 rehost; 0 are stateful.
           basis: "By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations." (Migration wave planning, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)
           fix: Nothing to fix; this line shows the shape of the wave.

GATE: PASS (--fail-on warning)
```

Passing means that none of the checks found anything in the file. It does not mean that the migration is safe; [docs/limits.md](docs/limits.md) lists what a plan cannot show.

```
migration-wave-check <plan-file> [options]
```

```
--format <name>              text, markdown, json or csv (default: text)
--fail-on <level>            exit with 1 when a finding is at this level or above: error or warning
                             (default: error); info never fails the run
--max-apps-per-wave <n>      the most applications one wave may hold; replaces the limit of the plan
--help                       show the usage
--version                    show the version
```

Paths in the report are relative to the folder you run the command in, with forward slashes on every system; a file outside it is shown with its absolute path.

## The plan

One row (CSV) or one object (JSON, YAML) per application. [docs/inputs.md](docs/inputs.md) has the whole schema.

| Field | What it holds |
| --- | --- |
| `id` | a short id, unique in the plan (required) |
| `name` | a readable name (not checked) |
| `wave` | the number of the wave in which the application moves |
| `strategy` | `retire`, `retain`, `rehost`, `relocate`, `replatform`, `repurchase` or `refactor` |
| `owner` | the team or person who owns the application |
| `depends_on` | the ids it depends on; in a CSV cell, separated by `;` |
| `stateful` | yes or no: does it hold data that must move with it |
| `data_sync` | how the data is moved and kept current, for example `replication` or `backup-restore`; `none` counts as empty |
| `rollback` | how to go back if the cutover fails |
| `test_plan` | how the team proves it works after the move |
| `dns_ttl_seconds` | the TTL of the DNS record that is switched at the cutover |
| `cutover_window_minutes` | the length of the cutover window |

A JSON or YAML plan can also set `plan.max_apps_per_wave`, and a limit for one wave under `waves`. For a CSV plan, give the limit with `--max-apps-per-wave`.

## The checks

| Id | Severity | What it reports |
| --- | --- | --- |
| `duplicate-id` | error | Two applications have the same id |
| `value-invalid` | error | A value cannot be read: an id, a wave, a yes or no, a number of seconds or minutes, or a limit |
| `strategy-unknown` | error | The strategy is not one of the seven |
| `wave-missing` | error | An application that moves has no wave |
| `dependency-unknown` | error | `depends_on` names an id that is not in the plan |
| `dependency-cycle` | error | Applications depend on each other in a loop |
| `dependency-later-wave` | error | An application moves in an earlier wave than an application it depends on |
| `retire-with-dependents` | error | An application that is not retired depends on one planned for retire |
| `no-rollback` | error | An application that moves (rehost, relocate, replatform, repurchase, refactor) has no rollback |
| `stateful-no-data-sync` | error | A stateful application that moves has no data sync method, or `none` |
| `strategy-missing` | warning | An application has no strategy |
| `no-owner` | warning | An application has no owner |
| `no-test-plan` | warning | An application that moves has no test plan |
| `dns-ttl-longer-than-window` | warning | `dns_ttl_seconds` is longer than the cutover window in seconds |
| `wave-over-limit` | warning | A wave holds more applications than the limit |
| `dependency-cross-environment` | info | An application that moves depends on one that is retained, or the other way round |
| `wave-summary` | info | One line per wave: how many applications, by strategy, and how many are stateful |

[docs/method.md](docs/method.md) gives each check, its exact rule, what it can see and what it cannot. [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every name and every quoted sentence with the saved page it comes from.

## Where the facts come from

| Fact | Source |
| --- | --- |
| The seven migration strategies, and what retire and retain mean | AWS Prescriptive Guidance, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html |
| The migration plan, the owner, the rollback plan, the migration method, split-environment operations | Microsoft Cloud Adoption Framework, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration |
| Dependencies in the same wave, wave size and team capacity | Microsoft Cloud Adoption Framework, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning |
| Tests after the cutover, the DNS switch | Microsoft Cloud Adoption Framework, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration |
| What a TTL is, and its range | https://www.rfc-editor.org/rfc/rfc1035.txt and https://www.rfc-editor.org/rfc/rfc2181.txt |
| The CSV format | https://www.rfc-editor.org/rfc/rfc4180.txt |
| YAML anchors, aliases and tags | https://yaml.org/spec/1.2.2/ |

## Formats

- `text`: for a terminal: the plan, the areas with their result, then the findings grouped by area, each with its rule id, row or pointer, line, message, quotation and fix.
- `markdown`: the same for a pull request comment or the job summary. Pipes, square brackets, backticks, line breaks and angle brackets from the input are escaped, so an id from the file cannot break a table or make a link.
- `json`: the whole report: the plan, the areas, every finding with id, severity, area, where, line, subject, message, fix, basis and source, the notes and the gate.
- `csv`: one row per finding, quoted as RFC 4180 says. A cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet does not run it as a formula.

To put the report in the job summary of a GitHub Actions run:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Migration wave report
    run: npx --yes github:INNERLUXES/migration-wave-check wave-plan.csv --format markdown >> "$GITHUB_STEP_SUMMARY"
  - name: Migration wave gate
    run: npx --yes github:INNERLUXES/migration-wave-check wave-plan.csv --fail-on warning
```

It needs no secrets, no access to the estate and no build; a Linux runner is enough. Start with the default gate (errors only), and move to `--fail-on warning` when the first report is clean.

## Exit codes

`0` no finding at the `--fail-on` level, `1` at least one such finding (by default: an error), `2` a usage or input error (a missing file, a file that is not CSV, JSON or the YAML subset, a CSV row with a different number of fields than the header, a file over the size limit, an unknown option).

## Limits

The tool reads what the plan says, not what the estate does. It does not discover dependencies on the network, measure data volumes, time a copy or test a rollback. A dependency that nobody wrote down is not seen, and a rollback written as one line passes. A finding is a review item, and a clean report is not a safe migration. [docs/limits.md](docs/limits.md) lists these, with the size limits and the YAML that is read.

## Related

The tool reads the plan of moving applications. It does not read database schema migrations: `sql-migration-check` in the same organization reads those. Where this tool mentions data, it does so for the plan: whether a stateful application names how its data moves.

## Background

- How application estates are assessed, ordered into waves and moved, with checks like this one on the plan: [application migration services](https://innerluxes.dev/application/migration).

## License

MIT
