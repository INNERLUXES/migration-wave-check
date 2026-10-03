import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTS, FINDINGS, MAX_TTL, numberOf, strategyOf, textOf, wholeOf, yesNoOf } from '../src/index.js';
import { app, check, csvOf, find, ids, plan, problems, wheres } from './helpers.js';

// Each check has a plan small enough to work out by hand, the same plan as CSV where the check reads a field, and a
// near miss that must not match.

const both = (apps, extra = {}, options = {}) => [check(plan(apps, extra), options), check(csvOf(apps), options)];

test('a clean plan has no finding but the wave summary, as JSON and as CSV, and the gate passes at every level', () => {
  for (const r of both([app('db', { stateful: true, data_sync: 'replication' }), app('api', { wave: 2, depends_on: ['db'] })], {}, { failOn: 'warning' })) {
    assert.deepEqual(problems(r), []);
    assert.deepEqual(ids(r), ['wave-summary', 'wave-summary']);
    assert.equal(r.gate.pass, true);
    assert.deepEqual(r.counts, { error: 0, warning: 0, info: 2 });
  }
});

// ---- inventory -----------------------------------------------------------------------------------------------------

test('duplicate-id: the second and later uses of an id are errors, and the first one is the one dependencies use', () => {
  for (const r of both([app('a'), app('b', { depends_on: ['a'] }), app('a', { wave: 3 })])) {
    assert.equal(find(r, 'duplicate-id').length, 1);
    assert.equal(find(r, 'duplicate-id')[0].subject, 'a');
    assert.match(find(r, 'duplicate-id')[0].message, /line \d+\) has it already/);
    assert.deepEqual(find(r, 'dependency-later-wave'), []);
  }
  assert.deepEqual(wheres(check(plan([app('a'), app('a')])), 'duplicate-id'), ['#/applications/1/id']);
  assert.deepEqual(wheres(check(csvOf([app('a'), app('a')])), 'duplicate-id'), ['row 3, id']);
  assert.deepEqual(find(check(plan([app('a'), app('A')])), 'duplicate-id'), [], 'ids are compared as written');
});

test('value-invalid: an application with no id, and an id that is not a text or a whole number', () => {
  const r = check(plan([app('a'), { ...app('x'), id: undefined }, { ...app('y'), id: ['list'] }, { ...app('z'), id: 7 }]));
  assert.deepEqual(wheres(r, 'value-invalid'), ['#/applications/1/id', '#/applications/2/id']);
  assert.match(find(r, 'value-invalid')[0].message, /has no id/);
  const c = check(csvOf([app('a'), app('')]));
  assert.deepEqual(wheres(c, 'value-invalid'), ['row 3, id']);
});

test('value-invalid: a wave, a stateful value, a TTL, a window or a text that cannot be read', () => {
  const bad = { wave: 'two', stateful: 'maybe', dns_ttl_seconds: -1, cutover_window_minutes: 'an hour', rollback: 12 };
  const r = check(plan([app('a', bad)]));
  assert.deepEqual(wheres(r, 'value-invalid').sort(), ['#/applications/0/cutover_window_minutes', '#/applications/0/dns_ttl_seconds', '#/applications/0/rollback', '#/applications/0/stateful', '#/applications/0/wave']);
  const ttl = find(r, 'value-invalid').find((f) => f.where.endsWith('dns_ttl_seconds'));
  assert.equal(ttl.basis[0].text, FACTS.ttlRange.text);
  assert.deepEqual(find(r, 'no-rollback'), [], 'a value that cannot be read is not also reported as missing');
  const c = check(csvOf([app('a', { ...bad, rollback: 'x' })]));
  assert.deepEqual(wheres(c, 'value-invalid').sort(), ['row 2, cutover_window_minutes', 'row 2, dns_ttl_seconds', 'row 2, stateful', 'row 2, wave']);
  assert.equal(problems(check(plan([app('a', { dns_ttl_seconds: MAX_TTL, cutover_window_minutes: 1e6 })]))).length, 1, 'the largest TTL is read, and only the TTL warning remains');
  assert.deepEqual(wheres(check(plan([app('a', { dns_ttl_seconds: MAX_TTL + 1 })])), 'value-invalid'), ['#/applications/0/dns_ttl_seconds']);
});

