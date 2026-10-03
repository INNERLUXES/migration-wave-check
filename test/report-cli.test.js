import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINDINGS, USAGE, VERSION, checkFile, csvCell, main, mdCell, parseArgs, toCsv, toJson, toMarkdown, toText } from '../src/index.js';
import { app, check, cli, csvOf, json, plan, run } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');

// Runs the tool on files of the repository, with the root of the repository as the base for relative paths.
async function inRoot(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, root);
  return { code, out, err };
}

const broken = () => plan([app('api', { wave: 1, depends_on: ['db'] }), app('db', { wave: 2, rollback: '' })]);

test('text report: the plan line, the areas, the counts, each finding with its quotation and fix, the notes and the gate', () => {
  const out = toText(check(broken(), { path: 'plan.json' }));
  const lines = out.split('\n');
  assert.equal(lines[0], 'migration-wave-check: plan.json');
  assert.equal(lines[1], 'plan: json, 2 applications (2 move, 0 retained, 0 retired) in 2 waves, no wave limit');
  assert.equal(lines[2], 'areas:');
  assert.match(out, /^ {2}Dependencies {8}fail {3}dependency-later-wave x1$/m);
  assert.match(out, /^findings: 2 error, 0 warning, 2 info$/m);
  assert.match(out, /^ {2}ERROR {4}dependency-later-wave {2}#\/applications\/0\/depends_on\/0 {2}line \d+$/m);
  assert.match(out, /^ {11}basis: "Dependencies between workloads cause service disruptions if not migrated together\." \(Group dependent systems within the same wave, https:\/\/learn\.microsoft\.com\//m);
  assert.match(out, /^ {11}fix: Move "db" in wave 1 or earlier/m);
  assert.match(out, /^note: No wave limit was given/m);
  assert.match(out, /^GATE: FAIL - 2 errors$/m);
  assert.ok(out.endsWith('\n'));
});

test('text report: a plan with no application says so, and a note is printed on its own line before the gate', () => {
  const empty = toText(check(plan([])));
  assert.match(empty, /^no findings$/m);
  assert.match(empty, /plan: json, 0 applications \(0 move, 0 retained, 0 retired\) in 0 waves, no wave limit/);
  assert.match(empty, /\nnote: The plan holds no application, so there was nothing to check\n\nGATE: PASS \(--fail-on error\)\n$/);
});

test('markdown report: a table per area, escaped cells, the notes as a list and the gate in bold', () => {
  const out = toMarkdown(check(broken(), { path: 'plan.json' }));
  assert.match(out, /^## migration-wave-check: 2 error, 0 warning, 2 info$/m);
  assert.match(out, /^\| Area \| Result \| Detail \|$/m);
  assert.match(out, /^### Dependencies$/m);
  assert.match(out, /^\| Severity \| Check \| Where \| Message \| Basis \| Fix \|$/m);
  assert.match(out, /\*\*Gate failed:\*\* 2 errors\./);
  assert.match(out, /^- No wave limit was given/m);
  assert.match(toMarkdown(check(plan([app('a')]), { maxAppsPerWave: 3 })), /\*\*Gate passed\*\* \(--fail-on error\)\./);
});

test('markdown report: a pipe, a line break, an angle bracket, a link or a backtick in an id cannot break the table or make markup', () => {
  const evil = 'a|b\nc<script>[click](https://evil.example.test)`x`';
  const r = check(plan([app(evil, { owner: '' })]));
  const out = toMarkdown(r);
  assert.ok(!out.includes('<script>'));
  assert.ok(!out.includes('[click]('));
  assert.ok(out.includes('a\\|b c&lt;script&gt;\\[click\\]'));
  for (const row of out.split('\n').filter((l) => l.startsWith('| warning |'))) assert.equal(row.replace(/\\\|/g, '').split('|').length, 8, row.slice(0, 80));
  assert.equal(mdCell('x\r\ny'), 'x y');
  assert.equal(mdCell('\\'), '\\\\');
});

test('json report: the whole report, with the plan, the areas, every finding with its basis, the notes and the gate', () => {
  const r = JSON.parse(toJson(check(broken(), { path: 'plan.json', version: '9.9.9' })));
  assert.deepEqual(Object.keys(r), ['tool', 'version', 'plan', 'areas', 'findings', 'notes', 'counts', 'gate']);
  assert.equal(r.tool, 'migration-wave-check');
  assert.equal(r.version, '9.9.9');
  assert.deepEqual(r.plan, { path: 'plan.json', format: 'json', name: '', applications: 2, moving: 2, retained: 0, retired: 0, waves: 2, maxAppsPerWave: null });
  assert.deepEqual(r.areas.map((a) => a.id), ['inventory', 'dependencies', 'cutover', 'waves']);
  assert.deepEqual(Object.keys(r.findings[0]), ['id', 'severity', 'area', 'where', 'line', 'subject', 'message', 'fix', 'basis', 'source']);
  assert.deepEqual(Object.keys(r.findings[0].basis[0]), ['text', 'section', 'source']);
  assert.deepEqual(r.gate, { failOn: 'error', pass: false, reason: '2 errors' });
});

test('csv report: RFC 4180, one row per finding, CRLF line ends, quotes doubled, and a leading quote on a cell a spreadsheet would run', () => {
  const r = check(plan([app('=HYPERLINK("x","y")', { owner: '' })]));
  const out = toCsv(r);
  const lines = out.split('\r\n');
  assert.equal(lines[0], 'severity,area,id,where,line,subject,message,basis,source,fix');
  assert.equal(lines.at(-1), '');
  assert.ok(lines[1].startsWith('warning,inventory,no-owner,'));
  assert.ok(out.includes('"\'=HYPERLINK(""x"",""y"")"'));
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-1'), "'-1");
  assert.equal(csvCell('@a'), "'@a");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('plain'), 'plain');
});

test('notes: a CSV plan names its missing and unknown columns', () => {
  const r = check('id,wave,strategy,color\na,1,rehost,blue\n');
  assert.ok(r.notes.some((n) => n.startsWith('The columns owner, depends_on, stateful, data_sync, rollback, test_plan, dns_ttl_seconds, cutover_window_minutes are not in the file')));
  assert.ok(r.notes.includes('A column was not read: color'));
  assert.ok(!r.notes.some((n) => /\bname\b,/.test(n)), 'name is never needed');
});

test('the usage text lists every check, the options and the exit codes', () => {
  for (const f of FINDINGS) assert.ok(USAGE.includes(f.id), f.id);
  assert.match(USAGE, /Exit codes: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error\./);
  assert.match(USAGE, /--format <name>/);
  assert.match(USAGE, /--max-apps-per-wave <n>/);
  assert.match(USAGE, /info never fails the run/);
});

test('exit code 0: a plan with no finding at the level, and --help and --version', async () => {
  assert.equal((await run({ 'a.json': plan([app('a')]) }, ['a.json'])).code, 0);
  assert.equal((await run({ 'a.csv': csvOf([app('a')]) }, ['a.csv', '--fail-on', 'warning'])).code, 0);
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  const version = await cli(['--version']);
  assert.equal(version.code, 0);
  assert.equal(version.out, `${VERSION}\n`);
  assert.equal(VERSION, JSON.parse(await read('package.json')).version);
});

test('exit code 1: an error fails the default gate, a warning fails only --fail-on warning, and info never fails', async () => {
  const error = await run({ 'a.json': broken() }, ['a.json']);
  assert.equal(error.code, 1);
  assert.match(error.out, /GATE: FAIL - 2 errors/);
  const warning = csvOf([app('a', { owner: '' })]);
  assert.equal((await run({ 'a.csv': warning }, ['a.csv'])).code, 0);
  assert.equal((await run({ 'a.csv': warning }, ['a.csv', '--fail-on', 'warning'])).code, 1);
  const info = plan([app('a', { depends_on: ['b'] }), app('b', { strategy: 'retain', wave: null })]);
  const infoRun = await run({ 'a.json': info }, ['a.json', '--fail-on', 'warning']);
  assert.equal(infoRun.code, 0);
  assert.match(infoRun.out, /dependency-cross-environment/);
});

test('exit code 1: --max-apps-per-wave turns a wave over the limit into a warning', async () => {
  const doc = csvOf([app('a'), app('b')]);
  assert.equal((await run({ 'a.csv': doc }, ['a.csv', '--fail-on', 'warning', '--max-apps-per-wave', '2'])).code, 0);
  const over = await run({ 'a.csv': doc }, ['a.csv', '--fail-on', 'warning', '--max-apps-per-wave', '1']);
  assert.equal(over.code, 1);
  assert.match(over.out, /WARNING {2}wave-over-limit {2}wave 1/);
});

test('exit code 2: a usage error prints the reason and the usage to the error stream, and nothing to the output', async () => {
  for (const [args, message] of [
    [[], /give the path of the plan file/],
    [['a.csv', '--nope'], /unknown argument --nope/],
    [['a.csv', '--format'], /--format needs a value/],
    [['a.csv', '--format', 'xml'], /unknown format xml/],
    [['a.csv', '--fail-on', 'info'], /--fail-on takes error or warning, not info/],
    [['a.csv', '--max-apps-per-wave', '0'], /--max-apps-per-wave takes a whole number from 1 to 100000, not 0/],
    [['a.csv', '--max-apps-per-wave', 'many'], /--max-apps-per-wave takes a whole number/],
    [['a.csv', '--max-apps-per-wave', '200000'], /--max-apps-per-wave takes a whole number/],
    [['a.csv', 'b.csv'], /give one file, not b.csv as well/],
    [['https://example.test/plan.csv'], /never fetches a URL/],
    [['-'], /standard input is not supported/]
  ]) {
    const r = await run({ 'a.csv': csvOf([app('a')]) }, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.out, '');
    assert.match(r.err, message);
    assert.match(r.err, /Usage: migration-wave-check/);
  }
});

test('exit code 2: an input that cannot be read is reported with its name and the reason, never as a pass', async () => {
  const cases = [
    [{}, ['missing.csv'], /missing\.csv: no such file/],
    [{ 'sub/a.csv': 'id\n' }, ['sub'], /sub: a folder, not a file/],
    [{ 'a.json': '{"applications": [],}' }, ['a.json'], /a\.json: the JSON: line 1/],
    [{ 'a.csv': 'id,wave\na\n' }, ['a.csv'], /a\.csv: the CSV: line 2: the record has 1 field and the header has 2/],
    [{ 'a.csv': 'id\n"open\n' }, ['a.csv'], /a\.csv: the CSV: line 2: a quoted field is not closed/],
    [{ 'a.csv': 'name,wave\nx,1\n' }, ['a.csv'], /the header has no "id" column/],
    [{ 'a.yaml': 'applications:\n  - id: &a x\n' }, ['a.yaml'], /a\.yaml: the YAML: line 2/],
    [{ 'a.json': '{"apps": []}' }, ['a.json'], /not a migration plan/]
  ];
  for (const [files, args, message] of cases) {
    const r = await run(files, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.out, '');
    assert.match(r.err, message);
  }
});

test('exit code 2: a file over the size limit is refused before it is read', async () => {
  const r = await run({ 'a.csv': csvOf([app('a')]) }, ['a.csv'], { maxFileBytes: 20 });
  assert.equal(r.code, 2);
  assert.match(r.err, /a\.csv: [\d,]+ bytes is over the 20 byte limit/);
});

test('checkFile: the report of a file names its path relative to the base', async () => {
  const r = await checkFile('examples/orders-estate-fixed.csv', { base: root, maxAppsPerWave: 3, failOn: 'warning' });
  assert.equal(r.plan.path, 'examples/orders-estate-fixed.csv');
  assert.equal(r.gate.pass, true);
});

test('paths in the report are relative to the base with forward slashes, for a file in a folder', async () => {
  const r = await run({ 'plans/estate/a.csv': csvOf([app('a')]) }, ['plans/estate/a.csv']);
  assert.match(r.out, /^migration-wave-check: plans\/estate\/a\.csv$/m);
  const err = await run({}, ['plans/none.csv']);
  assert.match(err.err, /plans\/none\.csv: no such file/);
});

test('paths on Windows: a backslash separates the folders, and the report still shows forward slashes', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('a backslash is an ordinary character in a file name on this system');
    return;
  }
  const r = await run({ 'plans/a.csv': csvOf([app('a')]) }, ['plans\\a.csv']);
  assert.equal(r.code, 0);
  assert.match(r.out, /^migration-wave-check: plans\/a\.csv$/m);
});

test('paths on Linux and macOS: a backslash is part of the file name, which is read under that name', async (t) => {
  if (process.platform === 'win32') {
    t.skip('a backslash separates folders on Windows');
    return;
  }
  const r = await run({ 'we\\ird.csv': csvOf([app('a')]) }, ['we\\ird.csv']);
  assert.equal(r.code, 0);
  assert.match(r.out, /we\\ird\.csv/);
});

test('the example files: the broken one fails with the findings the README names, the fixed one passes at the strictest level', async () => {
  const brokenRun = await inRoot(['examples/orders-estate.csv', '--fail-on', 'warning', '--max-apps-per-wave', '3']);
  assert.equal(brokenRun.code, 1);
  for (const f of FINDINGS.filter((x) => !['duplicate-id', 'value-invalid', 'wave-missing'].includes(x.id))) assert.ok(brokenRun.out.includes(`  ${f.id}  `), f.id);
  const fixed = await inRoot(['examples/orders-estate-fixed.csv', '--fail-on', 'warning', '--max-apps-per-wave', '3']);
  assert.equal(fixed.code, 0);
  assert.match(fixed.out, /findings: 0 error, 0 warning, 5 info/);
  const yaml = await inRoot(['examples/orders-estate.yaml']);
  assert.equal(yaml.code, 1);
  assert.match(yaml.out, /plan: yaml, "Orders estate"/);
});

test('the example output files are the real output, in every format', async () => {
  const args = ['examples/orders-estate.csv', '--fail-on', 'warning', '--max-apps-per-wave', '3'];
  assert.equal((await inRoot(args)).out, await read('examples/output/orders-estate.txt'));
  assert.equal((await inRoot([...args, '--format', 'markdown'])).out, await read('examples/output/orders-estate.md'));
  assert.equal((await inRoot([...args, '--format', 'json'])).out, await read('examples/output/orders-estate.json'));
  const csv = (await inRoot([...args, '--format', 'csv'])).out;
  assert.equal(csv, await read('examples/output/orders-estate.csv'));
  assert.ok(csv.includes('\r\n'));
  assert.equal((await inRoot(['examples/orders-estate.yaml'])).out, await read('examples/output/orders-estate-yaml.txt'));
});

test('parseArgs: the defaults, and options in any order', () => {
  assert.deepEqual(parseArgs(['a.csv']), { file: 'a.csv', format: 'text', failOn: 'error', maxAppsPerWave: undefined, help: false, version: false });
  assert.deepEqual(parseArgs(['--fail-on', 'warning', '--format', 'csv', '--max-apps-per-wave', '12', 'a.csv']), { file: 'a.csv', format: 'csv', failOn: 'warning', maxAppsPerWave: 12, help: false, version: false });
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['-v']).version, true);
});

