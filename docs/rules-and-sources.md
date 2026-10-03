# Rules and sources

Every strategy name and every sentence that the tool quotes comes from a page that is saved in [research/sources](../research/sources), with its address on the first line. `src/data.js` holds them, and `test/data.test.js` compares each one with the saved text. Nothing was added from memory. Change a value only after saving the new page text and updating this file.

## The saved pages

| File | Address | What it is used for |
| --- | --- | --- |
| `aws-migration-strategies.txt` | https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html | the seven strategies, and what retire, retain and refactor mean |
| `caf-plan-migration.txt` | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration | the order of a plan, the owner, split-environment operations, the rollback plan, the two migration methods |
| `caf-migration-wave-planning.txt` | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning | waves, dependencies in the same wave, a unique id, wave size and team capacity |
| `caf-execute-migration.txt` | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration | tests after the move, the DNS switch, the fallback |
| `rfc1035-ttl.txt` | https://www.rfc-editor.org/rfc/rfc1035.txt | what the TTL of a DNS record is |
| `rfc2181-ttl.txt` | https://www.rfc-editor.org/rfc/rfc2181.txt | the range of a TTL value |
| `rfc4180-csv.txt` | https://www.rfc-editor.org/rfc/rfc4180.txt | the CSV format that the reader follows and the CSV report writes |
| `yaml-1.2.2-anchors-tags.txt` | https://yaml.org/spec/1.2.2/ | anchors, aliases and tags, which the YAML reader refuses |

The guidance pages are saved as the text of the article: the headings, the paragraphs, the lists and the tables flattened to lines, with the navigation, the feedback form, the list of tools and the date of the last update left out. One sentence of the AWS page that names a product (a porting tool for .NET) is left out of the Replatform list. Typographic dashes and quotes are written as plain ASCII. The RFCs are saved as the sections that the tool uses, with the page breaks (and the running header with its date) removed. The YAML page is saved as the four sections on anchors, aliases and tags.

## The sentences that the findings quote

Each sentence is on its saved page word for word. A key used by "docs" is quoted in the documents and in no finding.

