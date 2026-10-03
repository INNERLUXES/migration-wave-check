// Reads one migration plan, runs the checks of src/rules.js and returns one report: the findings grouped by area, notes
// and the gate. docs/method.md gives the reason behind every finding. The tool reads the one file it is given and opens
// no connection.

import { resolve } from 'node:path';
import { FIELDS } from './data.js';
import { FILE_LIMITS, displayPath, readBounded } from './files.js';
import { PLAN_LIMITS, parsePlan } from './plan.js';
import { AREAS, BY_ID_SEVERITY, FINDINGS, ORDER, RANK, SEVERITIES, meetsThreshold, runRules, safeText } from './rules.js';

export const LIMITS = { ...PLAN_LIMITS, ...FILE_LIMITS };
export { AREAS, FINDINGS, ORDER, RANK, SEVERITIES, meetsThreshold, safeText };

function plural(count, one, many = `${one}s`) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

// Builds the report for the text of one plan. name is the file name shown and used to choose CSV, JSON or YAML.
export function checkText(text, name, { failOn = 'error', version = '0.0.0', limits = LIMITS, path = name, maxAppsPerWave } = {}) {
  const parsed = parsePlan(text, name, limits);
  const { findings, facts } = runRules(parsed, limits, { maxAppsPerWave });

  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  for (const [id, n] of Object.entries(facts.omitted)) counts[BY_ID_SEVERITY[id]] += n;

  const areas = AREAS.map((a) => {
    const own = findings.filter((f) => f.area === a.id);
    const worst = own.length ? own.reduce((w, f) => (RANK[f.severity] < RANK[w] ? f.severity : w), 'info') : null;
    const result = worst === 'error' ? 'fail' : worst === 'warning' ? 'warn' : worst === 'info' ? 'info' : 'pass';
    const detail = own.length ? [...new Set(own.map((f) => f.id))].map((id) => `${id} x${own.filter((f) => f.id === id).length}`).join(', ') : 'no finding';
    return { id: a.id, title: a.title, result, detail: safeText(detail, 400), findings: own.length };
  });

  const notes = [];
  if (facts.applications === 0) notes.push('The plan holds no application, so there was nothing to check');
  const missing = parsed.columns.missing.filter((c) => c !== FIELDS.name);
  if (parsed.format === 'csv' && missing.length) notes.push(`The ${missing.length === 1 ? 'column' : 'columns'} ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in the file, so every application is read as having nothing there`);
  if (parsed.columns.unknown.length) notes.push(`${parsed.columns.unknown.length === 1 ? 'A column was' : 'Columns were'} not read: ${safeText(parsed.columns.unknown.slice(0, 10).join(', '), 300)}${parsed.columns.unknown.length > 10 ? ', ...' : ''}`);
  if (facts.statefulUnknown) notes.push(`${plural(facts.statefulUnknown, 'application that moves', 'applications that move')} ${facts.statefulUnknown === 1 ? 'does' : 'do'} not say whether ${facts.statefulUnknown === 1 ? 'it is' : 'they are'} stateful, so stateful-no-data-sync was not run for ${facts.statefulUnknown === 1 ? 'it' : 'them'}`);
  if (facts.limit === null && !facts.waveLimits && facts.applications > 0) notes.push(parsed.format === 'csv' ? 'No wave limit was given (--max-apps-per-wave), so wave-over-limit was not run' : `No wave limit was given (${FIELDS.plan}.${FIELDS.maxAppsPerWave}, ${FIELDS.waves}[].${FIELDS.maxApps} or --max-apps-per-wave), so wave-over-limit was not run`);
  for (const [id, n] of Object.entries(facts.omitted)) notes.push(`${plural(n, 'more finding')} of ${id} ${n === 1 ? 'is' : 'are'} counted but not listed (the limit is ${limits.maxListedPerFinding} listed findings per check)`);

  const eCount = meetsThreshold('error', failOn) ? counts.error : 0;
  const wCount = meetsThreshold('warning', failOn) ? counts.warning : 0;
  const reason = [eCount ? plural(eCount, 'error') : null, wCount ? plural(wCount, 'warning') : null].filter(Boolean).join(', ');

  return {
    tool: 'migration-wave-check',
    version,
    plan: {
      path: safeText(path, 400),
      format: parsed.format,
      name: safeText(parsed.name, 120),
      applications: facts.applications,
      moving: facts.moving,
      retained: facts.retained,
      retired: facts.retired,
      waves: facts.waves,
      maxAppsPerWave: facts.limit
    },
    areas,
    findings,
    notes,
    counts,
    gate: { failOn, pass: eCount + wCount === 0, reason }
  };
}

// Reads the file and builds the report. The path in the report is relative to base, with forward slashes.
export async function checkFile(file, { failOn = 'error', version = '0.0.0', limits = LIMITS, base = process.cwd(), maxAppsPerWave } = {}) {
  const full = resolve(base, file);
  let text;
  try {
    text = (await readBounded(full, limits.maxFileBytes)).toString('utf8');
  } catch (error) {
    throw new Error(`${displayPath(full, base)}: ${error.reason ?? error.message}`);
  }
  try {
    return checkText(text, full, { failOn, version, limits, path: displayPath(full, base), maxAppsPerWave });
  } catch (error) {
    throw new Error(`${displayPath(full, base)}: ${error.message}`);
  }
}