test('value-invalid: a depends_on entry that is not an id, and a limit that is not a whole number', () => {
  const r = check(plan([app('a', { depends_on: ['b', { x: 1 }] }), app('b')], { plan: { max_apps_per_wave: 0 }, waves: [{ wave: 'one', max_apps: 1 }, { wave: 1, max_apps: 2.5 }, 'text'] }));
  assert.deepEqual(wheres(r, 'value-invalid').sort(), ['#/applications/0/depends_on/1', '#/plan/max_apps_per_wave', '#/waves/0/wave', '#/waves/1/max_apps', '#/waves/2']);
  const twice = check(plan([app('a')], { waves: [{ wave: 1, max_apps: 2 }, { wave: 1, max_apps: 3 }] }));
  assert.deepEqual(wheres(twice, 'value-invalid'), ['#/waves/1/wave']);
});

test('strategy-unknown and strategy-missing: the seven names in any case and re-architect are read; anything else is not guessed', () => {
  for (const s of ['Rehost', ' REPLATFORM ', 'relocate', 'repurchase', 'refactor', 're-architect']) assert.deepEqual(problems(check(plan([app('a', { strategy: s })]))), [], s);
  for (const s of ['retain', 'retire']) assert.deepEqual(problems(check(plan([app('a', { strategy: s, wave: null })]))), [], s);
  for (const r of both([app('a', { strategy: 'lift and shift' })])) {
    assert.deepEqual(problems(r), ['strategy-unknown']);
    assert.match(find(r, 'strategy-unknown')[0].message, /"lift and shift"/);
  }
  for (const r of both([app('a', { strategy: '' })])) assert.deepEqual(problems(r), ['strategy-missing']);
  assert.deepEqual(problems(check(plan([app('a', { strategy: undefined })]))), ['strategy-missing']);
  assert.deepEqual(problems(check(plan([app('a', { strategy: 3 })]))), ['value-invalid']);
});

test('strategy-unknown and strategy-missing: an application with no known strategy gets no cutover or wave finding', () => {
  const r = check(plan([app('a', { strategy: 'move it', rollback: '', wave: null })]));
  assert.deepEqual(problems(r), ['strategy-unknown']);
  assert.deepEqual(find(r, 'wave-summary'), []);
});

test('wave-missing: an application that moves has no wave; a retained or retired one does not need one', () => {
  for (const r of both([app('a', { wave: null })])) {
    assert.deepEqual(problems(r), ['wave-missing']);
    assert.match(find(r, 'wave-missing')[0].message, /moves \(rehost\) and has no wave/);
  }
  assert.deepEqual(problems(check(plan([app('a', { wave: null, strategy: 'retain' }), app('b', { wave: null, strategy: 'retire' })]))), []);
  assert.deepEqual(problems(check(plan([app('a', { wave: 0 })]))), [], 'wave 0 is a wave');
  assert.deepEqual(problems(check(plan([app('a', { wave: '3' })]))), [], 'a wave written as digits is read');
});

test('no-owner: every strategy needs an owner, and the empty words count as empty', () => {
  for (const r of both([app('a', { owner: '' }), app('b', { owner: 'TBD' }), app('c', { strategy: 'retire', wave: null, owner: 'n/a' })])) {
    assert.deepEqual(find(r, 'no-owner').map((f) => f.subject), ['a', 'b', 'c']);
  }
  assert.deepEqual(find(check(plan([app('a', { owner: 'Nonetheless team' })])), 'no-owner'), [], 'a word that starts with none is a name');
});

// ---- dependencies --------------------------------------------------------------------------------------------------

test('dependency-unknown: an id that is not in the plan', () => {
  for (const r of both([app('a', { depends_on: ['b', 'ghost'] }), app('b')])) {
    assert.deepEqual(problems(r), ['dependency-unknown']);
    assert.match(find(r, 'dependency-unknown')[0].message, /"ghost", which is not an id in this plan/);
  }
  assert.deepEqual(wheres(check(plan([app('a', { depends_on: ['b', 'ghost'] }), app('b')])), 'dependency-unknown'), ['#/applications/0/depends_on/1']);
  assert.deepEqual(wheres(check(csvOf([app('a', { depends_on: ['b', 'ghost'] }), app('b')])), 'dependency-unknown'), ['row 2, depends_on']);
});

