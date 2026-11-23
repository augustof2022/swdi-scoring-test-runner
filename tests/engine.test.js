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

test('annual rent and monthly other income use the selected period exactly once', () => {
  const members = [person(1, 30, { wagcshm: 36000, entrep_income: 12000, other_income: 1000, other_period: 1 })];
  const annual = E.scoreBoth(hh(members, { imprnt: 24000, imprnt_period: 2 }), { thresholds: TH });
  const monthly = E.scoreBoth(hh(members, { imprnt: 2000 }), { thresholds: TH });
  assert.equal(annual.target.indicators.C.detail, monthly.target.indicators.C.detail);
  assert.match(annual.target.indicators.C.why, /₱84,000 total annual income/);
  assert.match(annual.target.indicators.C.why, /PCI ₱7,000/);
  assert.match(annual.stata.indicators.C.why, /PCI ₱5,000/);
});

test('occupation NONE distinguishes a reason code from the old has-job flag', () => {
  const members = [person(1, 28, { occup_s: 999, jobind: 1, avail: 1, willing: 1 }),
    person(2, 32, { occup_s: 5220, worked_last_week: 2, workind: 1, jstatus: 2 }), person(3, 12)];
  const b = E.score(hh(members)).indicators.B;
  assert.deepEqual(b.members.map(m => m.level), [1, 2, null]);
  assert.equal(b.level, 1.5);
  assert.match(b.why, /3 ÷ 2 = 1.5/);
  const legacy = E.score(hh([person(1, 28, { workind: 2, jobind: 1, jstatus: 1 })])).indicators.B;
  assert.equal(legacy.level, 3);
});

test('guided planning supplies annual income for every worker, including a multi-earner family', () => {
  const roster = [19, 32, 48].map((age, i) => ({ no: i + 1, age }));
  const p = PL.plan(roster, [], TH);
  assert.deepEqual(p.household.members.map(m => m.workind), [1, 2, 1]);
  for (const m of p.household.members) {
    assert.ok((m.workind === 1 ? m.wagcshm : m.entrep_income) > 0);
  }
  const total = p.household.members.reduce((acc, m) => acc + (m.wagcshm || 0) + (m.entrep_income || 0), 0);
  assert.equal(total, Math.floor(TH.food / 2 * 12 * roster.length));
});

test('financial access explains who qualifies the family for each level', () => {
  const members = [person(1, 21, { name: 'Ana', insurance: 1, finance_acct: 1 }),
    person(2, 15, { name: 'Ben', finance_acct: 1 }), person(3, 14, { name: 'Cam', savings: 1 }),
    person(4, 42, { name: 'Dee', savings: 1, status: 3 })];
  const result = () => E.scoreBoth(hh(members), { thresholds: TH });
  const e = result().target.indicators.E;
  assert.equal(e.level, 3);
  assert.match(e.why, /Ana, Ben each have/);
  assert.match(e.members[0].why, /Insurance: Yes · Financial account: Yes · Savings: No/);
  assert.match(e.members[2].contribution, /requires age 15/);
  assert.match(e.members[3].contribution, /moved out/);
  members[1].finance_acct = 2;
  assert.match(result().target.indicators.E.why, /Level 2.*Ana is the only member/);
  members[0].finance_acct = members[0].insurance = 2;
  assert.equal(result().target.indicators.E.level, 1);
  members[1].savings = 1;
  assert.match(result().target.indicators.E.why, /Family Level 3. Ben has savings/);
});

test('participation gives two members Level 2 until officer or activity counts qualify for Level 3', () => {
  const members = [person(1, 15, { name: 'Ana', orgmem: 1, orgact1: 2, orgofficer1: 2 }),
    person(2, 40, { name: 'Ben', orgmem: 1, orgact1: 2, orgofficer1: 2 }),
    person(3, 14, { orgofficer1: 1 }), person(4, 35, { status: 3, orgact1: 1 })];
  const v = () => E.score(hh(members)).indicators.V;
  const r = v();
  assert.equal(r.level, 2);
  assert.equal(r.weighted, 0.0186);
  assert.match(r.why, /Ana, Ben count toward membership/);
  assert.match(r.members[0].why, /Member: Yes · Participated: No · Officer\/volunteer: No/);
  assert.match(r.members[2].contribution, /15\+/);
  assert.match(r.members[3].contribution, /moved out/);
  members[0].orgact1 = 1;
  assert.equal(v().level, 2);
  members[1].orgact1 = 1;
  assert.match(v().why, /Family Level 3. Ana, Ben participated/);
  members[0].orgact1 = members[1].orgact1 = 2;
  members[1].orgofficer1 = 1;
  assert.match(v().why, /Family Level 3. Ben serves/);
  members[0].orgmem = members[1].orgmem = members[1].orgofficer1 = 2;
  assert.equal(v().level, 1);
});

test('child rights uses the lowest age-applicable child level in a mixed household', () => {
  const first = person(1, 14, { name: 'Child A', birthreg: 1, educind: 2, childlabor_yes: 1 });
  const second = person(4, 16, { name: 'Child B', birthreg: 1, educind: 1, schattendance: 3, childlabor_yes: 2 });
  const score = () => E.scoreBoth(hh([first, second]), { thresholds: TH });
  const { target, stata } = score();
  assert.deepEqual(target.indicators.W.members.map(m => [m.met, m.applicable, m.level]), [[1, 3, 1], [3, 3, 3]]);
  assert.equal(target.indicators.W.level, 1);
  assert.equal(target.indicators.W.weighted, 0.0093);
  assert.equal(stata.indicators.W.level, 2);
  first.childlabor_yes = 2;
  assert.equal(score().target.indicators.W.level, 2);
  first.educind = 1;
  first.schattendance = 3;
  assert.equal(score().target.indicators.W.level, 3);
});