test('a plan name with control characters is cleaned in every format', () => {
  const name = `Orders${String.fromCharCode(27)}[2J${String.fromCharCode(10)}forged line`;
  const r = check(plan([app('a')], { plan: { name } }));
  for (const render of [toText, toMarkdown, toJson]) assert.ok(!render(r).includes(String.fromCharCode(27)), render.name);
  assert.ok(r.plan.name.startsWith('Orders [2J forged'));
});

test('the same plan as CSV, JSON and YAML gives the same findings, apart from the places', async () => {
  const apps = [app('api', { wave: 1, depends_on: ['db'] }), app('db', { wave: 2, stateful: true, data_sync: 'none', owner: '' })];
  const yaml = ['applications:', ...apps.flatMap((a) => [`  - id: ${a.id}`, `    wave: ${a.wave}`, `    strategy: ${a.strategy}`, `    owner: '${a.owner}'`, `    depends_on: [${a.depends_on.join(', ')}]`, `    stateful: ${a.stateful}`, `    data_sync: ${a.data_sync}`, `    rollback: ${a.rollback}`, `    test_plan: ${a.test_plan}`, `    dns_ttl_seconds: ${a.dns_ttl_seconds}`, `    cutover_window_minutes: ${a.cutover_window_minutes}`]), ''].join('\n');
  const reports = [check(plan(apps)), check(csvOf(apps)), check(yaml, { name: 'plan.yaml' })];
  const shape = (r) => r.findings.map((f) => [f.id, f.subject, f.message]);
  assert.deepEqual(shape(reports[1]), shape(reports[0]));
  assert.deepEqual(shape(reports[2]), shape(reports[0]));
  assert.deepEqual(reports.map((r) => r.plan.format), ['json', 'csv', 'yaml']);
  assert.ok(json(reports[0]).length > 0);
});
