import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CSV_LIMITS, FILE_LIMITS, JSON_LIMITS, PLAN_LIMITS, YAML_LIMITS, displayPath, escapeToken, fileError, formatOf, isObj, lineOf, parseCsv, parseJson, parsePlan, parseYaml, pointerOf, propOf, readBounded } from '../src/index.js';
import { app, csvOf, json, plan, withFiles } from './helpers.js';

const YAML_PLAN = `# a plan
plan:
  name: Demo
  max_apps_per_wave: 4
waves:
  - wave: 2
    max_apps: 1
applications:
  - id: web
    wave: 2
    strategy: rehost
    depends_on: [api, 'db']
    stateful: no
    rollback: 'Point DNS back: then drain'
  - id: api
    wave: 1
    strategy: Replatform
`;

test('parseCsv: records, quoted fields with commas, doubled quotes and line breaks, CRLF and LF, as RFC 4180 says', () => {
  const r = parseCsv('id,rollback\r\na,"go back, then ""check"""\r\nb,"two\r\nlines"\nc,plain\n');
  assert.deepEqual(r.header, [{ name: 'id', column: 0 }, { name: 'rollback', column: 1 }]);
  assert.deepEqual(r.records.map((x) => x.fields), [['a', 'go back, then "check"'], ['b', 'two\r\nlines'], ['c', 'plain']]);
  assert.deepEqual(r.records.map((x) => [x.row, x.line]), [[2, 2], [3, 3], [4, 5]]);
});

test('parseCsv: the last record may end without a line break, empty records are skipped, and a quoted empty field is kept', () => {
  assert.deepEqual(parseCsv('id\na\nb').records.map((x) => x.fields), [['a'], ['b']]);
  assert.deepEqual(parseCsv('id\n\na\n\n\n').records.map((x) => x.fields), [['a']]);
  assert.deepEqual(parseCsv('id\n""\n').records.map((x) => x.fields), [['']]);
  assert.deepEqual(parseCsv('id,x\n,\n').records.map((x) => x.fields), [['', '']]);
  assert.deepEqual(parseCsv(`${String.fromCharCode(0xfeff)}id\na\n`).header.map((h) => h.name), ['id']);
});

test('parseCsv: header names are read in lower case with spaces and dashes as underscores', () => {
  assert.deepEqual(parseCsv('ID, Depends On ,cutover-window-minutes\n1,2,3\n').header.map((h) => h.name), ['id', 'depends_on', 'cutover_window_minutes']);
});

test('parseCsv: what RFC 4180 does not allow is refused with the line, never guessed', () => {
  assert.throws(() => parseCsv('id\na"b\n'), /line 2: a double quote inside a field that is not quoted/);
  assert.throws(() => parseCsv('id\n"a"b\n'), /line 2: text after the closing quote/);
  assert.throws(() => parseCsv('id\n"a" \n'), /line 2: text after the closing quote/);
  assert.throws(() => parseCsv('id\nok\n"open\nnever closed\n'), /line 3: a quoted field is not closed/);
  assert.throws(() => parseCsv('id,x\na\n'), /line 2: the record has 1 field and the header has 2/);
  assert.throws(() => parseCsv('id,x\na,b,c\n'), /line 2: the record has 3 fields and the header has 2/);
  assert.throws(() => parseCsv('id,id\n'), /appears twice in the header/);
  assert.throws(() => parseCsv('id,,x\n'), /column 2 of the header has no name/);
  assert.throws(() => parseCsv(''), /holds no header/);
});

test('parseCsv: the limits on records, fields and field length hold', () => {
  assert.equal(CSV_LIMITS.maxFields, 100);
  assert.throws(() => parseCsv('id\n1\n2\n3\n', 'x', { limits: { ...CSV_LIMITS, maxRecords: 3 } }), /more than 2 records after the header/);
  assert.throws(() => parseCsv(`${Array.from({ length: 5 }, (_, i) => `c${i}`).join(',')}\n`, 'x', { limits: { ...CSV_LIMITS, maxFields: 4 } }), /more than 4 fields/);
  assert.throws(() => parseCsv(`id\n${'a'.repeat(50)}\n`, 'x', { limits: { ...CSV_LIMITS, maxFieldLength: 10 } }), /a field longer than 10 characters/);
  assert.throws(() => parseCsv(`id\n"${'a'.repeat(50)}"\n`, 'x', { limits: { ...CSV_LIMITS, maxFieldLength: 10 } }), /a field longer than 10 characters/);
});