test('Stata employable skills tests recorded gradel independently of educind', () => {
  const members = [1, 2, undefined].map((educind, i) => ({
    no: i + 1, age: 18 + i, educind, gradel: 34013, educal: 24014, skills_n: 0
  }));
  members.push({ no: 4, age: 40, educind: 2, gradel: 34012, educal: 34024, skills_n: 0 },
    { no: 5, age: 16, gradel: 34013, skills_n: 0 });
  const { target, stata } = E.scoreBoth(hh(members), { thresholds: TH });
  const result = stata.indicators.A;
  assert.deepEqual(result.members.map(m => m.level), [3, 3, 3, 1, null]);
  assert.equal(result.level, 2.5);
  assert.match(result.members[1].why, /gradel 34013 qualifies/);
  assert.match(result.members[3].why, /gradel 34012 does not meet/);
  assert.equal(target.indicators.A.members[3].level, 3);
});

// ---------- verdicts: ROUNDING only when the criteria are confirmed ----------
const judge = (o) => E.judgeScore(Object.assign({ code: 'A', tol: 0.01, avg: true, others: [] }, o));

test('verdicts: PASS, STATA RULE, N/A CHECK and plain FAIL', () => {
  assert.equal(judge({ obs: 2.3333, exp: 2.3333, stata: 1 }).verdict, 'PASS');
  assert.equal(judge({ obs: 1, exp: 2.3333, stata: 1 }).verdict, 'STATA RULE');
  assert.equal(judge({ obs: 2, exp: null, stata: null }).verdict, 'N/A CHECK');
  assert.equal(judge({ obs: null, exp: 2, stata: 2 }).verdict, '');
  assert.deepEqual(judge({ obs: 1.5, exp: 2.3333, stata: 2.3333 }), { verdict: 'FAIL', basis: 'mismatch' });
});

test('verdicts: ROUNDING when policy and Stata agree on the average and the platform drops the decimals', () => {
  assert.deepEqual(judge({ obs: 3, exp: 2.8333, stata: 2.8333 }), { verdict: 'ROUNDING', basis: 'rounded' });
  assert.deepEqual(judge({ obs: 2, exp: 2.8333, stata: 2.8333 }), { verdict: 'ROUNDING', basis: 'truncated' });
  // other averages on the same platform are whole numbers too: still rounding
  assert.equal(judge({ obs: 3, exp: 2.8333, stata: 2.8333, others: [{ code: 'F', obs: 2, tol: 0.01 }] }).verdict, 'ROUNDING');
  // a whole-number policy result can never be rounding; family-level indicators never round
  assert.equal(judge({ obs: 3, exp: 2, stata: 2 }).verdict, 'FAIL');
  assert.equal(judge({ obs: 3, exp: 2.8333, stata: 2.8333, avg: false }).verdict, 'FAIL');
  // ceiling of a low average is not rounding
  assert.equal(judge({ obs: 3, exp: 2.3333, stata: 2.3333 }).verdict, 'FAIL');
});

test('verdicts: a whole number is not ROUNDING when the policy and Stata criteria disagree', () => {
  const r = judge({ obs: 2, exp: 2.3333, stata: 1 });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.basis, 'criteria_disputed');
  assert.equal(judge({ obs: 2, exp: 2.3333, stata: null }).basis, 'criteria_disputed');
});

test('verdicts: a whole number is not ROUNDING when the platform keeps decimals on other averages', () => {
  const r = judge({ obs: 3, exp: 2.8333, stata: 2.8333, others: [{ code: 'L', obs: 2.6667, tol: 0.01 }, { code: 'F', obs: 3, tol: 0.01 }] });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.basis, 'keeps_decimals');
  assert.deepEqual(r.decimals.map(o => o.code), ['L']);
});

test('verdicts: employable skill case (policy 2.3333, Stata 1.0000, 4Ps Forward 2.0000) is FAIL, not ROUNDING', () => {
  const members = [
    { no: 1, name: 'RAIZEN GREEN', age: 6, skills_n: 0 },
    { no: 2, name: 'RAIZEN BLUE', age: 13, skills_n: 0 },
    { no: 3, name: 'RHED LORKHAN', age: 18, educind: 1, gradel: 34012, skills_n: 0 },
    { no: 4, name: 'RUBY ANN', age: 38, educind: 2, educal: 40001, skills_n: 0 },
    { no: 5, name: 'RICHIE', age: 40, educind: 2, educal: 50002, skills_n: 0 }
  ].map(m => Object.assign({ status: 1 }, m));
  const { target, stata } = E.scoreBoth(hh(members), { thresholds: TH });
  close(target.indicators.A.level, 7 / 3);
  assert.equal(stata.indicators.A.level, 1);
  const r = E.judgeScore({ code: 'A', obs: 2, exp: target.indicators.A.level, stata: stata.indicators.A.level, tol: 0.01, avg: true });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.basis, 'criteria_disputed');
  // no mix of the two rules' member levels gives 2.0: the platform counts or grades members another way
  assert.equal(E.memberMixFor(target.indicators.A, stata.indicators.A, 2, 0.01), null);
  // 1.6667 is reproduced by grading one of M4 / M5 by the Stata rule
  const mix = E.memberMixFor(target.indicators.A, stata.indicators.A, 5 / 3, 0.01);
  assert.equal(mix.switched.length, 1);
  assert.deepEqual([mix.switched[0].from, mix.switched[0].to], [3, 1]);
});
