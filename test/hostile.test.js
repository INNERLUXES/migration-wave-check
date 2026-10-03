import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PLAN_LIMITS, main, parseCsv, toCsv, toMarkdown, toText, wholeOf } from '../src/index.js';
import { app, check, csvOf, find, json, plan, problems, run, withFiles } from './helpers.js';

// Hostile input: a plan that tries to exhaust the stack, the memory or the time, to make the tool read more than it was
// given, to rewrite the terminal, to break a table or to change how objects behave. Each test also checks the time,
// because a pattern or a walk that grows with the input is a failure even when the answer is right.

const LIMIT = { timeout: 30000 };
const fast = async (fn, ms = 4000) => {
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < ms, `took ${Date.now() - start} ms`);
  return result;
};

test('hostile: JSON nested a hundred thousand levels deep is refused with a message, not a stack overflow', LIMIT, async () => {
  const r = await fast(() => run({ 'a.json': `{"applications": [], "x": ${'['.repeat(100000)}${']'.repeat(100000)}}` }, ['a.json']));
  assert.equal(r.code, 2);
  assert.match(r.err, /nested more than 64 deep/);
});

test('hostile: YAML nested two hundred levels deep is refused', LIMIT, async () => {
  let text = 'applications:\n';
  for (let i = 0; i < 200; i += 1) text += `${'  '.repeat(i + 1)}k${i}:\n`;
  const r = await fast(() => run({ 'a.yaml': text }, ['a.yaml']));
  assert.equal(r.code, 2);
  assert.match(r.err, /nested more than 64 deep/);
});

test('hostile: a file over the default size limit is refused from its size', LIMIT, async () => {
  await withFiles({}, async (dir) => {
    await writeFile(resolve(dir, 'big.csv'), `id,name\na,${'b'.repeat(10 * 1024 * 1024 + 10)}\n`);
    let err = '';
    const code = await fast(() => main(['big.csv'], { out: () => {}, err: (t) => { err += t; } }, undefined, dir));
    assert.equal(code, 2);
    assert.match(err, /over the 10 MB limit/);
  });
});

test('hostile: a CSV quote that is never closed, at the start of a 5 MB file, is refused in one pass', LIMIT, async () => {
  const text = `id,rollback\na,"${'x,'.repeat(2_500_000)}\n`;
  assert.throws(() => parseCsv(text, 'x', { limits: { maxRecords: 10, maxFields: 10, maxFieldLength: 10_000_000 } }), /line 2: a quoted field is not closed/);
  const r = await fast(() => run({ 'a.csv': text }, ['a.csv']));
  assert.equal(r.code, 2);
  assert.match(r.err, /a field longer than 20,000 characters/);
});

test('hostile: more applications than the limit are refused, in CSV and in JSON', LIMIT, async () => {
  const rows = `id\n${Array.from({ length: 20_001 }, (_, i) => `a${i}`).join('\n')}\n`;
  const r = await fast(() => run({ 'a.csv': rows }, ['a.csv']));
  assert.equal(r.code, 2);
  assert.match(r.err, /more than 20,000 records after the header/);
  const many = JSON.stringify({ applications: Array.from({ length: 20_001 }, (_, i) => ({ id: `a${i}` })) });
  const j = await fast(() => run({ 'a.json': many }, ['a.json']));
  assert.equal(j.code, 2);
  assert.match(j.err, /more than 20,000 applications/);
});

test('hostile: more values than the limit, more columns than the limit, and a very long depends_on are refused', LIMIT, async () => {
  const values = JSON.stringify({ applications: [], x: Array.from({ length: 600_000 }, () => 1) });
  assert.match((await fast(() => run({ 'a.json': values }, ['a.json']))).err, /more than 500,000 values/);
  const wide = `${Array.from({ length: 150 }, (_, i) => `c${i}`).join(',')}\n`;
  assert.match((await run({ 'a.csv': `id,${wide}` }, ['a.csv'])).err, /more than 100 fields/);
  const deps = Array.from({ length: 1001 }, (_, i) => `d${i}`);
  assert.throws(() => check(plan([app('a', { depends_on: deps })])), /more than 1,000 entries in depends_on/);
  assert.equal(PLAN_LIMITS.maxDependencies, 200_000);
});