test('dependency-cycle: a loop of two, a loop of three, and an application that names itself, each reported once', () => {
  const two = both([app('a', { depends_on: ['b'] }), app('b', { depends_on: ['a'] })]);
  for (const r of two) {
    assert.deepEqual(problems(r), ['dependency-cycle']);
    assert.equal(find(r, 'dependency-cycle')[0].subject, 'a');
    assert.match(find(r, 'dependency-cycle')[0].message, /"a" and "b" depend on each other in a loop/);
  }
  const three = check(plan([app('x'), app('a', { depends_on: ['b'] }), app('b', { depends_on: ['c'] }), app('c', { depends_on: ['a', 'x'] })]));
  assert.deepEqual(problems(three), ['dependency-cycle']);
  assert.match(find(three, 'dependency-cycle')[0].message, /"a", "b" and "c"/);
  assert.equal(find(three, 'dependency-cycle')[0].where, '#/applications/1/depends_on');
  const self = check(plan([app('a', { depends_on: ['a'] })]));
  assert.deepEqual(problems(self), ['dependency-cycle']);
  assert.match(find(self, 'dependency-cycle')[0].message, /"a" names itself/);
  const twoLoops = check(plan([app('a', { depends_on: ['b'] }), app('b', { depends_on: ['a'] }), app('c', { depends_on: ['d'] }), app('d', { depends_on: ['c'] })]));
  assert.equal(find(twoLoops, 'dependency-cycle').length, 2);
});

test('dependency-cycle: a chain that only looks like a loop (a diamond) is not one', () => {
  const diamond = check(plan([app('top', { wave: 3, depends_on: ['left', 'right'] }), app('left', { wave: 2, depends_on: ['base'] }), app('right', { wave: 2, depends_on: ['base'] }), app('base')]));
  assert.deepEqual(problems(diamond), []);
});

test('dependency-later-wave: an application that moves before what it depends on; the same wave and an earlier dependency pass', () => {
  for (const r of both([app('api', { wave: 1, depends_on: ['db'] }), app('db', { wave: 2 })])) {
    assert.deepEqual(problems(r), ['dependency-later-wave']);
    assert.equal(find(r, 'dependency-later-wave')[0].subject, 'api');
    assert.match(find(r, 'dependency-later-wave')[0].message, /moves in wave 1 and depends on "db", which moves later, in wave 2/);
    assert.match(find(r, 'dependency-later-wave')[0].fix, /Move "db" in wave 1 or earlier, or move "api" in wave 2/);
  }
  assert.deepEqual(problems(check(plan([app('api', { wave: 2, depends_on: ['db'] }), app('db', { wave: 2 })]))), []);
  assert.deepEqual(problems(check(plan([app('api', { wave: 3, depends_on: ['db'] }), app('db', { wave: 1 })]))), []);
  assert.deepEqual(problems(check(plan([app('api', { wave: 9, depends_on: ['db'] }), app('db', { wave: 10 })]))), ['dependency-later-wave'], 'waves compare as numbers, not as text');
});

test('dependency-later-wave: not judged when a wave or a strategy is missing; that is reported on its own', () => {
  assert.deepEqual(problems(check(plan([app('api', { wave: 1, depends_on: ['db'] }), app('db', { wave: null })]))), ['wave-missing']);
  assert.deepEqual(problems(check(plan([app('api', { wave: 1, depends_on: ['db'] }), app('db', { wave: 2, strategy: 'later' })]))), ['strategy-unknown']);
});

test('retire-with-dependents: something that stays or moves still depends on an application planned for retire', () => {
  for (const r of both([app('reports', { depends_on: ['ledger'] }), app('ledger', { strategy: 'retire', wave: null }), app('mainframe', { strategy: 'retain', wave: null, depends_on: ['ledger'] })])) {
    assert.deepEqual(find(r, 'retire-with-dependents').map((f) => f.subject), ['reports', 'mainframe']);
    assert.match(find(r, 'retire-with-dependents')[0].message, /depends on "ledger", which is planned for retire/);
  }
  assert.deepEqual(problems(check(plan([app('old-ui', { strategy: 'retire', wave: null, depends_on: ['ledger'] }), app('ledger', { strategy: 'retire', wave: null })]))), [], 'a retired application may depend on another one');
});