test('formatOf: the format comes from the name, or from the first characters when the name does not say', () => {
  assert.equal(formatOf('anything', 'a.csv'), 'csv');
  assert.equal(formatOf('anything', 'a.JSON'), 'json');
  assert.equal(formatOf('anything', 'a.yml'), 'yaml');
  assert.equal(formatOf('anything', 'a.yaml'), 'yaml');
  assert.equal(formatOf('  {"applications": []}', 'plan'), 'json');
  assert.equal(formatOf('[]', 'plan.txt'), 'json');
  assert.equal(formatOf('applications:\n  - id: a\n', 'plan'), 'yaml');
  assert.equal(formatOf('# comment\napplications: []\n', 'plan'), 'yaml');
  assert.equal(formatOf('- id: a\n', 'plan'), 'yaml');
  assert.equal(formatOf('id,wave\na,1\n', 'plan'), 'csv');
  assert.equal(formatOf('id\na\n', 'plan.txt'), 'csv');
});

test('parsePlan: a CSV plan gives every field with its row, column and line, and lists missing and unknown columns', () => {
  const p = parsePlan('id,wave,depends_on,extra\nweb,2,"api; db|cache",x\napi,1,,y\n', 'a.csv');
  assert.equal(p.format, 'csv');
  assert.equal(p.apps.length, 2);
  assert.deepEqual(p.apps[0].field('wave'), { present: true, value: '2', where: 'row 2, wave', line: 2 });
  assert.deepEqual(p.apps[1].field('depends_on'), { present: false, value: '', where: 'row 3, depends_on', line: 3 });
  assert.deepEqual(p.apps[0].field('rollback'), { present: false, value: undefined, where: 'row 2, rollback', line: 2 });
  assert.deepEqual(p.apps[0].list('depends_on').map((d) => d.value), ['api', 'db', 'cache']);
  assert.deepEqual(p.apps[0].at, { where: 'row 2', line: 2 });
  assert.ok(p.columns.missing.includes('rollback') && !p.columns.missing.includes('wave'));
  assert.deepEqual(p.columns.unknown, ['extra']);
  assert.throws(() => parsePlan('name,wave\nweb,1\n', 'a.csv'), /the header has no "id" column/);
});

test('parsePlan: a YAML plan and the same plan in JSON give the same fields, with JSON pointers and lines', () => {
  const y = parsePlan(YAML_PLAN, 'a.yaml');
  assert.equal(y.format, 'yaml');
  assert.equal(y.name, 'Demo');
  assert.equal(y.limit.value, 4);
  assert.equal(y.limit.where, '#/plan/max_apps_per_wave');
  assert.equal(y.limit.line, 4);
  assert.equal(y.waveLimits.length, 1);
  assert.equal(y.waveLimits[0].max.value, 1);
  assert.equal(y.waveLimits[0].max.where, '#/waves/0/max_apps');
  assert.deepEqual(y.apps[0].field('wave'), { present: true, value: 2, where: '#/applications/0/wave', line: 10 });
  assert.equal(y.apps[0].field('rollback').value, 'Point DNS back: then drain');
  assert.deepEqual(y.apps[0].list('depends_on').map((d) => [d.value, d.where, d.line]), [['api', '#/applications/0/depends_on/0', 12], ['db', '#/applications/0/depends_on/1', 12]]);
  assert.deepEqual(y.apps[1].field('owner'), { present: false, value: undefined, where: '#/applications/1/owner', line: 15 });
  const fromJson = parsePlan(JSON.stringify({ plan: { name: 'Demo', max_apps_per_wave: 4 }, waves: [{ wave: 2, max_apps: 1 }], applications: [{ id: 'web', wave: 2, strategy: 'rehost', depends_on: ['api', 'db'], stateful: 'no', rollback: 'Point DNS back: then drain' }, { id: 'api', wave: 1, strategy: 'Replatform' }] }), 'a.json');
  for (const name of ['id', 'wave', 'strategy', 'stateful', 'rollback']) assert.deepEqual(fromJson.apps[0].field(name).value, y.apps[0].field(name).value, name);
});

