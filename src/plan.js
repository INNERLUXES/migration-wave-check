// Reading one migration plan from CSV, JSON or the YAML subset of docs/inputs.md into one shape: a list of
// applications, each with its fields and the place (row or JSON pointer, and line) of every field, and the limits of
// the plan. Nothing here judges a value; src/rules.js does that.

import { extname } from 'node:path';
import { parseCsv } from './csv.js';
import { APP_FIELDS, FIELDS } from './data.js';
import { parseJson } from './json.js';
import { parseYaml } from './yaml.js';

export const PLAN_LIMITS = {
  maxNesting: 64,
  maxNodes: 500_000,
  maxYamlLines: 200_000,
  maxApplications: 20_000,
  maxDependsPerApp: 1000,
  maxDependencies: 200_000,
  maxListedPerFinding: 200
};

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A JSON pointer token written for a URI fragment: "~" becomes "~0" and "/" becomes "~1".
export function escapeToken(t) {
  return String(t).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function pointerOf(tokens) {
  return tokens.length === 0 ? '#' : `#/${tokens.map(escapeToken).join('/')}`;
}

// The line of a pointer, or of its nearest ancestor that has one.
export function lineOf(lines, pointer) {
  let p = pointer;
  for (;;) {
    const line = lines.get(p);
    if (line !== undefined) return line;
    const cut = p.lastIndexOf('/');
    if (cut <= 1) return lines.get('#') ?? 1;
    p = p.slice(0, cut);
  }
}

// The reader's nodes as plain data (objects without a prototype, so a key such as __proto__ is only a name), and a map
// from the pointer of every value to its line. The depth of the nodes is already limited by the readers.
function toData(node, pointer, lines) {
  lines.set(pointer, node.line);
  if (node.t === 'object') {
    const out = Object.create(null);
    for (const p of node.props) {
      const child = `${pointer === '#' ? '#/' : `${pointer}/`}${escapeToken(p.key)}`;
      out[p.key] = toData(p.value, child, lines);
      lines.set(child, p.line);
    }
    return out;
  }
  if (node.t === 'array') return node.items.map((item, i) => toData(item, `${pointer === '#' ? '#/' : `${pointer}/`}${i}`, lines));
  return node.value;
}

// The format of a file from its name, or from its first characters when the name does not say.
export function formatOf(text, name = '') {
  const ext = extname(name).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.json') return 'json';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  const start = String(text).replace(/^\ufeff/, '').slice(0, 2000).trimStart();
  if (start.startsWith('{') || start.startsWith('[')) return 'json';
  const first = start.split(/\r\n|\n|\r/, 1)[0] ?? '';
  if (/^(?:#|---|-\s|[A-Za-z_][A-Za-z0-9_-]{0,60}:(?:\s|$))/.test(first)) return 'yaml';
  return 'csv';
}

// An application: n is its place in the plan (0, 1, ...), at is the place of the whole entry, and field(name) gives
// { present, value, where, line } for one field. A field that is absent, or an empty CSV cell, is not present.
function csvPlan(text, limits) {
  const { header, records } = parseCsv(text, 'the CSV', { limits: { maxRecords: limits.maxApplications + 1, maxFields: 100, maxFieldLength: 20_000 } });
  const column = new Map(header.map((h) => [h.name, h.column]));
  if (!column.has(FIELDS.id)) throw new Error(`not a migration plan: the header has no "${FIELDS.id}" column`);
  const apps = records.map((r, n) => {
    const at = { where: `row ${r.row}`, line: r.line };
    return {
      n,
      at,
      field(name) {
        const where = `row ${r.row}, ${name}`;
        if (!column.has(name)) return { present: false, value: undefined, where, line: r.line };
        const value = r.fields[column.get(name)];
        return { present: value.trim() !== '', value, where, line: r.line };
      },
      // The entries of a list field: a CSV cell is split at ";", "," and "|".
      list(name) {
        const f = this.field(name);
        if (!f.present) return [];
        return f.value.split(/[;,|]/).map((v) => v.trim()).filter((v) => v !== '').map((value) => ({ value, where: f.where, line: f.line }));
      }
    };
  });
  return {
    format: 'csv',
    apps,
    name: '',
    limit: null,
    waveLimits: [],
    columns: { missing: APP_FIELDS.filter((f) => !column.has(f)), unknown: header.map((h) => h.name).filter((n) => !APP_FIELDS.includes(n)) },
    problems: []
  };
}

function treePlan(text, format, limits) {
  const node = format === 'yaml'
    ? parseYaml(text, 'the YAML', { limits: { maxDepth: limits.maxNesting, maxLines: limits.maxYamlLines, maxLineLength: 20_000 } })
    : parseJson(text, 'the JSON', { limits: { maxDepth: limits.maxNesting, maxNodes: limits.maxNodes } });
  const lines = new Map();
  const data = toData(node, '#', lines);
  let list;
  let base;
  let root = null;
  if (Array.isArray(data)) {
    list = data;
    base = [];
  } else if (isObj(data) && Array.isArray(data[FIELDS.applications])) {
    root = data;
    list = data[FIELDS.applications];
    base = [FIELDS.applications];
  } else if (isObj(data) && data[FIELDS.applications] !== undefined) {
    throw new Error(`not a migration plan: "${FIELDS.applications}" is not a list`);
  } else {
    throw new Error(`not a migration plan: the file holds neither a list of applications nor an object with "${FIELDS.applications}"`);
  }
  if (list.length > limits.maxApplications) throw new Error(`more than ${limits.maxApplications.toLocaleString('en-US')} applications`);
  const loc = (tokens) => {
    const where = pointerOf(tokens);
    return { where, line: lineOf(lines, where) };
  };
  const problems = []; // { where, line, subject, message, fix }
  const apps = [];
  list.forEach((entry, n) => {
    const at = loc([...base, String(n)]);
    if (!isObj(entry)) {
      problems.push({ ...at, subject: `entry ${n + 1}`, message: `Entry ${n + 1} of the applications is not an object with fields, so it was not read.`, fix: 'Write each application as an object with id, wave, strategy and the other fields.' });
      return;
    }
    apps.push({
      n: apps.length,
      at,
      field(name) {
        const place = loc([...base, String(n), name]);
        if (!Object.hasOwn(entry, name)) return { present: false, value: undefined, ...place };
        const value = entry[name];
        const present = value !== null && !(typeof value === 'string' && value.trim() === '');
        return { present, value, ...place };
      },
      // The entries of a list field: a list of strings, or one string split as a CSV cell is.
      list(name) {
        const f = this.field(name);
        if (!f.present) return [];
        if (typeof f.value === 'string') return f.value.split(/[;,|]/).map((v) => v.trim()).filter((v) => v !== '').map((value) => ({ value, where: f.where, line: f.line }));
        if (Array.isArray(f.value)) return f.value.map((value, k) => ({ value, ...loc([...base, String(n), name, String(k)]) }));
        return [{ value: f.value, where: f.where, line: f.line }];
      }
    });
  });

  // Plan-level limits: plan.max_apps_per_wave, and waves: [{ wave, max_apps }].
  let limit = null;
  const waveLimits = [];
  let name = '';
  if (root && root[FIELDS.plan] !== undefined) {
    const plan = root[FIELDS.plan];
    if (!isObj(plan)) throw new Error(`"${FIELDS.plan}" is not an object`);
    if (typeof plan[FIELDS.planName] === 'string') name = plan[FIELDS.planName];
    if (plan[FIELDS.maxAppsPerWave] !== undefined && plan[FIELDS.maxAppsPerWave] !== null) {
      limit = { value: plan[FIELDS.maxAppsPerWave], ...loc([FIELDS.plan, FIELDS.maxAppsPerWave]) };
    }
  }
  if (root && root[FIELDS.waves] !== undefined && root[FIELDS.waves] !== null) {
    const waves = root[FIELDS.waves];
    if (!Array.isArray(waves)) throw new Error(`"${FIELDS.waves}" is not a list`);
    if (waves.length > limits.maxApplications) throw new Error(`more than ${limits.maxApplications.toLocaleString('en-US')} waves`);
    waves.forEach((w, k) => {
      if (!isObj(w)) {
        problems.push({ ...loc([FIELDS.waves, String(k)]), subject: `wave entry ${k + 1}`, message: `Entry ${k + 1} of the waves is not an object with fields, so it was not read.`, fix: 'Write each wave as an object with wave and max_apps.' });
        return;
      }
      waveLimits.push({ wave: { value: w[FIELDS.wave], ...loc([FIELDS.waves, String(k), FIELDS.wave]) }, max: { value: w[FIELDS.maxApps], ...loc([FIELDS.waves, String(k), FIELDS.maxApps]) } });
    });
  }
  return { format, apps, name, limit, waveLimits, columns: { missing: [], unknown: [] }, problems };
}

// Parses the text of one plan. name is the file name, used to choose the format.
export function parsePlan(text, name = '', limits = PLAN_LIMITS) {
  const format = formatOf(text, name);
  return format === 'csv' ? csvPlan(text, limits) : treePlan(text, format, limits);
}
