# Method

The tool reads one migration plan as data and runs the checks below. Every check says what it reports, why it has the severity it has, what it can see and what it cannot, and the sentence of the guidance page or of the RFC that it rests on. The pages are saved in [research/sources](../research/sources), and a test compares every quoted sentence with the saved text. Where the tool makes a choice that no page states (a severity, which strategies count as moving, the words that count as empty), the text says so.

Nothing is fetched at run time. A finding names an application by its id, and a wave or a TTL by its number. The text of a name, an owner, a data sync method, a rollback or a test plan is never copied into a finding.

## What is read

Every application of the plan with the fields of [inputs.md](inputs.md): `id`, `wave`, `strategy`, `owner`, `depends_on`, `stateful`, `data_sync`, `rollback`, `test_plan`, `dns_ttl_seconds` and `cutover_window_minutes`, and the limits `plan.max_apps_per_wave` and `waves[].max_apps` of a JSON or YAML plan.

## The seven strategies

The tool reads the strategy of every application as one of the seven names of the AWS page: "There are seven migration strategies for moving applications to the cloud, known as the 7 Rs:" retire, retain, rehost, relocate, repurchase, replatform, and refactor or re-architect. The page heads the last one "Refactor or re-architect", so `re-architect` is read as `refactor`.

The tool splits them in three groups. This split is its own reading of the page:

- **Move**: `rehost`, `relocate`, `replatform`, `repurchase`, `refactor`. The application moves to a new environment in a wave. The cutover checks apply.
- **Stay**: `retain`. The page says: "This is the migration strategy for applications that you want to keep in your source environment or applications that you are not ready to migrate." The application has no wave in the plan.
- **End**: `retire`. The page says: "Retiring the application means that you can shut down the servers within that application stack." A wave is optional; it is the wave in which the application is shut down.

## Inventory

### `duplicate-id` (error)

Two applications with the same `id`. The first one keeps the id; every other one is reported, and only the first one is used when another application names the id in `depends_on`. The wave planning page asks for a unique identifier for each group of workloads ("Group name and ID - Unique identifier and descriptive name"). With two entries under one id, a dependency on it cannot tell which one is meant, so it is an error.

### `value-invalid` (error)

A value that cannot be read: an application with no id, a wave that is not a whole number, a stateful value that is not a yes or a no, a text field that holds a number or a list, a TTL outside 0 to 2147483647, a cutover window that is not a number, an entry of `depends_on` that is not an id, a limit that is not a whole number from 1 to 100000, two limits for one wave, and an entry of the applications or the waves that is not an object. The checks that need the value are skipped for that application, so the gate fails: a value the tool cannot read must not pass quietly.

For the TTL, the range is the one of RFC 2181: "It is hereby specified that a TTL value is an unsigned number, with a minimum value of 0, and a maximum value of 2147483647."

### `strategy-unknown` (error)

A strategy that is not one of the seven names (after lower case and `re-architect`). The checks that depend on the strategy are skipped for the application, so it is an error. Common words such as `lift and shift` are not guessed: the AWS page uses it as another name for rehost, but a plan that writes it may mean something else.

### `wave-missing` (error)

An application that moves and has no wave. The plan page says: "A migration plan defines the specific order, timing, and approach for migrating workloads to Azure." An application with no wave has no place in that order, and its dependencies cannot be checked.

### `strategy-missing` (warning)

An application with no strategy. It is a warning, not an error, because the plan may still be in progress; the tool cannot tell whether the application moves, so the cutover and wave checks are skipped for it.

### `no-owner` (warning)

An application with no owner. The plan page says: "Use the migration adoption plan to verify details like business unit, workload owner, technical dependencies, and criticality classification." It applies to every strategy: a retired application needs someone to approve that it is switched off. It is a warning because the owner may be written elsewhere.

## Dependencies

`depends_on` lists the ids that an application needs. The tool reads the list as written; it does not discover dependencies. Each pair is looked at once, however many times it is written.

### `dependency-unknown` (error)

An id in `depends_on` that is not the id of an application in the plan. The wave planning page says: "Map internal and external dependencies to discover these connections before creating migration groups." A dependency that is not in the plan has no strategy and no wave, so nothing says where or when it moves. Add it, with `retain` if it does not move.

### `dependency-cycle` (error)

Applications that depend on each other in a loop, found as the strongly connected components of the dependency graph; an application that names itself is a loop too. Each loop is reported once, at the first of its applications in the plan, with up to ten ids. The page says of direct dependencies: "Move all directly connected components together to maintain performance and avoid disruptions." A loop means that no order of waves can put each application after what it needs. It is an error because a loop in a plan is either a wrong link or a group that should be one entry.

