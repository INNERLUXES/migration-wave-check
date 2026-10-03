// The checks. Each one reads the plan as data and reports what the plan itself shows. docs/method.md gives the reason
// behind every finding and says what each check can and cannot see. Nothing here opens a connection or runs a program.
// A finding names applications by their id, and waves and numbers by their value; the text of a rollback, a test plan,
// an owner or a name is never copied into a finding.

import { EMPTY_WORDS, FACTS, FIELDS, MAX_TTL, MOVING, NO_WORDS, STRATEGIES, STRATEGY_ALIASES, YES_WORDS, factPage } from './data.js';
import { PLAN_LIMITS } from './plan.js';

export const SEVERITIES = ['error', 'warning', 'info'];
export const RANK = { error: 0, warning: 1, info: 2 };

// The areas a report is grouped by, in report order.
export const AREAS = [
  { id: 'inventory', title: 'Inventory' },
  { id: 'dependencies', title: 'Dependencies' },
  { id: 'cutover', title: 'Cutover readiness' },
  { id: 'waves', title: 'Waves' }
];

// Every finding, in report order within a severity. facts are the keys of the sentences of src/data.js that the finding
// quotes; the page of the first one is the finding's source.
export const FINDINGS = [
  { id: 'duplicate-id', severity: 'error', area: 'inventory', what: 'Two applications have the same id', facts: ['uniqueId'] },
  { id: 'value-invalid', severity: 'error', area: 'inventory', what: 'A value cannot be read: an id, a wave, a yes or no, a number of seconds or minutes, or a limit', facts: ['planTable'] },
  { id: 'strategy-unknown', severity: 'error', area: 'inventory', what: 'The strategy is not one of the seven: retire, retain, rehost, relocate, repurchase, replatform, refactor', facts: ['sevenRs', 'strategyDefinition'] },
  { id: 'wave-missing', severity: 'error', area: 'inventory', what: 'An application that moves has no wave', facts: ['planDefinition'] },
  { id: 'dependency-unknown', severity: 'error', area: 'dependencies', what: 'depends_on names an id that is not in the plan', facts: ['mapDependencies'] },
  { id: 'dependency-cycle', severity: 'error', area: 'dependencies', what: 'Applications depend on each other in a loop', facts: ['directTogether'] },
  { id: 'dependency-later-wave', severity: 'error', area: 'dependencies', what: 'An application moves in an earlier wave than an application it depends on', facts: ['dependenciesTogether', 'sameWave'] },
  { id: 'retire-with-dependents', severity: 'error', area: 'dependencies', what: 'An application that is not retired depends on an application planned for retire', facts: ['retireShutDown', 'dependenciesTogether'] },
  { id: 'no-rollback', severity: 'error', area: 'cutover', what: 'An application that moves has no rollback plan', facts: ['rollbackBefore', 'rollbackPurpose'] },
  { id: 'stateful-no-data-sync', severity: 'error', area: 'cutover', what: 'A stateful application that moves names no data sync method', facts: ['nearZeroSync', 'downtimeSync'] },
  { id: 'strategy-missing', severity: 'warning', area: 'inventory', what: 'An application has no strategy', facts: ['strategyDefinition'] },
  { id: 'no-owner', severity: 'warning', area: 'inventory', what: 'An application has no owner', facts: ['workloadOwner'] },
  { id: 'no-test-plan', severity: 'warning', area: 'cutover', what: 'An application that moves has no test plan', facts: ['endToEnd'] },
  { id: 'dns-ttl-longer-than-window', severity: 'warning', area: 'cutover', what: 'The DNS TTL is longer than the cutover window', facts: ['ttlField', 'dnsCutover'] },
  { id: 'wave-over-limit', severity: 'warning', area: 'waves', what: 'A wave holds more applications than the limit of the plan', facts: ['waveDefinition', 'waveCapacity'] },
  { id: 'dependency-cross-environment', severity: 'info', area: 'dependencies', what: 'A dependency between an application that moves and one that is retained crosses the two environments', facts: ['retainDefinition', 'splitTime'] },
  { id: 'wave-summary', severity: 'info', area: 'waves', what: 'One line per wave: how many applications it holds, by strategy, and how many are stateful', facts: ['waveBatches'] }
];

