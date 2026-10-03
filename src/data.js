// The names and sentences the checks rest on. Each sentence comes from a page that is saved, with its address on the
// first line, in research/sources, and test/data.test.js compares this file with the saved text. Change a value here
// only after saving the new page text and updating docs/rules-and-sources.md. The checks in src/ use these constants
// and never write a column name, a strategy name or a quoted sentence of their own.

export const SOURCES = [
  { id: 'aws-strategies', file: 'aws-migration-strategies.txt', url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html', label: 'AWS Prescriptive Guidance, Guide for AWS large migrations, About the migration strategies' },
  { id: 'caf-plan', file: 'caf-plan-migration.txt', url: 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration', label: 'Microsoft Cloud Adoption Framework, Plan your migration' },
  { id: 'caf-waves', file: 'caf-migration-wave-planning.txt', url: 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning', label: 'Microsoft Cloud Adoption Framework, Migration wave planning' },
  { id: 'caf-execute', file: 'caf-execute-migration.txt', url: 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration', label: 'Microsoft Cloud Adoption Framework, Execute migration to cloud' },
  { id: 'rfc1035', file: 'rfc1035-ttl.txt', url: 'https://www.rfc-editor.org/rfc/rfc1035.txt', label: 'RFC 1035 Domain Names, Implementation and Specification, section 3.2.1' },
  { id: 'rfc2181', file: 'rfc2181-ttl.txt', url: 'https://www.rfc-editor.org/rfc/rfc2181.txt', label: 'RFC 2181 Clarifications to the DNS Specification, sections 5.2 and 8' },
  { id: 'rfc4180', file: 'rfc4180-csv.txt', url: 'https://www.rfc-editor.org/rfc/rfc4180.txt', label: 'RFC 4180 Common Format and MIME Type for CSV Files, section 2' },
  { id: 'yaml-1.2.2', file: 'yaml-1.2.2-anchors-tags.txt', url: 'https://yaml.org/spec/1.2.2/', label: 'YAML Ain\'t Markup Language version 1.2.2, sections 3.2.2.2, 6.9.1, 6.9.2 and 7.1' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// The names of the columns of a CSV plan and of the fields of an application in a JSON or YAML plan, and the names of
// the plan-level fields. docs/inputs.md describes each one.
export const FIELDS = {
  id: 'id',
  name: 'name',
  wave: 'wave',
  strategy: 'strategy',
  owner: 'owner',
  dependsOn: 'depends_on',
  stateful: 'stateful',
  dataSync: 'data_sync',
  rollback: 'rollback',
  testPlan: 'test_plan',
  dnsTtl: 'dns_ttl_seconds',
  cutoverWindow: 'cutover_window_minutes',
  plan: 'plan',
  planName: 'name',
  maxAppsPerWave: 'max_apps_per_wave',
  waves: 'waves',
  maxApps: 'max_apps',
  applications: 'applications'
};

// The columns of an application, in the order the documents list them.
export const APP_FIELDS = ['id', 'name', 'wave', 'strategy', 'owner', 'dependsOn', 'stateful', 'dataSync', 'rollback', 'testPlan', 'dnsTtl', 'cutoverWindow'].map((k) => FIELDS[k]);

// The seven migration strategies, as the AWS page names them. The page heads the last one "Refactor or re-architect",
// so re-architect is read as refactor.
export const STRATEGIES = { retire: 'retire', retain: 'retain', rehost: 'rehost', relocate: 'relocate', repurchase: 'repurchase', replatform: 'replatform', refactor: 'refactor' };
export const STRATEGY_ALIASES = { 're-architect': 'refactor' };

// The strategies that move an application to a new environment in a wave. A retained application stays where it is,
// and a retired one is shut down. The grouping is the tool's own; docs/method.md says why.
export const MOVING = ['rehost', 'relocate', 'replatform', 'repurchase', 'refactor'];

// Words that a plan writes in a text cell when there is nothing there. They count as empty.
export const EMPTY_WORDS = ['none', 'n/a', 'na', '-', 'tbd', 'todo', 'null'];

// The words read as yes and no in the stateful column.
export const YES_WORDS = ['true', 'yes', 'y', '1'];
export const NO_WORDS = ['false', 'no', 'n', '0'];

// The largest TTL value that RFC 2181 allows.
export const MAX_TTL = 2147483647;

// Sentences quoted in the findings and the documents. Every text is on its saved page word for word
// (test/data.test.js compares them), and holds no year.
export const FACTS = {
  sevenRs: { source: 'aws-strategies', section: 'About the migration strategies', text: 'There are seven migration strategies for moving applications to the cloud, known as the 7 Rs:' },
  strategyDefinition: { source: 'aws-strategies', section: 'About the migration strategies', text: 'A migration strategy is the approach used to migrate a workload into the AWS Cloud.' },
  retireDefinition: { source: 'aws-strategies', section: 'Retire', text: 'This is the migration strategy for the applications that you want to decommission or archive.' },
  retireShutDown: { source: 'aws-strategies', section: 'Retire', text: 'Retiring the application means that you can shut down the servers within that application stack.' },
  retainDefinition: { source: 'aws-strategies', section: 'Retain', text: 'This is the migration strategy for applications that you want to keep in your source environment or applications that you are not ready to migrate.' },
  retainDependencies: { source: 'aws-strategies', section: 'Retain', text: 'Dependencies - You might decide to retain an application if you need to migrate one or more other applications first.' },
  refactor: { source: 'aws-strategies', section: 'Refactor or re-architect', text: 'Using this strategy, you move an application to the cloud and modify its architecture by taking full advantage of cloud-native features to improve agility, performance, and scalability.' },
  planDefinition: { source: 'caf-plan', section: 'Plan your migration', text: 'A migration plan defines the specific order, timing, and approach for migrating workloads to Azure.' },
  planTable: { source: 'caf-plan', section: 'Engage stakeholders on migration plan', text: 'Create a structured plan showing workload name, owner, criticality, migration method, downtime window, and business effects.' },
  workloadOwner: { source: 'caf-plan', section: 'Prioritize workloads to migrate', text: 'Use the migration adoption plan to verify details like business unit, workload owner, technical dependencies, and criticality classification.' },
  unmovable: { source: 'caf-plan', section: 'Address split-environment operations', text: 'Identify components that must stay in your source environment due to technical or regulatory reasons.' },
  splitTime: { source: 'caf-plan', section: 'Address split-environment operations', text: 'Create a clear plan with timelines and risk management approaches to reduce the time your workload operates across both environments.' },
  rollbackBefore: { source: 'caf-plan', section: 'Define rollback plan', text: 'Always establish rollback criteria and procedures before initiating any migration or deployment.' },
  rollbackPurpose: { source: 'caf-plan', section: 'Define rollback plan', text: 'A rollback plan enables teams to quickly reverse changes when a deployment fails or introduces risk.' },
  downtimeSync: { source: 'caf-plan', section: 'Choose the migration method for each workload', text: "Downtime migration is simpler and faster because it doesn't require real-time synchronization between source and target environments." },
  nearZeroSync: { source: 'caf-plan', section: 'Choose the migration method for each workload', text: 'Near-zero downtime migration ensures that critical workloads remain operational during the transition through continuous data replication and cutover techniques.' },
  waveDefinition: { source: 'caf-waves', section: 'Migration wave planning', text: 'Migration wave planning divides large migration projects into smaller, manageable groups of workloads that can be migrated together.' },
  waveBatches: { source: 'caf-waves', section: 'Migration wave planning', text: 'By migrating in controlled batches rather than attempting to move everything at once, you gain valuable experience with each wave that improves subsequent migrations.' },
  sameWave: { source: 'caf-waves', section: 'Group dependent systems within the same wave', text: 'You must identify workloads that communicate or share resources and group them into the same migration wave.' },
  dependenciesTogether: { source: 'caf-waves', section: 'Group dependent systems within the same wave', text: 'Dependencies between workloads cause service disruptions if not migrated together.' },
  mapDependencies: { source: 'caf-waves', section: 'Group dependent systems within the same wave', text: 'Map internal and external dependencies to discover these connections before creating migration groups.' },
  directTogether: { source: 'caf-waves', section: 'Group dependent systems within the same wave, direct dependencies', text: 'Move all directly connected components together to maintain performance and avoid disruptions.' },
  uniqueId: { source: 'caf-waves', section: 'Group dependent systems within the same wave', text: 'Group name and ID - Unique identifier and descriptive name' },
  waveCapacity: { source: 'caf-waves', section: 'Define timelines for each wave', text: 'Set wave durations based on workload complexity and team capacity.' },
  cutoverDocs: { source: 'caf-waves', section: 'Define timelines for each wave', text: 'Document rollback procedures and success criteria for each cutover.' },
  endToEnd: { source: 'caf-execute', section: 'Execute migration with downtime', text: 'Run end-to-end tests to confirm that the application functions correctly with the migrated data.' },
  functionalTests: { source: 'caf-execute', section: 'Execute near-zero downtime migration', text: 'Perform end-to-end functional testing of all critical business processes using automated test suites.' },
  pauseWrites: { source: 'caf-execute', section: 'Execute near-zero downtime migration', text: "If you don't pause write operations, you increase the risk of data loss." },
  dnsCutover: { source: 'caf-execute', section: 'Execute near-zero downtime migration', text: 'Update DNS records and load balancer configurations to direct user traffic to the Azure environment.' },
  revertDns: { source: 'caf-execute', section: 'Maintain fallback option', text: 'Keep the source environment available and maintain the ability to revert DNS records and restore previous configurations if needed.' },
  ttlField: { source: 'rfc1035', section: '3.2.1 Format, TTL', text: 'a 32 bit signed integer that specifies the time interval that the resource record may be cached before the source of the information should again be consulted.' },
  ttlRange: { source: 'rfc2181', section: '8 Time to Live (TTL)', text: 'It is hereby specified that a TTL value is an unsigned number, with a minimum value of 0, and a maximum value of 2147483647.' },
  csvFieldCount: { source: 'rfc4180', section: '2 Definition of the CSV Format, rule 4', text: 'Each line should contain the same number of fields throughout the file.' },
  csvEnclose: { source: 'rfc4180', section: '2 Definition of the CSV Format, rule 6', text: 'Fields containing line breaks (CRLF), double quotes, and commas should be enclosed in double-quotes.' },
  csvEscape: { source: 'rfc4180', section: '2 Definition of the CSV Format, rule 7', text: 'If double-quotes are used to enclose fields, then a double-quote appearing inside a field must be escaped by preceding it with another double quote.' },
  yamlAlias: { source: 'yaml-1.2.2', section: '6.9.2 Node Anchors', text: 'An alias node can then be used to indicate additional inclusions of the anchored node.' },
  yamlTag: { source: 'yaml-1.2.2', section: '6.9.1 Node Tags', text: 'The tag property identifies the type of the native data structure presented by the node.' }
};

// The page of a quoted sentence.
export const factPage = (key) => source(FACTS[key].source).url;
