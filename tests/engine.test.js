'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine/swdi-engine.js');
const PL = require('../engine/swdi-planner.js');
const F = require('../engine/swdi-fields.js');
const SC = require('../engine/swdi-scenarios.js');

const W = {}; E.INDICATORS.forEach(d => { W[d.code] = d.w; });
const sum = lv => Object.entries(lv).reduce((s, [c, l]) => s + l * W[c], 0);
const close = (a, b, t = 1e-4) => assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);
const TH = { food: 2053, poverty: 2647 };
const person = (no, age, ov) => Object.assign({ no, age, status: 1 }, PL.memberDefaults({ age }), ov || {});
const hh = (members, ov) => ({ hh: Object.assign(PL.hhDefaults(), ov || {}), members });

test('weights: ES 0.3333 and SA 0.6669', () => {
  close(E.INDICATORS.filter(d => d.dim === 'ES').reduce((s, d) => s + d.w, 0), 0.3333);
  close(E.INDICATORS.filter(d => d.dim === 'SA').reduce((s, d) => s + d.w, 0), 0.6669);
});

test('Manual worked example: raw ES 0.4027, raw SA 1.6834, total 2.0861', () => {
  const es = sum({ A: 2, B: 2, C: 1, D: 1, E: 2 });
  const sa = sum({ F: 3, G: 2, H: 3, I: 3, J: 3, K: 2, L: 2, M: 1, N: 3, O: 3, P: 3, Q: 2, R: 3, S: 2, T: 3, U: 3, V: 2, W: 3, X: 3, Y: 2 });
  close(es, 0.4027); close(sa, 1.6834); close(es + sa, 2.0861);
});

test('Manual-entry comparison sheet: ES 0.96750 / SA 1.78845 / total 2.75595, re-scaled 2.90279 / 2.68174', () => {
  const es = sum({ A: 2, B: 3, C: 3, D: 3, E: 2 });
  const sa = sum({ F: 3, G: 3, H: 2.5, I: 3, J: 3, K: 2, L: 3, M: 2.2, N: 3, O: 2, P: 2, Q: 3, R: 3, S: 3, T: 1, U: 3, V: 1, W: 2, X: 3, Y: 1 });
  close(es, 0.9675, 1e-6); close(sa, 1.78845, 1e-6); close(es + sa, 2.75595, 1e-6);
  close(es / E.ES_W, 2.90279); close(sa / E.SA_W, 2.68174);
});

test('Sample 1 income: wages 24,000 + entrepreneurial 6,000 + imputed rent 5,000/month, 3 members → PCI 2,500 → Level 2', () => {
  const ms = [person(1, 66, { workind: 1, jstatus: 1, entrep_income: 6000 }), person(2, 18, { workind: 1, jstatus: 2, wagcshm: 24000 }), person(3, 18, { pantawidcsh: 3600 })];
  const r = E.score(hh(ms, { imprnt: 5000 }), { thresholds: TH });
  assert.equal(r.indicators.C.level, 2);
  assert.match(r.indicators.C.why, /PCI ₱2,500/);
});

test('Sample 1 literacy: the 66-year-old is excluded (coverage 5-64)', () => {
  const ms = [person(1, 66, { literacy_read: 2, literacy_write: 2, literacy_count: 2, literacy_understand: 2 }), person(2, 18), person(3, 18, { literacy_understand: 2 })];
  const r = E.score(hh(ms), { thresholds: TH });
  assert.equal(r.indicators.L.members[0].level, null);
  close(r.indicators.L.level, 2.5);
});

test('No member aged 0-17 → children\'s rights not applicable; 18-year-olds still count for nutrition', () => {
  const r = E.score(hh([person(1, 66), person(2, 18), person(3, 18)]), { thresholds: TH });
  assert.equal(r.indicators.W.level, null);
  assert.equal(r.indicators.H.level, 3);
});

test('rule conflicts between target and Stata as written', () => {
  const roof = E.scoreBoth(hh([person(1, 40)], { roof: 5, location: 1 }), { thresholds: TH });
  assert.equal(roof.target.indicators.O.level, 1); assert.equal(roof.stata.indicators.O.level, 2);
  const lit = E.scoreBoth(hh([person(1, 40), person(2, 7, { literacy_read: 2, literacy_write: 2, literacy_count: 2 })]), { thresholds: TH });
  assert.equal(lit.target.indicators.L.members[1].level, 1); assert.equal(lit.stata.indicators.L.members[1].level, 2);
  const drrm = E.scoreBoth(hh([person(1, 40)], { emersavings: 2 }), { thresholds: TH });
  assert.equal(drrm.target.indicators.Y.level, 3); assert.equal(drrm.stata.indicators.Y.level, null);
  const fin = E.scoreBoth(hh([person(1, 40, { insurance: 1 }), person(2, 38, { finance_acct: 1 })]), { thresholds: TH });
  assert.equal(fin.target.indicators.E.level, 3); assert.equal(fin.stata.indicators.E.level, 2);
});

test('family aggregation: health condition takes the worst member, social security the best', () => {
  const r = E.score(hh([person(1, 40, { sickind: 1, confine: 1 }), person(2, 38, { sssind: 1, sss_months: 30 })]), { thresholds: TH });
  assert.equal(r.indicators.G.level, 1);
  assert.equal(r.indicators.D.level, 3);
});

test('every member level carries a criterion trail', () => {
  const r = E.score(hh([person(1, 40), person(2, 12), person(3, 3)]), { thresholds: TH });
  E.INDICATORS.forEach(d => {
    const x = r.indicators[d.code];
    assert.ok(x.why && x.why.length > 5, d.code + ' family why');
    (x.members || []).forEach(m => assert.ok(m.why, d.code + ' member why'));
  });
});

test('planner: a 4-member household plan hits many uncovered scenarios and stays scoreable', () => {
  const roster = [{ no: 1, name: 'A', age: 42 }, { no: 2, name: 'B', age: 44 }, { no: 3, name: 'C', age: 12 }, { no: 4, name: 'D', age: 4 }];
  const p = PL.plan(roster, SC.map(s => s.id), TH);
  const hits = new Set(); p.targets.forEach(t => t.scenarios.forEach(s => hits.add(s)));
  assert.ok(hits.size > 60, 'hits ' + hits.size);
  const r = E.score(p.household, { thresholds: TH });
  assert.notEqual(r.indicators.C.level, null);
});

test('forms cover every variable the engine reads', () => {
  const vars = new Set(F.FIELDS.map(f => f.v));
  ['roof', 'wall', 'location', 'gida', 'water', 'water_dist', 'toil', 'toil_shared', 'garbage', 'tenur', 'imprnt', 'light', 'gvbind', 'gvb_action', 'disastkit', 'disasplan', 'emersavings',
    'educind', 'gradel', 'educal', 'schattendance', 'literacy_read', 'literacy_understand', 'internet', 'digiact', 'orgmem', 'orgact1', 'orgofficer1', 'skills_n', 'regskill1', 'workind', 'jobind',
    'jstatus', 'avail', 'willing', 'wagcshm', 'entrep_income', 'other_income', 'pantawidcsh', 'sssind', 'sss_months', 'gsisind', 'gsis_months', 'insurance', 'finance_acct', 'savings',
    'stuntingind', 'overweightind', 'vaccine', 'sickind', 'confine', 'avail_med', 'ynotavail_med', 'birthreg', 'childlabor_yes', 'ofw'].forEach(v => assert.ok(vars.has(v), v));
});