| Key | Used by | Sentence | Page and section |
| --- | --- | --- | --- |
| `sevenRs` | `strategy-unknown`, `value-invalid` (strategy) | "There are seven migration strategies for moving applications to the cloud, known as the 7 Rs:" | `aws-migration-strategies.txt`, About the migration strategies |
| `strategyDefinition` | `strategy-unknown`, `strategy-missing` | "A migration strategy is the approach used to migrate a workload into the AWS Cloud." | `aws-migration-strategies.txt`, About the migration strategies |
| `retireDefinition` | docs | "This is the migration strategy for the applications that you want to decommission or archive." | `aws-migration-strategies.txt`, Retire |
| `retireShutDown` | `retire-with-dependents` | "Retiring the application means that you can shut down the servers within that application stack." | `aws-migration-strategies.txt`, Retire |
| `retainDefinition` | `dependency-cross-environment` | "This is the migration strategy for applications that you want to keep in your source environment or applications that you are not ready to migrate." | `aws-migration-strategies.txt`, Retain |
| `retainDependencies` | docs | "Dependencies - You might decide to retain an application if you need to migrate one or more other applications first." | `aws-migration-strategies.txt`, Retain |
| `refactor` | docs | "Using this strategy, you move an application to the cloud and modify its architecture by taking full advantage of cloud-native features to improve agility, performance, and scalability." | `aws-migration-strategies.txt`, Refactor or re-architect |
| `planDefinition` | `wave-missing`, `value-invalid` (wave) | "A migration plan defines the specific order, timing, and approach for migrating workloads to Azure." | `caf-plan-migration.txt`, Plan your migration |
| `planTable` | `value-invalid` | "Create a structured plan showing workload name, owner, criticality, migration method, downtime window, and business effects." | `caf-plan-migration.txt`, Engage stakeholders on migration plan |
| `workloadOwner` | `no-owner` | "Use the migration adoption plan to verify details like business unit, workload owner, technical dependencies, and criticality classification." | `caf-plan-migration.txt`, Prioritize workloads to migrate |
| `unmovable` | docs | "Identify components that must stay in your source environment due to technical or regulatory reasons." | `caf-plan-migration.txt`, Address split-environment operations |
| `splitTime` | `dependency-cross-environment` | "Create a clear plan with timelines and risk management approaches to reduce the time your workload operates across both environments." | `caf-plan-migration.txt`, Address split-environment operations |
| `rollbackBefore` | `no-rollback` | "Always establish rollback criteria and procedures before initiating any migration or deployment." | `caf-plan-migration.txt`, Define rollback plan |
| `rollbackPurpose` | `no-rollback` | "A rollback plan enables teams to quickly reverse changes when a deployment fails or introduces risk." | `caf-plan-migration.txt`, Define rollback plan |
| `downtimeSync` | `stateful-no-data-sync` | "Downtime migration is simpler and faster because it doesn't require real-time synchronization between source and target environments." | `caf-plan-migration.txt`, Choose the migration method for each workload |
| `nearZeroSync` | `stateful-no-data-sync` | "Near-zero downtime migration ensures that critical workloads remain operational during the transition through continuous data replication and cutover techniques." | `caf-plan-migration.txt`, Choose the migration method for each workload |
| `waveDefinition` | `wave-over-limit` | "Migration wave planning divides large migration projects into smaller, manageable groups of workloads that can be migrated together." | `caf-migration-wave-planning.txt`, Migration wave planning |
| `waveBatches` | `wave-summary` | "By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations." | `caf-migration-wave-planning.txt`, Migration wave planning |
| `sameWave` | `dependency-later-wave` | "You must identify workloads that communicate or share resources and group them into the same migration wave." | `caf-migration-wave-planning.txt`, Group dependent systems within the same wave |
| `dependenciesTogether` | `dependency-later-wave`, `retire-with-dependents` | "Dependencies between workloads cause service disruptions if not migrated together." | `caf-migration-wave-planning.txt`, Group dependent systems within the same wave |
| `mapDependencies` | `dependency-unknown` | "Map internal and external dependencies to discover these connections before creating migration groups." | `caf-migration-wave-planning.txt`, Group dependent systems within the same wave |
| `directTogether` | `dependency-cycle` | "Move all directly connected components together to maintain performance and avoid disruptions." | `caf-migration-wave-planning.txt`, Group dependent systems within the same wave, direct dependencies |
| `uniqueId` | `duplicate-id`, `value-invalid` (no id) | "Group name and ID - Unique identifier and descriptive name" | `caf-migration-wave-planning.txt`, Group dependent systems within the same wave |
| `waveCapacity` | `wave-over-limit`, `value-invalid` (limit) | "Set wave durations based on workload complexity and team capacity." | `caf-migration-wave-planning.txt`, Define timelines for each wave |
| `cutoverDocs` | docs | "Document rollback procedures and success criteria for each cutover." | `caf-migration-wave-planning.txt`, Define timelines for each wave |
| `endToEnd` | `no-test-plan` | "Run end-to-end tests to confirm that the application functions correctly with the migrated data." | `caf-execute-migration.txt`, Execute migration with downtime |
| `functionalTests` | docs | "Perform end-to-end functional testing of all critical business processes using automated test suites." | `caf-execute-migration.txt`, Execute near-zero downtime migration |
| `pauseWrites` | docs | "If you don't pause write operations, you increase the risk of data loss." | `caf-execute-migration.txt`, Execute near-zero downtime migration |
| `dnsCutover` | `dns-ttl-longer-than-window` | "Update DNS records and load balancer configurations to direct user traffic to the Azure environment." | `caf-execute-migration.txt`, Execute near-zero downtime migration |
| `revertDns` | docs | "Keep the source environment available and maintain the ability to revert DNS records and restore previous configurations if needed." | `caf-execute-migration.txt`, Maintain fallback option |
| `ttlField` | `dns-ttl-longer-than-window` | "a 32 bit signed integer that specifies the time interval that the resource record may be cached before the source of the information should again be consulted." | `rfc1035-ttl.txt`, 3.2.1 Format, TTL |
| `ttlRange` | `value-invalid` (TTL) | "It is hereby specified that a TTL value is an unsigned number, with a minimum value of 0, and a maximum value of 2147483647." | `rfc2181-ttl.txt`, 8 Time to Live (TTL) |
| `csvFieldCount` | docs | "Each line should contain the same number of fields throughout the file." | `rfc4180-csv.txt`, 2 Definition of the CSV Format, rule 4 |
| `csvEnclose` | docs | "Fields containing line breaks (CRLF), double quotes, and commas should be enclosed in double-quotes." | `rfc4180-csv.txt`, 2 Definition of the CSV Format, rule 6 |
| `csvEscape` | docs | "If double-quotes are used to enclose fields, then a double-quote appearing inside a field must be escaped by preceding it with another double quote." | `rfc4180-csv.txt`, 2 Definition of the CSV Format, rule 7 |
| `yamlAlias` | docs | "An alias node can then be used to indicate additional inclusions of the anchored node." | `yaml-1.2.2-anchors-tags.txt`, 6.9.2 Node Anchors |
| `yamlTag` | docs | "The tag property identifies the type of the native data structure presented by the node." | `yaml-1.2.2-anchors-tags.txt`, 6.9.1 Node Tags |

