// Shared test helpers: plans built inline, and files written into a temporary folder that is removed after the test.
// Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and Windows.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { APP_FIELDS, checkText, main } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'migration-wave-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// An application that moves and has no finding of its own: an owner, a rollback, a test plan, a TTL inside the window.
export const app = (id, extra = {}) => ({
  id,
  name: `The ${id} application`,
  wave: 1,
  strategy: 'rehost',
  owner: 'team-a',
  depends_on: [],
  stateful: false,
  data_sync: 'none',
  rollback: 'Point the traffic back to the old host',
  test_plan: 'End-to-end smoke tests',
  dns_ttl_seconds: 300,
  cutover_window_minutes: 60,
  ...extra
});

// A JSON plan object with these applications and, optionally, the plan and waves fields.
export const plan = (apps, extra = {}) => ({ ...extra, applications: apps });

// One CSV cell, quoted as RFC 4180 says when it needs it.
const cell = (v) => {
  let s;
  if (v === undefined || v === null) s = '';
  else if (Array.isArray(v)) s = v.join(';');
  else if (typeof v === 'boolean') s = v ? 'yes' : 'no';
  else s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// A CSV plan with the standard header (or the given columns) and one record per application.
export function csvOf(apps, columns = APP_FIELDS) {
  return [columns.join(','), ...apps.map((a) => columns.map((c) => cell(a[c])).join(','))].join('\r\n') + '\r\n';
}

// Checks a plan given as an object (written as JSON) or as text.
export function check(doc, options = {}) {
  const text = typeof doc === 'string' ? doc : JSON.stringify(doc);
  return checkText(text, options.name ?? (typeof doc === 'string' ? 'plan.csv' : 'plan.json'), { ...options });
}

export const ids = (report) => report.findings.map((f) => f.id);
export const find = (report, id) => report.findings.filter((f) => f.id === id);
export const wheres = (report, id) => find(report, id).map((f) => f.where);
// The finding ids without the wave summaries, which every plan with a wave has.
export const problems = (report) => ids(report).filter((id) => id !== 'wave-summary');

// Writes the files (objects are written as JSON, strings as they are) and runs the command line with these arguments
// (paths relative to the folder).
export async function run(files, args = [], limits) {
  const written = {};
  for (const [name, content] of Object.entries(files)) written[name] = typeof content === 'string' || Buffer.isBuffer(content) ? content : json(content);
  return withFiles(written, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err };
  });
}

// Runs the command line with exactly these arguments.
export async function cli(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } });
  return { code, out, err };
}