test('parsePlan: a JSON plan can be a list of applications; a depends_on can be one text', () => {
  const p = parsePlan(json([app('a', { depends_on: 'b; c' }), app('b')]), 'a.json');
  assert.equal(p.apps.length, 2);
  assert.equal(p.apps[0].field('wave').where, '#/0/wave');
  assert.deepEqual(p.apps[0].list('depends_on').map((d) => d.value), ['b', 'c']);
  assert.equal(p.limit, null);
});

test('parsePlan: an entry that is not an object is listed as a problem, and the rest is read', () => {
  const p = parsePlan(json(plan([app('a'), 'just text', app('b')])), 'a.json');
  assert.equal(p.apps.length, 2);
  assert.equal(p.problems.length, 1);
  assert.equal(p.problems[0].where, '#/applications/1');
});

test('parsePlan: things that are not a plan are refused with a reason', () => {
  assert.throws(() => parsePlan('{"apps": []}', 'a.json'), /neither a list of applications nor an object with "applications"/);
  assert.throws(() => parsePlan('{"applications": {}}', 'a.json'), /"applications" is not a list/);
  assert.throws(() => parsePlan('{"applications": [], "plan": []}', 'a.json'), /"plan" is not an object/);
  assert.throws(() => parsePlan('{"applications": [], "waves": {}}', 'a.json'), /"waves" is not a list/);
  assert.throws(() => parsePlan('"text"', 'a.json'), /not a migration plan/);
  assert.throws(() => parsePlan(json(plan([app('a'), app('b')])), 'a.json', { ...PLAN_LIMITS, maxApplications: 1 }), /more than 1 applications/);
});

test('parsePlan: YAML outside the documented subset is refused with the line, never guessed', () => {
  const head = 'applications:\n  - id: a\n';
  assert.throws(() => parsePlan(`${head}    rollback: |\n      text\n`, 'a.yaml'), /line 3: .*block scalars/);
  assert.throws(() => parsePlan(`${head}    owner: &o team\n`, 'a.yaml'), /line 3/);
  assert.throws(() => parsePlan(`${head}    owner: *o\n`, 'a.yaml'), /line 3/);
  assert.throws(() => parsePlan(`${head}    wave: !!int 1\n`, 'a.yaml'), /line 3/);
  assert.throws(() => parsePlan(`${head}\twave: 1\n`, 'a.yaml'), /tab/);
  assert.throws(() => parsePlan(`${head}---\napplications: []\n`, 'a.yaml'), /more than one document/);
  assert.throws(() => parsePlan(`${head}    wave: {a: 1}\n`, 'a.yaml'), /flow mapping/);
  assert.throws(() => parsePlan(`${head}    wave: 1\n    wave: 2\n`, 'a.yaml'), /appears twice/);
});

test('parsePlan: JSON that is not strict JSON, and a key given twice, are refused', () => {
  assert.throws(() => parsePlan('{"applications": [],}', 'a.json'), /line 1/);
  assert.throws(() => parsePlan("{'applications': []}", 'a.json'), /key in quotes/);
  assert.throws(() => parsePlan('{"applications": [], "applications": []}', 'a.json'), /appears twice/);
  assert.throws(() => parsePlan('{"applications": []} x', 'a.json'), /text after the end/);
});

test('parsePlan: a key such as __proto__ is only a name and changes nothing', () => {
  const p = parsePlan('{"__proto__": {"polluted": true}, "applications": [{"id": "a", "__proto__": {"x": 1}}]}', 'a.json');
  assert.equal(p.apps[0].field('__proto__').present, true);
  assert.equal(p.apps[0].field('constructor').present, false);
  assert.equal(p.apps[0].field('toString').present, false);
  assert.equal({}.polluted, undefined);
  const c = parsePlan('id,__proto__\na,b\n', 'a.csv');
  assert.equal(c.apps[0].field('__proto__').value, 'b');
  assert.equal(c.apps[0].field('constructor').present, false);
});

test('parseJson and parseYaml: nodes keep the line of every value, and the limits are the documented ones', () => {
  const node = parseJson('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}', 'x');
  assert.equal(propOf(node, 'b').line, 3);
  assert.equal(node.props[1].value.items[0].line, 4);
  const y = parseYaml('a: 1\nb:\n  - 2\n', 'x');
  assert.equal(y.props[1].line, 2);
  assert.equal(y.props[1].value.items[0].line, 3);
  assert.equal(JSON_LIMITS.maxDepth, 64);
  assert.equal(YAML_LIMITS.maxDepth, 64);
});