test('dependency-cross-environment: a link between an application that moves and one that is retained is info, both ways', () => {
  const r = check(plan([app('pricing', { depends_on: ['billing'] }), app('billing', { strategy: 'retain', wave: null, depends_on: ['pricing'] })]));
  assert.deepEqual(find(r, 'dependency-cross-environment').map((f) => f.subject), ['pricing', 'billing']);
  assert.match(find(r, 'dependency-cross-environment')[0].message, /which is retained in the source environment/);
  assert.match(find(r, 'dependency-cross-environment')[1].message, /is retained in the source environment and depends on "pricing", which moves \(rehost, wave 1\)/);
  assert.deepEqual(find(r, 'dependency-later-wave'), []);
  assert.equal(r.gate.pass, false, 'the two of them still form a loop');
  const one = check(plan([app('pricing', { depends_on: ['billing'] }), app('billing', { strategy: 'retain', wave: null })]), { failOn: 'warning' });
  assert.deepEqual(problems(one), ['dependency-cross-environment']);
  assert.equal(one.gate.pass, true, 'info never fails the run');
  assert.deepEqual(find(check(plan([app('a', { strategy: 'retain', wave: null, depends_on: ['b'] }), app('b', { strategy: 'retain', wave: null })])), 'dependency-cross-environment'), [], 'two retained applications stay together');
});

test('dependencies: an id named twice is looked at once, spaces around an id are removed, and an empty entry is skipped', () => {
  const r = check(plan([app('a', { wave: 1, depends_on: ['b', ' b ', '', 'b'] }), app('b', { wave: 2 })]));
  assert.equal(find(r, 'dependency-later-wave').length, 1);
  const c = check(csvOf([app('a', { wave: 1, depends_on: 'b ; b;;' }), app('b', { wave: 2 })]));
  assert.equal(find(c, 'dependency-later-wave').length, 1);
});

// ---- cutover readiness ---------------------------------------------------------------------------------------------

test('no-rollback: every strategy that moves needs one; retain and retire do not; the empty words count as empty', () => {
  for (const strategy of ['rehost', 'relocate', 'replatform', 'repurchase', 'refactor']) {
    for (const r of both([app('a', { strategy, rollback: '' })])) assert.deepEqual(problems(r), ['no-rollback'], strategy);
  }
  for (const word of ['none', 'N/A', '-', 'tbd', 'TODO', 'null', '  ']) assert.deepEqual(problems(check(plan([app('a', { rollback: word })]))), ['no-rollback'], word);
  assert.deepEqual(problems(check(plan([app('a', { rollback: null })]))), ['no-rollback']);
  assert.deepEqual(problems(check(plan([app('a', { strategy: 'retain', wave: null, rollback: '' }), app('b', { strategy: 'retire', wave: null, rollback: '' })]))), []);
  const r = check(plan([app('a', { rollback: '' })]));
  assert.equal(find(r, 'no-rollback')[0].where, '#/applications/0/rollback');
  assert.deepEqual(find(r, 'no-rollback')[0].basis.map((b) => b.text), [FACTS.rollbackBefore.text, FACTS.rollbackPurpose.text]);
});

test('no-test-plan: a warning for every strategy that moves', () => {
  for (const r of both([app('a', { test_plan: '' }), app('b', { strategy: 'retain', wave: null, test_plan: '' })])) {
    assert.deepEqual(problems(r), ['no-test-plan']);
    assert.equal(find(r, 'no-test-plan')[0].severity, 'warning');
  }
});

test('stateful-no-data-sync: a stateful application that moves with no sync method, or none; not stated is a note', () => {
  for (const r of both([app('db', { stateful: true, data_sync: 'none' }), app('cache', { stateful: true, data_sync: '' }), app('ok', { stateful: true, data_sync: 'backup-restore' })])) {
    assert.deepEqual(find(r, 'stateful-no-data-sync').map((f) => f.subject), ['db', 'cache']);
  }
  for (const yes of ['yes', 'Y', 'TRUE', '1', 1, true]) assert.deepEqual(problems(check(plan([app('db', { stateful: yes, data_sync: '' })]))), ['stateful-no-data-sync'], String(yes));
  for (const no of ['no', 'N', 'false', '0', 0, false]) assert.deepEqual(problems(check(plan([app('db', { stateful: no, data_sync: '' })]))), [], String(no));
  const unknown = check(plan([app('db', { stateful: undefined, data_sync: '' })]));
  assert.deepEqual(problems(unknown), []);
  assert.ok(unknown.notes.some((n) => /1 application that moves does not say whether it is stateful/.test(n)));
  assert.deepEqual(problems(check(plan([app('ledger', { strategy: 'retire', wave: null, stateful: true, data_sync: '' })]))), [], 'a retired application moves no data');
});

