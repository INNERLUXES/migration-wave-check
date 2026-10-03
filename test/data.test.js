import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { APP_FIELDS, EMPTY_WORDS, FACTS, FIELDS, FINDINGS, MAX_TTL, MOVING, NO_WORDS, SOURCES, STRATEGIES, STRATEGY_ALIASES, YES_WORDS, factPage, source } from '../src/index.js';

// These tests read the saved pages again and compare them with src/data.js: the strategy names, the TTL range and every
// sentence that a finding or a document quotes.

const text = async (id) => readFile(new URL(`../research/sources/${source(id).file}`, import.meta.url), 'utf8');
// Text compared without line breaks or runs of white space.
const flat = (t) => t.replace(/\s+/g, ' ').trim();
const has = (page, needle) => flat(page).includes(flat(needle));
// The words of a tool that wrote a text, built from pieces so that this file does not hold them.
const WRITTEN = new RegExp(`\\b(?:${['A', 'I'].join('')}|${['cha', 't'].join('')}|${['clau', 'de'].join('')}|${['anthro', 'pic'].join('')}|${['ope', 'nai'].join('')})\\b`, 'i');
const YEAR = /\b(?:19|20)\d{2}\b/;

test('sources: every saved page has its address on the first line, as listed in src/data.js, and holds text', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.equal(page.split('\n')[0], `Source: ${s.url}`, s.file);
    assert.ok(page.length > 800, `${s.file} holds the page text`);
    assert.match(s.url, /^https:\/\//);
  }
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.url)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.file)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.id)).size);
});

test('sources: every file in research/sources is listed in src/data.js, and the other way round', async () => {
  const files = (await readdir(new URL('../research/sources/', import.meta.url))).sort();
  assert.deepEqual(files, SOURCES.map((s) => s.file).sort());
});

test('sources: the pages come from AWS, Microsoft Learn, the RFC editor and yaml.org', () => {
  assert.deepEqual(SOURCES.map((s) => new URL(s.url).host).sort(), ['docs.aws.amazon.com', 'learn.microsoft.com', 'learn.microsoft.com', 'learn.microsoft.com', 'www.rfc-editor.org', 'www.rfc-editor.org', 'www.rfc-editor.org', 'yaml.org']);
});

test('sources: no saved page holds a year, a mention of a tool that wrote it, a control byte, a carriage return or a character that is not ASCII', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.doesNotMatch(page, YEAR, s.file);
    assert.doesNotMatch(page, WRITTEN, s.file);
    assert.doesNotMatch(page, new RegExp(`[${String.fromCharCode(1)}-${String.fromCharCode(8)}]`), s.file);
    assert.ok(!page.includes('\r'), s.file);
    assert.ok([...page].every((c) => c.charCodeAt(0) < 128), s.file);
  }
});

test('strategies: the seven names are the headings of the AWS page, and re-architect is the other name it gives refactor', async () => {
  const page = await text('aws-strategies');
  assert.deepEqual(Object.values(STRATEGIES).sort(), ['refactor', 'rehost', 'relocate', 'replatform', 'repurchase', 'retain', 'retire']);
  for (const name of ['Retire', 'Retain', 'Rehost', 'Relocate', 'Repurchase', 'Replatform']) assert.ok(page.includes(`\n## ${name}\n`), name);
  assert.ok(page.includes('\n## Refactor or re-architect\n'));
  assert.ok(has(page, FACTS.sevenRs.text));
  assert.deepEqual(STRATEGY_ALIASES, { 're-architect': 'refactor' });
  assert.ok(has(page, 'This strategy is also known as lift and shift.'), 'lift and shift is a name the page gives rehost, which the tool does not guess');
  assert.deepEqual(MOVING, ['rehost', 'relocate', 'replatform', 'repurchase', 'refactor']);
  for (const s of MOVING) assert.ok(Object.hasOwn(STRATEGIES, s), s);
});

test('TTL: the largest value is the one RFC 2181 gives, and RFC 1035 defines the field', async () => {
  assert.equal(MAX_TTL, 2 ** 31 - 1);
  assert.ok(has(await text('rfc2181'), `a maximum value of ${MAX_TTL}`));
  assert.ok(has(await text('rfc2181'), 'The TTL specifies a maximum time to live, not a mandatory time to live.'));
  assert.ok(has(await text('rfc1035'), FACTS.ttlField.text));
});

test('CSV: the rules the reader follows are the ones of RFC 4180 section 2', async () => {
  const page = await text('rfc4180');
  for (const k of ['csvFieldCount', 'csvEnclose', 'csvEscape']) assert.ok(has(page, FACTS[k].text), k);
  assert.ok(has(page, 'The last field in the record must not be followed by a comma.'));
});