test('parseYaml: the forms that plan files use are read', () => {
  const y = parseYaml(`# comment
a: 'it''s'   # trailing comment
b: "tab\\there"
c: [one, "two, three", 'four']
d:
- x: 1
  y: 2
- z
e: {}
f: ~
g: 10
h: 1.5
i: yes
j: 1.2.3
`, 'x');
  const get = (k) => y.props.find((p) => p.key === k).value;
  assert.equal(get('a').value, "it's");
  assert.equal(get('b').value, 'tab\there');
  assert.deepEqual(get('c').items.map((i) => i.value), ['one', 'two, three', 'four']);
  assert.equal(get('d').items[0].props.length, 2);
  assert.equal(get('d').items[1].value, 'z');
  assert.equal(get('e').t, 'object');
  assert.equal(get('f').t, 'null');
  assert.equal(get('g').value, 10);
  assert.equal(get('h').value, 1.5);
  assert.equal(get('i').value, 'yes');
  assert.equal(get('j').value, '1.2.3');
});

test('pointers: tokens are escaped with ~0 and ~1, and a pointer that does not exist gets the line of its nearest ancestor', () => {
  assert.equal(escapeToken('/a~b'), '~1a~0b');
  assert.equal(pointerOf([]), '#');
  assert.equal(pointerOf(['applications', '0', 'a/b']), '#/applications/0/a~1b');
  const lines = new Map([['#', 1], ['#/applications', 2], ['#/applications/0', 3]]);
  assert.equal(lineOf(lines, '#/applications/0/rollback'), 3);
  assert.equal(lineOf(lines, '#/nothing/at/all'), 1);
  assert.equal(isObj({}), true);
  assert.equal(isObj([]), false);
  assert.equal(isObj(null), false);
});

test('readBounded: reads a regular file whole; a missing file, a folder and a file over the limit are refused with the reason', async () => {
  await withFiles({ 'a.csv': 'id\na\n', 'sub/b.csv': 'id\n', 'big.csv': 'x'.repeat(50) }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a.csv'))).toString(), 'id\na\n');
    await assert.rejects(readBounded(resolve(dir, 'none.csv')), (e) => e.reason === 'no such file');
    await assert.rejects(readBounded(resolve(dir, 'sub')), (e) => e.reason === 'a folder, not a file');
    await assert.rejects(readBounded(resolve(dir, 'big.csv'), 10), (e) => /50 bytes is over the 10 byte limit/.test(e.reason));
    assert.equal(FILE_LIMITS.maxFileBytes, 10 * 1024 * 1024);
    assert.ok(fileError('p', 'why').message === 'p: why');
  });
});

test('readBounded: a symbolic link given as the path is followed, because the person who runs the tool gave it', async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  await withFiles({ 'real.csv': 'id\na\n' }, async (dir) => {
    await mkdir(resolve(dir, 'sub'));
    await symlink(resolve(dir, 'real.csv'), resolve(dir, 'sub/link.csv'));
    assert.equal((await readBounded(resolve(dir, 'sub/link.csv'))).toString(), 'id\na\n');
  });
});

test('displayPath: relative to the base with forward slashes; outside the base it is absolute', async () => {
  await withFiles({ 'a/b.csv': 'id\n' }, async (dir) => {
    assert.equal(displayPath(resolve(dir, 'a/b.csv'), dir), 'a/b.csv');
    assert.equal(displayPath(dir, dir), '.');
    assert.ok(!displayPath(resolve(dir, 'a/b.csv'), resolve(dir, 'a')).includes('\\'));
    assert.ok(!displayPath(resolve(dir, '..', 'elsewhere', 'x.csv'), dir).includes('\\'));
  });
});

test('csvOf in the helpers writes a plan that the reader reads back', () => {
  const p = parsePlan(csvOf([app('a', { rollback: 'say "x", then y', depends_on: ['b', 'c'] }), app('b'), app('c')]), 'a.csv');
  assert.equal(p.apps.length, 3);
  assert.equal(p.apps[0].field('rollback').value, 'say "x", then y');
  assert.deepEqual(p.apps[0].list('depends_on').map((d) => d.value), ['b', 'c']);
  assert.deepEqual(p.columns, { missing: [], unknown: [] });
});