### `dependency-later-wave` (error)

An application that moves in an earlier wave than an application it depends on, when both move. The page says: "You must identify workloads that communicate or share resources and group them into the same migration wave." and "Dependencies between workloads cause service disruptions if not migrated together." The same wave, or a dependency that moves earlier, is not reported. It is an error because between the two waves the application runs in the new environment and needs the old one.

What it cannot see: a dependency that tolerates the delay. The page says indirect dependencies can "Migrate together or in separate waves if the connection tolerates latency or supports hybrid use." The plan has no field for that; if the link is indirect, remove it from `depends_on` or move the waves.

### `retire-with-dependents` (error)

An application that is not retired depends on an application planned for retire. A retired application that depends on another retired one is not reported. The AWS page says: "Retiring the application means that you can shut down the servers within that application stack." When it is shut down, the dependent loses what it needs, so it is an error. The finding is reported at the dependent's `depends_on`, where the fix is made.

### `dependency-cross-environment` (info)

An application that moves depends on one that is retained, or a retained application depends on one that moves. After the move the link crosses the old and the new environment. The plan page says: "Identify components that must stay in your source environment due to technical or regulatory reasons." and "Create a clear plan with timelines and risk management approaches to reduce the time your workload operates across both environments." The AWS page names this case among the reasons to retain: "Dependencies - You might decide to retain an application if you need to migrate one or more other applications first." It is info: it is not a mistake, but the link needs a plan (network path, latency, firewall rules, who owns it).

## Cutover readiness

These checks apply to the applications that move.

### `no-rollback` (error)

An application that moves with an empty `rollback`. The plan page says: "Always establish rollback criteria and procedures before initiating any migration or deployment." and "A rollback plan enables teams to quickly reverse changes when a deployment fails or introduces risk." It is an error because a cutover with no way back is the most expensive gap of a plan. The tool sees whether the field is filled, not whether the rollback works.

### `stateful-no-data-sync` (error)

An application that moves, is `stateful`, and has an empty `data_sync` (or `none`). The plan page names the two ways data can move: "Near-zero downtime migration ensures that critical workloads remain operational during the transition through continuous data replication and cutover techniques." and "Downtime migration is simpler and faster because it doesn't require real-time synchronization between source and target environments." Either way, the method has to be named. An application whose `stateful` is empty is not judged, and a note counts them.

### `no-test-plan` (warning)

An application that moves with an empty `test_plan`. The execution page says: "Run end-to-end tests to confirm that the application functions correctly with the migrated data." It is a warning because the tests may be kept in a shared test plan of the wave.

### `dns-ttl-longer-than-window` (warning)

An application that moves whose `dns_ttl_seconds` is larger than `cutover_window_minutes` times 60. RFC 1035 defines the TTL as "a 32 bit signed integer that specifies the time interval that the resource record may be cached before the source of the information should again be consulted." The execution page switches traffic through DNS: "Update DNS records and load balancer configurations to direct user traffic to the Azure environment." With a TTL longer than the window, a resolver may keep the old address after the window has closed. It is a warning because many teams lower the TTL ahead of the cutover, which the plan may not show. Both fields have to be given; the check is not run otherwise.

## Waves

### `wave-over-limit` (warning)

A wave that holds more applications than its limit. The limit of one wave (`waves[].max_apps`) comes first, then `--max-apps-per-wave`, then `plan.max_apps_per_wave`. The applications that move and the retired applications with a wave are counted; retained applications are not. The wave planning page says: "Migration wave planning divides large migration projects into smaller, manageable groups of workloads that can be migrated together." and "Set wave durations based on workload complexity and team capacity." The limit is the plan's own; the tool does not choose one. When no limit is given, the check is not run and a note says so.

### `wave-summary` (info)

One line per wave, in wave order: how many applications it holds, by strategy, and how many are stateful. It never fails a run. The page says: "By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations."

## Severities and the gate

An error is something that makes a wave unsafe to run, or a value the tool cannot read. A warning is a gap that most reviewers would ask about. Info is a link to plan for, or the shape of a wave. With the default `--fail-on error`, only errors fail the run; `--fail-on warning` fails on warnings too; info never fails. The severities are the tool's own, and the pages do not state them.

When one check finds more than 200 things, the first 200 are listed, in a fixed order, and the rest is counted (the gate uses the full count) and named in a note.