test('hostile: a chain of twenty thousand dependencies and a loop through all of them end without a stack overflow, quickly', LIMIT, async () => {
  const n = 20_000;
  const apps = Array.from({ length: n }, (_, i) => ({ id: `a${i}`, wave: n - i, strategy: 'rehost', owner: 't', depends_on: i + 1 < n ? [`a${i + 1}`] : [], rollback: 'x', test_plan: 'x' }));
  const chain = await fast(() => check(plan(apps)), 8000);
  assert.deepEqual(find(chain, 'dependency-cycle'), []);
  assert.deepEqual(problems(chain), []);
  apps[n - 1].depends_on = ['a0'];
  const loop = await fast(() => check(plan(apps)), 8000);
  assert.equal(find(loop, 'dependency-cycle').length, 1);
  assert.match(find(loop, 'dependency-cycle')[0].message, /and 19,991 more|and 19991 more/);
  assert.ok(find(loop, 'dependency-cycle')[0].message.length < 900);
});

test('hostile: tens of thousands of findings of one kind are listed up to the limit, counted in full, and quickly', LIMIT, async () => {
  const apps = Array.from({ length: 15_000 }, (_, i) => ({ id: `a${i}`, wave: 1, strategy: 'rehost', owner: 't', test_plan: 'x' }));
  const r = await fast(() => check(csvOf(apps)), 8000);
  assert.equal(find(r, 'no-rollback').length, PLAN_LIMITS.maxListedPerFinding);
  assert.equal(r.counts.error, 15_000);
  assert.equal(r.gate.pass, false);
  assert.ok(r.notes.some((n) => /14,800 more findings of no-rollback/.test(n)));
});

test('hostile: YAML anchors, aliases and tags are refused, and an alias bomb is never expanded', LIMIT, async () => {
  const bomb = ['applications: []', 'a: &a [x, x, x, x, x, x, x, x, x]', 'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]', 'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]'].join('\n');
  const r = await fast(() => run({ 'bomb.yaml': bomb }, ['bomb.yaml']));
  assert.equal(r.code, 2);
  assert.match(r.err, /bomb\.yaml: the YAML: line 2/);
  for (const text of ['applications:\n  - id: *alias\n', 'applications:\n  - id: !!binary abc\n', 'applications:\n  - <<: *base\n', '&anchor applications: []\n']) {
    const t = await run({ 'a.yaml': text }, ['a.yaml']);
    assert.equal(t.code, 2, text);
  }
});

test('hostile: a YAML line of a hundred thousand characters, and a million lines, are refused', LIMIT, async () => {
  const long = await fast(() => run({ 'a.yaml': `applications: []\nx: ${'a'.repeat(100000)}\n` }, ['a.yaml']));
  assert.equal(long.code, 2);
  assert.match(long.err, /a line longer than 20000 characters/);
  const lines = await fast(() => run({ 'a.yaml': `applications: []\n${'# x\n'.repeat(250000)}` }, ['a.yaml']));
  assert.equal(lines.code, 2);
  assert.match(lines.err, /more than 200,000 lines/);
});

test('hostile: long near misses for the number patterns take no longer than short ones', LIMIT, async () => {
  await fast(() => {
    assert.equal(wholeOf(`${'1'.repeat(100000)}x`, 0, 10), null);
    const r = check(plan([app('a', { wave: `${'9'.repeat(100000)}.`, dns_ttl_seconds: `${'1'.repeat(100000)}`, cutover_window_minutes: `${'1.'.repeat(50000)}`, stateful: 'y'.repeat(100000), strategy: ` ${' '.repeat(100000)}rehost` })]));
    assert.ok(Array.isArray(r.findings));
    for (const f of r.findings) assert.ok(f.message.length <= 900);
  });
});

test('hostile: an id made of control, direction and line separator characters is cleaned in every format', LIMIT, () => {
  const bad = ['x', String.fromCharCode(27), '[31m', String.fromCharCode(0x202e), 'y', String.fromCharCode(0x2028), 'z', String.fromCharCode(0), String.fromCharCode(0x85)].join('');
  const r = check(plan([app(bad, { owner: '', depends_on: [`${bad}-ghost`] })]));
  assert.ok(r.findings.length >= 2);
  for (const out of [toText(r), toMarkdown(r), toCsv(r), JSON.stringify(r)]) {
    for (const code of [27, 0x202e, 0x2028, 0, 0x85]) assert.ok(!out.includes(String.fromCharCode(code)), `character ${code}`);
  }
});