const BY_ID = Object.fromEntries(FINDINGS.map((f) => [f.id, f]));
export const ORDER = Object.fromEntries(FINDINGS.map((f, i) => [f.id, i]));
export const BY_ID_SEVERITY = Object.fromEntries(FINDINGS.map((f) => [f.id, f.severity]));
export const AREA_ORDER = Object.fromEntries(AREAS.map((a, i) => [a.id, i]));

// Control characters (C0 and C1), the line and paragraph separators and the Unicode direction controls, built from
// their code points so that this file holds only ASCII.
const span = (a, b) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const UNSAFE_CHARACTERS = new RegExp(`[${span(0, 0x1f)}${span(0x7f, 0x9f)}${[0x200e, 0x200f, 0x2028, 0x2029].map((c) => String.fromCharCode(c)).join('')}${span(0x202a, 0x202e)}${span(0x2066, 0x2069)}]`, 'g');

// Text from the input: control, line separator and direction characters replaced by a space, length capped.
export function safeText(value, max = 300) {
  const s = String(value).slice(0, max * 4).replace(UNSAFE_CHARACTERS, ' ');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

export function meetsThreshold(severity, failOn) {
  return RANK[severity] <= RANK[failOn];
}

// ---- reading one value ------------------------------------------------------------------------------------------------

const EMPTY = new Set(EMPTY_WORDS);
const YES = new Set(YES_WORDS);
const NO = new Set(NO_WORDS);

// The strategy name as the plan writes it, in lower case, with re-architect read as refactor; '' when it is empty.
export function strategyOf(value) {
  const s = String(value).slice(0, 60).trim().toLowerCase();
  return Object.hasOwn(STRATEGY_ALIASES, s) ? STRATEGY_ALIASES[s] : s;
}

// A text cell: { ok, filled }. A text made only of one of the empty words counts as empty.
export function textOf(f) {
  if (!f.present) return { ok: true, filled: false };
  if (typeof f.value !== 'string') return { ok: false, filled: false };
  return { ok: true, filled: !EMPTY.has(f.value.slice(0, 20).trim().toLowerCase()) };
}

// A whole number between min and max, written as a number or as digits; null when it is not one.
export function wholeOf(value, min, max) {
  let n = null;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^[0-9]{1,12}$/.test(value.trim())) n = Number(value.trim());
  return n !== null && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// A number between 0 and max with at most four decimals; null when it is not one.
export function numberOf(value, max) {
  let n = null;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^[0-9]{1,9}(?:\.[0-9]{1,4})?$/.test(value.trim())) n = Number(value.trim());
  return n !== null && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

// true, false, or null when the value is not a yes or a no.
export function yesNoOf(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
  if (typeof value !== 'string') return null;
  const s = value.slice(0, 10).trim().toLowerCase();
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return null;
}

export const MAX_WAVE = 999_999;
export const MAX_WINDOW_MINUTES = 1_000_000;
export const MAX_LIMIT = 100_000;

// ---- the run ----------------------------------------------------------------------------------------------------------

// options.maxAppsPerWave: a limit given on the command line, which replaces the plan's own.
export function runRules(parsed, limits = PLAN_LIMITS, options = {}) {
  const found = [];
  const facts = { applications: 0, moving: 0, retained: 0, retired: 0, waves: 0, limit: null, statefulUnknown: 0, omitted: {} };

  const basisOf = (keys) => keys.map((k) => ({ text: FACTS[k].text, section: FACTS[k].section, source: factPage(k) }));
  const sortKey = new Map(); // a finding about a wave is sorted by the number of the wave
  function add(id, place, subject, message, fix, basis = BY_ID[id].facts) {
    const def = BY_ID[id];
    const f = {
      id,
      severity: def.severity,
      area: def.area,
      where: safeText(place.where, 400),
      line: place.line,
      subject: safeText(subject, 200),
      message: safeText(message, 900),
      fix: safeText(fix, 500),
      basis: basisOf(basis),
      source: factPage(basis[0])
    };
    found.push(f);
    return f;
  }
  const q = (id) => `"${safeText(id, 80)}"`;
  const invalid = (place, subject, what, expected, basis = ['planTable']) => {
    add('value-invalid', place, subject, `${what} is not ${expected}, so the checks that need it were skipped for it.`, `Write ${expected}.`, basis);
  };

  for (const p of parsed.problems) add('value-invalid', p, p.subject, p.message, p.fix);

  // ---- every application: its id and its fields ----
  const apps = parsed.apps.map((a) => {
    const idField = a.field(FIELDS.id);
    let id = '';
    if (idField.present && typeof idField.value === 'string') id = idField.value.trim();
    else if (idField.present && typeof idField.value === 'number' && Number.isInteger(idField.value)) id = String(idField.value);
    const label = id !== '' ? `the application ${q(id)}` : `the application at ${a.at.where}`;
    const Label = label[0].toUpperCase() + label.slice(1);
    const subject = id !== '' ? id : a.at.where;
    if (!idField.present) add('value-invalid', idField, subject, `${Label} has no id, so no other application can name it in depends_on and the findings cannot name it.`, 'Give the application a short id that is unique in the plan.', ['uniqueId']);
    else if (id === '') invalid(idField, subject, `The id of ${label}`, 'a text or a whole number', ['uniqueId']);
    return { a, id, idField, label, Label, subject };
  });

  // ---- duplicate ids: the first one counts, every other one is reported ----
  const byId = new Map();
  for (const app of apps) {
    if (app.id === '') continue;
    const first = byId.get(app.id);
    if (first) {
      add('duplicate-id', app.idField, app.id, `The id ${q(app.id)} is used again: ${first.idField.where} (line ${first.idField.line}) has it already. A dependency on it cannot tell which application is meant, so only the first one is used for the dependency checks.`,
        'Give every application its own id.');
    } else byId.set(app.id, app);
  }

  // ---- strategy, wave and the other fields ----
  for (const app of apps) {
    const { a, label, Label, subject } = app;
    const sField = a.field(FIELDS.strategy);
    app.strategy = null;
    if (!sField.present) {
      add('strategy-missing', sField, subject, `${Label} has no strategy, so the tool cannot tell whether it moves, stays or is retired, and the cutover and wave checks were skipped for it.`, 'Choose one of the seven strategies for the application: retire, retain, rehost, relocate, repurchase, replatform or refactor.');
    } else if (typeof sField.value !== 'string') {
      invalid(sField, subject, `The strategy of ${label}`, 'one of the seven strategy names', ['sevenRs']);
    } else {
      const s = strategyOf(sField.value);
      if (Object.hasOwn(STRATEGIES, s)) app.strategy = s;
      else add('strategy-unknown', sField, subject, `The strategy "${safeText(sField.value.trim(), 40)}" of ${label} is not one of the seven (retire, retain, rehost, relocate, repurchase, replatform, refactor), so the cutover and wave checks were skipped for it.`, 'Use one of the seven names.');
    }
    app.moving = MOVING.includes(app.strategy);
    if (app.moving) facts.moving += 1;
    if (app.strategy === STRATEGIES.retain) facts.retained += 1;
    if (app.strategy === STRATEGIES.retire) facts.retired += 1;

    const wField = a.field(FIELDS.wave);
    app.waveField = wField;
    app.wave = null;
    if (wField.present) {
      app.wave = wholeOf(wField.value, 0, MAX_WAVE);
      if (app.wave === null) invalid(wField, subject, `The wave of ${label}`, `a whole number from 0 to ${MAX_WAVE}`, ['planDefinition']);
    } else if (app.moving) {
      add('wave-missing', wField, subject, `${Label} moves (${app.strategy}) and has no wave, so it has no place in the order of the plan and its dependencies cannot be checked.`, 'Give the application the number of the wave in which it moves.');
    }
    // A retained application stays where it is; a wave written for it is not used.
    if (app.strategy === STRATEGIES.retain) app.wave = null;
    app.where = app.moving ? `${app.strategy}${app.wave !== null ? `, wave ${app.wave}` : ''}` : app.strategy ?? 'no strategy';

    const oField = a.field(FIELDS.owner);
    const owner = textOf(oField);
    if (!owner.ok) invalid(oField, subject, `The owner of ${label}`, 'a text');
    else if (!owner.filled) add('no-owner', oField, subject, `${Label} has no owner, so nobody is named to approve its cutover, its rollback or its retirement.`, 'Name the team or the person who owns the application.');

    const stField = a.field(FIELDS.stateful);
    app.stateful = null;
    if (stField.present) {
      app.stateful = yesNoOf(stField.value);
      if (app.stateful === null) invalid(stField, subject, `The stateful value of ${label}`, 'yes or no (true, false, yes, no, y, n, 1 or 0)');
    } else if (app.moving) facts.statefulUnknown += 1;

    const texts = {};
    for (const key of ['dataSync', 'rollback', 'testPlan']) {
      const f = a.field(FIELDS[key]);
      const t = textOf(f);
      if (!t.ok) invalid(f, subject, `The ${FIELDS[key]} of ${label}`, 'a text');
      texts[key] = { ...t, place: f };
    }

    const ttlField = a.field(FIELDS.dnsTtl);
    let ttl = null;
    if (ttlField.present) {
      ttl = wholeOf(ttlField.value, 0, MAX_TTL);
      if (ttl === null) invalid(ttlField, subject, `The DNS TTL of ${label}`, `a whole number of seconds from 0 to ${MAX_TTL}`, ['ttlRange']);
    }
    const winField = a.field(FIELDS.cutoverWindow);
    let windowMinutes = null;
    if (winField.present) {
      windowMinutes = numberOf(winField.value, MAX_WINDOW_MINUTES);
      if (windowMinutes === null) invalid(winField, subject, `The cutover window of ${label}`, `a number of minutes from 0 to ${MAX_WINDOW_MINUTES}`);
    }

    if (!app.moving) continue;
    if (texts.rollback.ok && !texts.rollback.filled) {
      add('no-rollback', texts.rollback.place, subject, `${Label} (${app.where}) has no rollback plan, so if the cutover fails nothing written says how to go back or when to decide it.`, 'Write the rollback steps, and the condition that starts them, in the rollback field.');
    }
    if (texts.testPlan.ok && !texts.testPlan.filled) {
      add('no-test-plan', texts.testPlan.place, subject, `${Label} (${app.where}) has no test plan, so nothing says how the team will know that the application works after the move.`, 'Write the tests that prove the application works after the cutover, for example end-to-end tests of its main business flows, in the test_plan field.');
    }
    if (app.stateful === true && texts.dataSync.ok && !texts.dataSync.filled) {
      add('stateful-no-data-sync', texts.dataSync.place, subject, `${Label} (${app.where}) is stateful and names no data sync method, so nothing says how its data reaches the new environment and stays current until the cutover.`, 'Name the method in data_sync (for example replication or backup-restore), and say how writes are paused at the cutover.');
    }
    if (ttl !== null && windowMinutes !== null && ttl > windowMinutes * 60) {
      add('dns-ttl-longer-than-window', ttlField, subject, `The DNS TTL of ${label} is ${ttl.toLocaleString('en-US')} seconds and its cutover window is ${windowMinutes.toLocaleString('en-US')} minutes (${(windowMinutes * 60).toLocaleString('en-US')} seconds). A resolver may keep the old address for as long as the TTL, so clients can still reach the old environment after the window has closed.`,
        'Lower the TTL to the length of the window or less, and do it at least one old TTL before the cutover starts.');
    }
  }
  facts.applications = apps.length;

  // ---- dependencies ----
  const edges = new Map(); // app -> [target app]
  let edgeCount = 0;
  for (const app of apps) {
    const list = app.a.list(FIELDS.dependsOn);
    if (list.length > limits.maxDependsPerApp) throw new Error(`${app.a.at.where}: more than ${limits.maxDependsPerApp.toLocaleString('en-US')} entries in ${FIELDS.dependsOn}`);
    const targets = [];
    const seen = new Set();
    for (const entry of list) {
      let dep = null;
      if (typeof entry.value === 'string') dep = entry.value.trim();
      else if (typeof entry.value === 'number' && Number.isInteger(entry.value)) dep = String(entry.value);
      if (dep === null) {
        invalid(entry, app.subject, `An entry of the ${FIELDS.dependsOn} of ${app.label}`, 'an application id (a text)');
        continue;
      }
      if (dep === '' || seen.has(dep)) continue;
      seen.add(dep);
      edgeCount += 1;
      if (edgeCount > limits.maxDependencies) throw new Error(`more than ${limits.maxDependencies.toLocaleString('en-US')} dependencies`);
      const target = byId.get(dep);
      if (!target) {
        add('dependency-unknown', entry, app.subject, `${app.Label} depends on ${q(dep)}, which is not an id in this plan, so nothing says where or when that dependency moves.`, `Add ${q(dep)} to the plan (with the strategy retain if it does not move), or correct the id.`);
        continue;
      }
      targets.push(target);
      if (target === app || app.strategy === STRATEGIES.retire || app.strategy === null || target.strategy === null) continue;
      if (target.strategy === STRATEGIES.retire) {
        add('retire-with-dependents', entry, app.subject, `${app.Label} (${app.where}) depends on ${q(target.id)}, which is planned for retire. When ${q(target.id)} is shut down, ${q(app.id)} loses something it needs.`,
          `Remove the dependency first (replace or move what ${q(app.id)} uses), or do not retire ${q(target.id)} while something depends on it.`);
      } else if (app.moving && target.strategy === STRATEGIES.retain) {
        add('dependency-cross-environment', entry, app.subject, `${app.Label} moves (${app.where}) and depends on ${q(target.id)}, which is retained in the source environment. After the move this link crosses from the new environment to the old one. This is not an error; it is a link to plan for.`,
          `Plan the link across both environments (network path, latency, firewall rules and who owns it), and write down when ${q(target.id)} will move, if ever.`);
      } else if (app.strategy === STRATEGIES.retain && target.moving) {
        add('dependency-cross-environment', entry, app.subject, `${app.Label} is retained in the source environment and depends on ${q(target.id)}, which moves (${target.where}). After that move this link crosses from the old environment to the new one. This is not an error; it is a link to plan for.`,
          `Plan the link across both environments (network path, latency, firewall rules and who owns it) for as long as ${q(app.id)} stays behind.`);
      } else if (app.moving && target.moving && app.wave !== null && target.wave !== null && app.wave < target.wave) {
        add('dependency-later-wave', entry, app.subject, `${app.Label} moves in wave ${app.wave} and depends on ${q(target.id)}, which moves later, in wave ${target.wave}. Between the two waves ${q(app.id)} runs in the new environment and calls back to the old one, or does not work at all.`,
          `Move ${q(target.id)} in wave ${app.wave} or earlier, or move ${q(app.id)} in wave ${target.wave} with it.`);
      }
    }
    edges.set(app, targets);
  }

  // Loops: the strongly connected components of the dependency graph (Tarjan), walked with a list instead of recursion
  // so that a long chain cannot overflow the stack. A component of more than one application, or an application that
  // names itself, is a loop.
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  let counter = 0;
  const loops = [];
  for (const start of byId.values()) {
    if (index.has(start)) continue;
    const work = [[start, 0]];
    index.set(start, counter);
    low.set(start, counter);
    counter += 1;
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const top = work[work.length - 1];
      const [v, i] = top;
      const next = edges.get(v) ?? [];
      if (i < next.length) {
        top[1] += 1;
        const w = next[i];
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter += 1;
          stack.push(w);
          onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(v)));
      }
      if (low.get(v) === index.get(v)) {
        const component = [];
        let w;
        do {
          w = stack.pop();
          onStack.delete(w);
          component.push(w);
        } while (w !== v);
        if (component.length > 1 || (edges.get(v) ?? []).includes(v)) loops.push(component.sort((x, y) => x.a.n - y.a.n));
      }
    }
  }
  for (const loop of loops) {
    const first = loop[0];
    const names = loop.slice(0, 10).map((x) => q(x.id));
    const list = loop.length === 1 ? `The application ${names[0]} names itself in ${FIELDS.dependsOn}` : `The applications ${names.slice(0, -1).join(', ')}${loop.length > 10 ? ', ...' : ''} and ${loop.length > 10 ? `${loop.length - 9} more` : names.at(-1)} depend on each other in a loop`;
    add('dependency-cycle', first.a.field(FIELDS.dependsOn), first.id, `${list}, so no order of waves can put each one after what it needs.`,
      'Check the links and remove the one that is not real. If the applications truly need each other, plan them as one unit: one entry of the plan, in one wave.');
  }

  // ---- waves ----
  const waves = new Map(); // wave -> [app]
  for (const app of apps) {
    if (app.wave === null || (!app.moving && app.strategy !== STRATEGIES.retire)) continue;
    if (!waves.has(app.wave)) waves.set(app.wave, []);
    waves.get(app.wave).push(app);
  }
  facts.waves = waves.size;

  let limit = null; // { value, where, line, from }
  if (options.maxAppsPerWave !== undefined && options.maxAppsPerWave !== null) limit = { value: options.maxAppsPerWave, from: 'option' };
  else if (parsed.limit) {
    const v = wholeOf(parsed.limit.value, 1, MAX_LIMIT);
    if (v === null) invalid(parsed.limit, FIELDS.maxAppsPerWave, `The ${FIELDS.maxAppsPerWave} of the plan`, `a whole number from 1 to ${MAX_LIMIT}`, ['waveCapacity']);
    else limit = { value: v, where: parsed.limit.where, line: parsed.limit.line, from: 'plan' };
  }
  facts.limit = limit ? limit.value : null;
  const perWave = new Map();
  for (const w of parsed.waveLimits) {
    const wave = wholeOf(w.wave.value, 0, MAX_WAVE);
    if (wave === null) {
      invalid(w.wave, FIELDS.waves, `The ${FIELDS.wave} of an entry of ${FIELDS.waves}`, `a whole number from 0 to ${MAX_WAVE}`, ['planDefinition']);
      continue;
    }
    if (w.max.value === undefined || w.max.value === null) continue;
    const max = wholeOf(w.max.value, 1, MAX_LIMIT);
    if (max === null) invalid(w.max, `wave ${wave}`, `The ${FIELDS.maxApps} of wave ${wave}`, `a whole number from 1 to ${MAX_LIMIT}`, ['waveCapacity']);
    else if (perWave.has(wave)) invalid(w.wave, `wave ${wave}`, `A second limit for wave ${wave}`, 'one entry per wave');
    else perWave.set(wave, { value: max, where: w.max.where, line: w.max.line, from: 'wave' });
  }
  facts.waveLimits = perWave.size;

  for (const wave of [...waves.keys()].sort((x, y) => x - y)) {
    const members = waves.get(wave);
    const firstPlace = members[0].waveField;
    const byStrategy = {};
    for (const m of members) byStrategy[m.strategy] = (byStrategy[m.strategy] ?? 0) + 1;
    const parts = Object.values(STRATEGIES).filter((s) => byStrategy[s]).map((s) => `${byStrategy[s]} ${s}`);
    const stateful = members.filter((m) => m.stateful === true).length;
    const n = members.length;
    const summary = add('wave-summary', { where: `wave ${wave}`, line: firstPlace.line }, `wave ${wave}`,
      `Wave ${wave} holds ${n} ${n === 1 ? 'application' : 'applications'}: ${parts.join(', ')}; ${stateful} ${stateful === 1 ? 'is' : 'are'} stateful.`,
      'Nothing to fix; this line shows the shape of the wave.');
    sortKey.set(summary, wave);
    const own = perWave.get(wave) ?? limit;
    if (own && n > own.value) {
      const said = own.from === 'option' ? 'the limit given with --max-apps-per-wave' : own.from === 'wave' ? `the limit of wave ${wave}` : `the ${FIELDS.maxAppsPerWave} of the plan`;
      const over = add('wave-over-limit', own.from === 'option' ? { where: `wave ${wave}`, line: firstPlace.line } : { where: own.where, line: own.line }, `wave ${wave}`,
        `Wave ${wave} holds ${n} applications, and ${said} is ${own.value}. A wave that is bigger than the team planned for leaves less room to test, to fix and to roll back.`,
        `Move ${n - own.value} ${n - own.value === 1 ? 'application' : 'applications'} to another wave (keeping dependencies in order), or raise the limit if the team can carry it.`);
      sortKey.set(over, wave);
    }
  }

  // Sorted, and each finding id listed at most maxListedPerFinding times; the rest is counted in omitted.
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  found.sort((a, b) => RANK[a.severity] - RANK[b.severity] || AREA_ORDER[a.area] - AREA_ORDER[b.area] || ORDER[a.id] - ORDER[b.id] || (sortKey.get(a) ?? a.line) - (sortKey.get(b) ?? b.line) || compare(a.where, b.where) || compare(a.subject, b.subject));
  const shownPerId = {};
  const findings = [];
  for (const f of found) {
    shownPerId[f.id] = (shownPerId[f.id] ?? 0) + 1;
    if (shownPerId[f.id] <= limits.maxListedPerFinding) findings.push(f);
    else facts.omitted[f.id] = (facts.omitted[f.id] ?? 0) + 1;
  }
  return { findings, facts };
}