test('dns-ttl-longer-than-window: the TTL in seconds against the window in minutes, only when both are given', () => {
  for (const r of both([app('web', { dns_ttl_seconds: 3601, cutover_window_minutes: 60 })])) {
    assert.deepEqual(problems(r), ['dns-ttl-longer-than-window']);
    assert.match(find(r, 'dns-ttl-longer-than-window')[0].message, /3,601 seconds and its cutover window is 60 minutes \(3,600 seconds\)/);
  }
  assert.deepEqual(problems(check(plan([app('web', { dns_ttl_seconds: 3600, cutover_window_minutes: 60 })]))), [], 'equal is inside the window');
  assert.deepEqual(problems(check(plan([app('web', { dns_ttl_seconds: 100, cutover_window_minutes: 1.5 })]))), ['dns-ttl-longer-than-window'], 'a window of 1.5 minutes is 90 seconds');
  assert.deepEqual(problems(check(plan([app('web', { dns_ttl_seconds: 86400, cutover_window_minutes: undefined })]))), []);
  assert.deepEqual(problems(check(plan([app('web', { dns_ttl_seconds: undefined, cutover_window_minutes: 1 })]))), []);
  assert.deepEqual(problems(check(plan([app('web', { strategy: 'retain', wave: null, dns_ttl_seconds: 86400, cutover_window_minutes: 1 })]))), []);
  assert.deepEqual(problems(check(plan([app('web', { dns_ttl_seconds: 1, cutover_window_minutes: 0 })]))), ['dns-ttl-longer-than-window'], 'a window of 0 minutes');
});

// ---- waves ---------------------------------------------------------------------------------------------------------

test('wave-over-limit: the limit of one wave comes first, then the option, then the plan', () => {
  const apps = [app('a'), app('b'), app('c'), app('d', { wave: 2 })];
  const r = check(plan(apps, { plan: { max_apps_per_wave: 2 } }));
  assert.deepEqual(wheres(r, 'wave-over-limit'), ['#/plan/max_apps_per_wave']);
  assert.match(find(r, 'wave-over-limit')[0].message, /Wave 1 holds 3 applications, and the max_apps_per_wave of the plan is 2/);
  const own = check(plan(apps, { plan: { max_apps_per_wave: 2 }, waves: [{ wave: 1, max_apps: 3 }, { wave: 2 }] }));
  assert.deepEqual(find(own, 'wave-over-limit'), [], 'the limit of wave 1 is 3');
  const tight = check(plan(apps, { waves: [{ wave: 2, max_apps: 1 }, { wave: 1, max_apps: 1 }] }));
  assert.deepEqual(wheres(tight, 'wave-over-limit'), ['#/waves/1/max_apps']);
  const option = check(plan(apps, { plan: { max_apps_per_wave: 10 } }), { maxAppsPerWave: 2 });
  assert.deepEqual(wheres(option, 'wave-over-limit'), ['wave 1']);
  assert.match(find(option, 'wave-over-limit')[0].message, /the limit given with --max-apps-per-wave is 2/);
  assert.equal(option.plan.maxAppsPerWave, 2);
  const csv = check(csvOf(apps), { maxAppsPerWave: 2 });
  assert.deepEqual(wheres(csv, 'wave-over-limit'), ['wave 1']);
  assert.deepEqual(find(check(plan(apps, { plan: { max_apps_per_wave: 3 } })), 'wave-over-limit'), [], 'at the limit is not over it');
});

test('wave-over-limit: retained applications are not counted, and retired ones with a wave are', () => {
  const apps = [app('a'), app('keep', { strategy: 'retain' }), app('old', { strategy: 'retire' })];
  assert.deepEqual(wheres(check(plan(apps), { maxAppsPerWave: 1 }), 'wave-over-limit'), ['wave 1']);
  assert.match(find(check(plan(apps), { maxAppsPerWave: 1 }), 'wave-over-limit')[0].message, /holds 2 applications/);
});

test('wave-over-limit: without a limit the check is not run, and a note says so', () => {
  const r = check(plan([app('a'), app('b')]));
  assert.ok(r.notes.some((n) => /No wave limit was given \(plan\.max_apps_per_wave, waves\[\]\.max_apps or --max-apps-per-wave\)/.test(n)));
  assert.ok(check(csvOf([app('a')])).notes.some((n) => n === 'No wave limit was given (--max-apps-per-wave), so wave-over-limit was not run'));
  assert.ok(!check(plan([app('a')]), { maxAppsPerWave: 5 }).notes.some((n) => /No wave limit/.test(n)));
});