test('hostile: ids such as __proto__, constructor and toString are only names, in JSON, YAML and CSV', LIMIT, () => {
  const apps = [app('__proto__', { depends_on: ['constructor'] }), app('constructor', { wave: 2 }), app('toString', { depends_on: ['hasOwnProperty'] })];
  for (const r of [check(plan(apps)), check(csvOf(apps))]) {
    assert.deepEqual(find(r, 'dependency-later-wave').map((f) => f.subject), ['__proto__']);
    assert.deepEqual(find(r, 'dependency-unknown').map((f) => f.subject), ['toString']);
  }
  const viaYaml = check(['applications:', '  - id: __proto__', '    wave: 1', '    strategy: rehost', '    owner: t', '    rollback: x', '    test_plan: x', ''].join('\n'), { name: 'a.yaml' });
  assert.deepEqual(problems(viaYaml), []);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.equal(Object.keys({}).length, 0);
});

test('hostile: a file with binary bytes, a null byte or a half character is refused or read as text, never a crash', LIMIT, async () => {
  for (const content of [Buffer.from([0, 1, 2, 3, 255, 254]), Buffer.from('id\na\u0000b\n'), Buffer.from([0x69, 0x64, 0x0a, 0xc3, 0x28, 0x0a])]) {
    const r = await run({ 'a.csv': content }, ['a.csv']);
    assert.ok([0, 1, 2].includes(r.code));
    assert.ok(!r.out.includes(String.fromCharCode(0)));
  }
  assert.equal((await run({ 'a.json': Buffer.from([0, 1, 2, 3, 255, 254]) }, ['a.json'])).code, 2);
});

test('hostile: an argument that is a URL, a very long path, or a path with control characters is refused or reported cleanly', LIMIT, async () => {
  const url = await run({}, ['https://example.test/plan.csv']);
  assert.equal(url.code, 2);
  assert.match(url.err, /never fetches a URL/);
  const long = await run({}, [`${'a'.repeat(5000)}.csv`]);
  assert.equal(long.code, 2);
  assert.ok(long.err.length < 8000);
  const control = await run({}, [`x${String.fromCharCode(27)}[31mfile.csv`]);
  assert.equal(control.code, 2);
  assert.ok(!control.err.includes(String.fromCharCode(27)));
});

test('hostile: a file name with control characters is cleaned in the report, where the system allows such a name', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not allow a control character in a file name');
    return;
  }
  const name = `evil${String.fromCharCode(27)}[31m.csv`;
  let r;
  try {
    r = await run({ [name]: csvOf([app('a')]) }, [name]);
  } catch (error) {
    if (!['EINVAL', 'EILSEQ', 'ENOENT', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    t.skip(`this file system does not allow the name (${error.code})`);
    return;
  }
  assert.equal(r.code, 0);
  assert.ok(!r.out.includes(String.fromCharCode(27)));
});

test('hostile: a device or a pipe in place of the file is refused without being opened', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('there is no device file at this path on Windows');
    return;
  }
  const r = await run({}, ['/dev/null']);
  assert.equal(r.code, 2);
  assert.match(r.err, /not a regular file/);
});

test('hostile: a symbolic link to a folder is refused, and one to a file is followed because the person gave it', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  await withFiles({ 'real.csv': csvOf([app('a')]) }, async (dir) => {
    await mkdir(resolve(dir, 'folder'));
    await symlink(resolve(dir, 'folder'), resolve(dir, 'dirlink'));
    await symlink(resolve(dir, 'real.csv'), resolve(dir, 'filelink.csv'));
    let err = '';
    assert.equal(await main(['dirlink'], { out: () => {}, err: (x) => { err += x; } }, undefined, dir), 2);
    assert.match(err, /a folder, not a file/);
    let out = '';
    assert.equal(await main(['filelink.csv'], { out: (x) => { out += x; }, err: () => {} }, undefined, dir), 0);
    assert.match(out, /filelink\.csv/);
  });
});

test('hostile: a plan with thousands of applications and dependencies is checked in time', LIMIT, async () => {
  const apps = [];
  for (let i = 0; i < 5000; i += 1) apps.push(app(`a${i}`, { wave: 1 + Math.floor(i / 100), depends_on: i >= 100 ? [`a${i - 100}`, `a${i - 99}`] : [] }));
  const r = await fast(() => check(csvOf(apps)), 6000);
  assert.deepEqual(problems(r), []);
  assert.equal(r.plan.applications, 5000);
  assert.equal(r.plan.waves, 50);
  assert.ok(json(r.plan).length > 0);
});