test('YAML: the saved sections name the anchor, the alias and the tag that the reader refuses', async () => {
  const page = await text('yaml-1.2.2');
  assert.ok(has(page, 'An anchor is denoted by the "&" indicator.'));
  assert.ok(has(page, 'An alias node is denoted by the "*" indicator.'));
  assert.ok(has(page, 'A tag is denoted by the "!" indicator.'));
});

test('facts: every quoted sentence is on its saved page, word for word, with no year and no mention of a tool that wrote it', async () => {
  for (const [key, fact] of Object.entries(FACTS)) {
    assert.ok(SOURCES.some((s) => s.id === fact.source), key);
    assert.ok(has(await text(fact.source), fact.text), `${key}: "${fact.text}"`);
    assert.ok(fact.section.length > 3, key);
    assert.doesNotMatch(fact.text, YEAR, key);
    assert.doesNotMatch(fact.text, WRITTEN, key);
    assert.ok(fact.text.length <= 220, `${key} is short`);
    assert.equal(factPage(key), source(fact.source).url);
  }
});

test('facts: every finding quotes sentences of src/data.js, and every source page is quoted at least once', () => {
  for (const f of FINDINGS) {
    assert.ok(['error', 'warning', 'info'].includes(f.severity), f.id);
    assert.match(f.id, /^[a-z]+(?:-[a-z]+)+$/, f.id);
    assert.ok(f.what.length > 20, f.id);
    assert.ok(f.facts.length >= 1, f.id);
    for (const k of f.facts) assert.ok(FACTS[k], `${f.id}: ${k}`);
  }
  const quoted = new Set(Object.values(FACTS).map((f) => f.source));
  for (const s of SOURCES) assert.ok(quoted.has(s.id), s.id);
  assert.deepEqual(FINDINGS.filter((f) => f.severity === 'error').map((f) => f.id), ['duplicate-id', 'value-invalid', 'strategy-unknown', 'wave-missing', 'dependency-unknown', 'dependency-cycle', 'dependency-later-wave', 'retire-with-dependents', 'no-rollback', 'stateful-no-data-sync']);
  assert.deepEqual(FINDINGS.filter((f) => f.severity === 'info').map((f) => f.id), ['dependency-cross-environment', 'wave-summary']);
});

test('fields: the column names are the documented ones, and the words read as empty, yes and no do not overlap', () => {
  assert.deepEqual(APP_FIELDS, ['id', 'name', 'wave', 'strategy', 'owner', 'depends_on', 'stateful', 'data_sync', 'rollback', 'test_plan', 'dns_ttl_seconds', 'cutover_window_minutes']);
  assert.equal(FIELDS.maxAppsPerWave, 'max_apps_per_wave');
  assert.ok(EMPTY_WORDS.includes('none'));
  for (const w of YES_WORDS) assert.ok(!NO_WORDS.includes(w), w);
});

test('src names no column or strategy outside src/data.js', async () => {
  const names = ['depends_on', 'data_sync', 'test_plan', 'dns_ttl_seconds', 'cutover_window_minutes', 'max_apps_per_wave', 'max_apps', 'rehost', 'replatform', 'relocate', 'repurchase', 'refactor', 'retain', 'retire'];
  for (const file of ['rules.js', 'check.js', 'plan.js', 'report.js', 'cli.js']) {
    const lines = (await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')).split(String.fromCharCode(10));
    const code = lines.filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
    for (const n of names) assert.ok(!code.includes(`'${n}'`) && !code.includes(`"${n}"`), `${file} writes '${n}' itself`);
  }
});

test('docs: every sentence that the documents quote from a saved page is on a saved page', async () => {
  const pages = (await Promise.all(SOURCES.map((s) => text(s.id)))).map(flat).join(' ');
  let checked = 0;
  for (const file of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/inputs.md', 'docs/limits.md']) {
    const doc = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const m of doc.matchAll(/"([^"\n]{40,400})"/g)) {
      assert.ok(pages.includes(flat(m[1])), `${file}: ${m[1]}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 30, `${checked} quotes checked`);
});

test('docs: docs/rules-and-sources.md names every saved page, every quoted sentence and every finding', async () => {
  const doc = await readFile(new URL('../docs/rules-and-sources.md', import.meta.url), 'utf8');
  for (const s of SOURCES) {
    assert.ok(doc.includes(s.file), s.file);
    assert.ok(doc.includes(s.url), s.url);
  }
  for (const [key, fact] of Object.entries(FACTS)) assert.ok(doc.includes(`| \`${key}\` |`) && doc.includes(fact.text), key);
  for (const f of FINDINGS) assert.ok(doc.includes(`\`${f.id}\``), f.id);
});