test('wave-summary: one info line per wave, in wave order, with the strategies and the stateful count', () => {
  const r = check(plan([app('c', { wave: 10 }), app('a', { wave: 2, strategy: 'replatform', stateful: true, data_sync: 'replication' }), app('b', { wave: 2 }), app('d', { wave: 2, strategy: 'retire' })]));
  assert.deepEqual(find(r, 'wave-summary').map((f) => f.where), ['wave 2', 'wave 10']);
  assert.equal(find(r, 'wave-summary')[0].message, 'Wave 2 holds 3 applications: 1 retire, 1 rehost, 1 replatform; 1 is stateful.');
  assert.equal(find(r, 'wave-summary')[1].message, 'Wave 10 holds 1 application: 1 rehost; 0 are stateful.');
  assert.equal(r.gate.pass, true);
  assert.equal(r.plan.waves, 2);
});

// ---- the report and the values ------------------------------------------------------------------------------------

test('no text of a name, an owner, a data sync method, a rollback or a test plan is copied into a finding', () => {
  const mark = (field) => `MARKER-${field}-7f3a`;
  const fields = { name: mark('name'), owner: mark('owner'), data_sync: mark('sync'), rollback: mark('rollback'), test_plan: mark('test') };
  const r = check(plan([app('a', { ...fields, wave: 1, depends_on: ['b', 'ghost'], dns_ttl_seconds: 9999 }), app('b', { ...fields, wave: 2, strategy: 'retire' }), app('c', { ...fields, strategy: 'retain', wave: null, depends_on: ['a'] })]), { maxAppsPerWave: 1 });
  assert.ok(r.findings.length >= 4);
  assert.doesNotMatch(JSON.stringify(r), /MARKER/);
});

test('every finding has its place, its line, a message, a fix and at least one quoted sentence with its page', () => {
  const r = check(csvOf([app('a', { owner: '', rollback: '', test_plan: '', stateful: true, data_sync: '', depends_on: ['b', 'x'], dns_ttl_seconds: 9999, cutover_window_minutes: 1 }), app('b', { wave: 2 })]), { maxAppsPerWave: 1 });
  assert.ok(r.findings.length >= 8);
  for (const f of r.findings) {
    assert.ok(f.where.length > 0 && Number.isInteger(f.line) && f.line >= 1, f.id);
    assert.ok(f.message.length > 20 && f.fix.length > 10, f.id);
    assert.ok(f.basis.length >= 1 && f.basis.every((b) => b.text && b.section && b.source.startsWith('https://')), f.id);
    assert.equal(f.source, f.basis[0].source);
  }
});

test('findings are sorted by severity, area, check and place, and the order is the same on every run', () => {
  const doc = plan([app('z', { owner: '' }), app('y', { rollback: '' }), app('x', { depends_on: ['ghost'] })]);
  const a = check(doc);
  assert.deepEqual(ids(a).filter((id) => id !== 'wave-summary'), ['dependency-unknown', 'no-rollback', 'no-owner']);
  assert.deepEqual(check(doc), a);
});

test('the value readers: whole numbers, numbers, yes and no, texts and strategy names', () => {
  assert.equal(wholeOf('12', 0, 20), 12);
  assert.equal(wholeOf(' 7 ', 0, 20), 7);
  assert.equal(wholeOf('1.5', 0, 20), null);
  assert.equal(wholeOf(21, 0, 20), null);
  assert.equal(wholeOf('-1', 0, 20), null);
  assert.equal(wholeOf('9'.repeat(50), 0, 20), null);
  assert.equal(numberOf('1.25', 10), 1.25);
  assert.equal(numberOf('1e3', 10000), null);
  assert.equal(numberOf(Infinity, 10), null);
  assert.equal(yesNoOf('Yes'), true);
  assert.equal(yesNoOf('nope'), null);
  assert.equal(yesNoOf(2), null);
  assert.deepEqual(textOf({ present: true, value: 'TBD' }), { ok: true, filled: false });
  assert.deepEqual(textOf({ present: true, value: 5 }), { ok: false, filled: false });
  assert.deepEqual(textOf({ present: false }), { ok: true, filled: false });
  assert.equal(strategyOf(' Re-Architect '), 'refactor');
  assert.equal(strategyOf('REHOST'), 'rehost');
  assert.equal(FINDINGS.length, 17);
});
