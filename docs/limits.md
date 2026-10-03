# Limits

## What a plan file cannot show

- **Real network dependencies.** The tool reads `depends_on` as people wrote it. It does not look at traffic, connection logs, a discovery tool or the code. A dependency that nobody wrote down (a shared file share, a database link, a hard-coded address, a batch job that reads another system at night) is not seen, and the plan passes without it. The wave planning page asks for the opposite order: discover the dependencies first, then build the waves.
- **Real data volumes.** The plan says whether an application is stateful and names a sync method. It does not say how much data there is, how fast it changes, or whether the copy fits in the cutover window. A plan with `data_sync: replication` passes even when the replication cannot keep up.
- **Whether a rollback or a test plan works.** The tool sees that the field is filled. A rollback of one line, or a test plan that says "smoke test", passes. It cannot run the rollback, time it, or see whether it was ever tested.
- **The DNS records themselves.** The TTL is the number written in the plan. The tool does not query DNS, so a record whose real TTL differs from the plan is not seen, nor a client that caches longer than the TTL says.
- **The kind of dependency.** The plan has one list of dependencies. A link that tolerates latency, a hybrid link through a queue, and a link that breaks at once look the same. `dependency-later-wave` treats all of them as needing the order.
- **Capacity.** The wave limit is the number the plan gives. The tool does not know the size of the team, the length of the waves or the complexity of each application.
- **Dates and windows in time.** The plan has no dates. The tool does not check that waves are scheduled, that a window falls outside a business peak, or that a freeze is in place.

## What the tool does not check

- Whether the migration is safe. It reads one file and connects to nothing.
- The target environment: landing zone, network, identity, sizing, licences.
- The strategy choice itself. A rehost that should be a replatform is not judged; only the name is read.
- The text of the fields. A rollback is filled or not; its words are not read, and they are never printed.
- Applications that are not in the plan, except the ids that `depends_on` names.

## Size and depth

- A file over 10 MB is refused, from the size of the open file.
- At most 20,000 applications, 1,000 entries in one `depends_on`, and 200,000 dependencies in the plan.
- CSV: at most 100 columns and 20,000 characters in one field.
- JSON nested deeper than 64 levels, or with more than 500,000 values, is refused. YAML nested deeper than 64 levels, with more than 200,000 lines or a line over 20,000 characters, is refused.
- A check that finds more than 200 things lists the first 200 in a fixed order, counts the rest in the totals and the gate, and says so in a note.
- Text from the plan shown in a report is cut to a fixed length: 80 characters for an id in a message, 400 for a place, 200 for a subject, 900 for a message and 500 for a fix.

Every limit is reported, as a finding, a note or a refusal with exit code `2`, so a cut is never silent.