## The findings

| Id | Severity | Area | Sentences | Where the rule is written |
| --- | --- | --- | --- | --- |
| `duplicate-id` | error | Inventory | `uniqueId` | [method.md](method.md#duplicate-id-error) |
| `value-invalid` | error | Inventory | `planTable` | [method.md](method.md#value-invalid-error) |
| `strategy-unknown` | error | Inventory | `sevenRs`, `strategyDefinition` | [method.md](method.md#strategy-unknown-error) |
| `wave-missing` | error | Inventory | `planDefinition` | [method.md](method.md#wave-missing-error) |
| `dependency-unknown` | error | Dependencies | `mapDependencies` | [method.md](method.md#dependency-unknown-error) |
| `dependency-cycle` | error | Dependencies | `directTogether` | [method.md](method.md#dependency-cycle-error) |
| `dependency-later-wave` | error | Dependencies | `dependenciesTogether`, `sameWave` | [method.md](method.md#dependency-later-wave-error) |
| `retire-with-dependents` | error | Dependencies | `retireShutDown`, `dependenciesTogether` | [method.md](method.md#retire-with-dependents-error) |
| `no-rollback` | error | Cutover readiness | `rollbackBefore`, `rollbackPurpose` | [method.md](method.md#no-rollback-error) |
| `stateful-no-data-sync` | error | Cutover readiness | `nearZeroSync`, `downtimeSync` | [method.md](method.md#stateful-no-data-sync-error) |
| `strategy-missing` | warning | Inventory | `strategyDefinition` | [method.md](method.md#strategy-missing-warning) |
| `no-owner` | warning | Inventory | `workloadOwner` | [method.md](method.md#no-owner-warning) |
| `no-test-plan` | warning | Cutover readiness | `endToEnd` | [method.md](method.md#no-test-plan-warning) |
| `dns-ttl-longer-than-window` | warning | Cutover readiness | `ttlField`, `dnsCutover` | [method.md](method.md#dns-ttl-longer-than-window-warning) |
| `wave-over-limit` | warning | Waves | `waveDefinition`, `waveCapacity` | [method.md](method.md#wave-over-limit-warning) |
| `dependency-cross-environment` | info | Dependencies | `retainDefinition`, `splitTime` | [method.md](method.md#dependency-cross-environment-info) |
| `wave-summary` | info | Waves | `waveBatches` | [method.md](method.md#wave-summary-info) |

## What the tool decided itself

These are not stated by a page, and the documents say so where they apply:

- the severity of every finding
- which strategies move (rehost, relocate, replatform, repurchase, refactor), which one stays (retain) and which one ends (retire)
- that `re-architect` is read as `refactor`, and that no other name is guessed
- that a dependency in the same wave, or in an earlier wave, is in order
- that a loop of dependencies is an error even inside one wave
- the words that count as an empty text (`none`, `n/a`, `na`, `-`, `tbd`, `todo`, `null`) and the words read as yes and no
- that a CSV record must have exactly as many fields as the header
- that retained applications are not counted in a wave, and retired ones are when they have a wave
- the limit of 200 listed findings per check, and the size and depth limits
