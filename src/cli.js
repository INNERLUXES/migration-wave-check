// Command line: migration-wave-check <plan-file> [options]

import { readFileSync } from 'node:fs';
import { FINDINGS, LIMITS, checkFile, safeText } from './check.js';
import { toText, toMarkdown, toJson, toCsv } from './report.js';
import { MAX_LIMIT } from './rules.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, csv: toCsv };
const THRESHOLDS = ['error', 'warning'];

export const USAGE = `Usage: migration-wave-check <plan-file> [options]

Reads one application migration wave plan (CSV, JSON, or the YAML subset of docs/inputs.md) and reports what the plan
itself shows: an application that moves before something it depends on, dependencies that loop or name nothing, an
application that still depends on one planned for retire, a move with no rollback or test plan, stateful data with no
sync method, a DNS TTL longer than the cutover window, a missing strategy or owner, and a wave over its limit. It never
prints the text of a rollback, a test plan or an owner, opens no network connection and runs no program.

Options:
  --format <name>              text, markdown, json or csv (default: text)
  --fail-on <level>            exit with 1 when a finding is at this level or above: error or warning
                               (default: error); info never fails the run
  --max-apps-per-wave <n>      the most applications one wave may hold; replaces the limit of the plan
  --help                       show this text
  --version                    show the version

Checks: ${FINDINGS.map((f) => f.id).join(', ')}

Exit codes: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
`;

export function parseArgs(argv) {
  const o = { file: null, format: 'text', failOn: 'error', maxAppsPerWave: undefined, help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--format') o.format = next();
    else if (a === '--fail-on') o.failOn = next();
    else if (a === '--max-apps-per-wave') {
      const v = next();
      if (!/^[1-9][0-9]{0,5}$/.test(v) || Number(v) > MAX_LIMIT) throw new Error(`--max-apps-per-wave takes a whole number from 1 to ${MAX_LIMIT}, not ${v.slice(0, 20)}`);
      o.maxAppsPerWave = Number(v);
    } else if (a === '-') throw new Error('reading from standard input is not supported; give the path of the file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else if (o.file !== null) throw new Error(`give one file, not ${a} as well`);
    else o.file = a;
  }
  if (!o.help && !o.version) {
    if (o.file === null) throw new Error('give the path of the plan file');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(o.file)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or csv)`);
    if (!THRESHOLDS.includes(o.failOn)) throw new Error(`--fail-on takes error or warning, not ${o.failOn}`);
  }
  return o;
}

function clean(text) {
  return safeText(text, 2000);
}

// Exit code: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = LIMITS, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`migration-wave-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkFile(o.file, { failOn: o.failOn, version: VERSION, limits, base, maxAppsPerWave: o.maxAppsPerWave });
  } catch (error) {
    io.err(`migration-wave-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report));
  return report.gate.pass ? 0 : 1;
}
