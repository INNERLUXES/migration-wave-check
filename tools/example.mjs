// Runs the README examples, checks that they report what the README shows, and writes the reports of the first example
// to examples/output. CI runs it and then fails if those files changed, so the example output in the repository is
// always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Runs the tool on files of the repository; the path shown in the report is relative to the root of the repository.
async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) }, undefined, root);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

const brokenArgs = ['examples/orders-estate.csv', '--fail-on', 'warning', '--max-apps-per-wave', '3'];
const broken = await run(brokenArgs);
process.stdout.write(broken.out);
expect('orders estate', broken, 1, [
  'plan: csv, 11 applications (7 move, 1 retained, 1 retired) in 3 waves, limit 3 applications per wave',
  'findings: 7 error, 5 warning, 4 info',
  'ERROR    strategy-unknown  row 10, strategy',
  'ERROR    dependency-unknown  row 9, depends_on',
  'ERROR    dependency-cycle  row 11, depends_on',
  'ERROR    dependency-later-wave  row 3, depends_on',
  'ERROR    retire-with-dependents  row 6, depends_on',
  'ERROR    no-rollback  row 5, rollback',
  'ERROR    stateful-no-data-sync  row 4, data_sync',
  'WARNING  strategy-missing  row 12, strategy',
  'WARNING  no-owner  row 5, owner',
  'WARNING  no-test-plan  row 6, test_plan',
  'WARNING  dns-ttl-longer-than-window  row 2, dns_ttl_seconds',
  'WARNING  wave-over-limit  wave 2',
  'INFO     dependency-cross-environment  row 5, depends_on',
  'GATE: FAIL - 7 errors, 5 warnings'
], ['GATE: PASS']);

process.stdout.write('\n');
const fixed = await run(['examples/orders-estate-fixed.csv', '--fail-on', 'warning', '--max-apps-per-wave', '3']);
process.stdout.write(fixed.out);
expect('fixed orders estate with --fail-on warning', fixed, 0, ['findings: 0 error, 0 warning, 5 info', 'GATE: PASS (--fail-on warning)'], ['ERROR', 'WARNING ']);

const yaml = await run(['examples/orders-estate.yaml']);
expect('YAML plan', yaml, 1, [
  'plan: yaml, "Orders estate", 5 applications (4 move, 1 retained, 0 retired) in 2 waves, limit 3 applications per wave',
  'ERROR    value-invalid  #/applications/2/stateful',
  'ERROR    dependency-cycle  #/applications/1/depends_on',
  'WARNING  dns-ttl-longer-than-window  #/applications/3/dns_ttl_seconds',
  'WARNING  wave-over-limit  #/waves/0/max_apps',
  'GATE: FAIL - 2 errors'
], ['GATE: PASS']);

// The README shows the first two runs as they are printed.
const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
if (!readme.includes(broken.out)) problems.push('README: the sample output of the broken plan differs from a real run');
if (!readme.includes(fixed.out)) problems.push('README: the sample output of the fixed plan differs from a real run');

// The same plan in the other formats, kept as examples of what each one looks like.
await mkdir(resolve(root, 'examples/output'), { recursive: true });
await writeFile(resolve(root, 'examples/output/orders-estate.txt'), broken.out);
for (const [format, name] of [['markdown', 'orders-estate.md'], ['json', 'orders-estate.json'], ['csv', 'orders-estate.csv']]) {
  const r = await run([...brokenArgs, '--format', format]);
  if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output', name), r.out);
}
await writeFile(resolve(root, 'examples/output/orders-estate-yaml.txt'), yaml.out);

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
