'use strict';
/* 4Ps Forward capture helpers: score card text, capture → observed values, capture → Record-mode run. Synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const FPF = require('../engine/swdi-fpf.js');
const { FIELDS, LISTS } = require('../engine/swdi-fields.js');
const SWDI = require('../engine/swdi-engine.js');

const CARD = `SWDI Score
1.74 Level 1  Partial — 22 of 25 indicators
ES: 1.0832 | SA: 2.0632
Indicator	Dimension	Score
A Employable Skills	Economic Sufficiency	2.00/ 3
C Income	Economic Sufficiency	1.00/ 3
D1 Social Security	Economic Sufficiency	1.00/ 3
D2 Financial Institutions	Economic Sufficiency	1.00/ 3
E2 Health Condition	Health	3.00/ 3
E4 Safe Drinking Water	Health	3.00/ 3
E5 Improved Sanitation	Health	3.00/ 3
E6 Garbage Disposal	Health	3.00/ 3
F1 Functional Literacy	Education	2.00/ 3
F2 Digital Literacy	Education	2.00/ 3
F3 School Attendance	Education	1.00/ 3
G1 Roof Materials	Living Situation	2.00/ 3
G2 Wall Materials	Living Situation	2.00/ 3
G3 Housing Tenure	Living Situation	3.00/ 3
G4 Lighting Facility	Living Situation	3.00/ 3
G5 Assets	Living Situation	1.00/ 3
H1 Parenting Engagement	Role Performance	3.00/ 3
H2 Problem-Solving	Role Performance	3.00/ 3
H3 Participation in Organizations	Role Performance	1.00/ 3
I1 Children's Rights	Family Risks	2.00/ 3
I2 GBV Protection	Family Risks	3.00/ 3
I3 DRRM	Family Risks	1.00/ 3`;

test('every 4Ps Forward code maps to a distinct engine indicator', () => {
  const letters = Object.values(FPF.CODE_MAP);
  assert.equal(letters.length, 25); assert.equal(new Set(letters).size, 25);
  assert.deepEqual(letters.slice().sort(), SWDI.INDICATORS.map(d => d.code).sort());
  assert.equal(FPF.CODE_MAP.E4, 'I'); assert.equal(FPF.CODE_MAP.I2, 'X'); assert.equal(FPF.LETTER_TO_FPF.Q, 'G3');
});

test('copied score card text is read, partial indicators found, ES/SA are re-scaled values', () => {
  const r = FPF.parseScoreText(CARD);
  assert.equal(Object.keys(r.indicators).length, 22);
  assert.equal(r.indicators.D, 1); assert.equal(r.indicators.I, 3); assert.equal(r.indicators.N, 1); assert.equal(r.indicators.Y, 1);
  assert.deepEqual(r.partial, { n: 22, of: 25 }); assert.equal(r.lowb, 1); assert.equal(r.total, 1.74);
  // Shown ES/SA are raw / weight: raw total = 1.0832 × 0.3333 + 2.0632 × 0.6669 ≈ 1.74
  assert.ok(Math.abs(r.es_rescaled * 0.3333 + r.sa_rescaled * 0.6669 - 1.74) < 0.005);
  const obs = FPF.observedFromCapture({ score: r });
  assert.deepEqual(obs.missing, ['B', 'F', 'H']);
  assert.equal(obs.values.B, 'N/A'); assert.equal(obs.values.ES, 1.0832); assert.equal(obs.values.TOTAL, 1.74);
});

test('answers shown as labels, codes or "code – label" map to engine codes', () => {
  const f = v => FIELDS.find(x => x.v === v);
  assert.deepEqual(FPF.mapValue(f('roof'), '1', LISTS), { ok: true, value: 1 });
  const roofLabel = LISTS.roof['2'];
  assert.deepEqual(FPF.mapValue(f('roof'), roofLabel, LISTS), { ok: true, value: 2 });
  assert.deepEqual(FPF.mapValue(f('roof'), '2 - ' + roofLabel, LISTS), { ok: true, value: 2 });
  assert.deepEqual(FPF.mapValue({ t: 'yn' }, 'Yes', LISTS), { ok: true, value: 1 });
  assert.deepEqual(FPF.mapValue({ t: 'yn' }, 'No', LISTS), { ok: true, value: 2 });
  assert.deepEqual(FPF.mapValue({ t: 'num' }, '₱1,500.50', LISTS), { ok: true, value: 1500.5 });
  assert.deepEqual(FPF.mapValue({ t: 'chk' }, 'Yes', LISTS), { ok: true, value: 1 });
  assert.deepEqual(FPF.mapValue({ t: 'multi', list: 'digiact' }, 'Safety, Problem solving', LISTS), { ok: true, value: '4;5' });
  assert.equal(FPF.mapValue(f('roof'), 'Something new', LISTS).ok, false);
  assert.deepEqual(FPF.mapValue({ t: 'sel', list: 'reln' }, 'Household Head', LISTS), { ok: true, value: 1 });
});

test('a full capture becomes a gradable Record-mode run; encode/decode round trip', () => {
  const cap = { kind: 'swdi-4psf-capture', v: 1, capturedAt: '2026-11-11T02:00:00Z', env: 'Preprod load test', url: 'https://example.invalid/r/1',
    hhid: '1300000000001', interviewDate: '2026-10-28T04:43:56', score: FPF.parseScoreText(CARD),
    members: [{ memberIndex: 1, name: 'DELA CRUZ, ANA', age: 41, status: 'active' }, { memberIndex: 2, name: 'DELA CRUZ, BEN', age: 15, status: 'active' },
      { memberIndex: 3, name: 'DELA CRUZ, CARLO', age: 20, status: 'moved-out', excluded: true }],
    answers: [{ scope: 'household', memberIndex: 0, code: 'roof', value: '1' }, { scope: 'household', memberIndex: 0, code: 'interview_date', value: '2026-10-28' },
      { scope: 'member', memberIndex: 1, code: 'sex', value: 'Female' }, { scope: 'member', memberIndex: 1, code: 'reln', value: 'Household Head' },
      { scope: 'member', memberIndex: 2, code: 'reln', value: 'Son' }, { scope: 'member', memberIndex: 2, code: 'sickind', value: 'No' },
      { scope: 'household', memberIndex: 0, code: 'wall', value: 'Mystery material' }] };
  const x = FPF.captureToRun(cap, FIELDS, LISTS);
  assert.equal(x.fam, '1300000000001'); assert.equal(x.date, '2026-10-28');
  assert.equal(x.roster.length, 3); assert.equal(x.roster[0].reln, 1); assert.equal(x.roster[0].sex, 2); assert.equal(x.roster[1].reln, 3); assert.equal(x.roster[2].status, 3);
  assert.equal(x.values.hh.roof, 1); assert.equal(x.values.m[2].sickind, 2);
  assert.equal(x.unmapped.length, 1); assert.equal(x.unmapped[0].code, 'wall');
  const out = SWDI.score({ hh: x.values.hh, members: x.roster.map(r => Object.assign({ no: r.no, name: r.name, age: r.age, status: r.status }, x.values.m[r.no])) }, { thresholds: { food: 2053, poverty: 2647 } });
  assert.equal(typeof out.total, 'number');
  const back = FPF.decode('#cap=' + FPF.encode(cap));
  assert.deepEqual(back, cap);
  assert.throws(() => FPF.decode(FPF.encode({ kind: 'other' })), /Not a 4Ps Forward capture/);
});

test('the extension ships the same helpers as the web app', () => {
  const a = fs.readFileSync(path.join(__dirname, '../engine/swdi-fpf.js'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '../extension/lib/swdi-fpf.js'), 'utf8');
  assert.equal(a, b, 'run npm run build to refresh extension/lib/swdi-fpf.js');
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/manifest.json'), 'utf8'));
  assert.deepEqual(m.host_permissions, ['https://4ps-dp-preprod.dswd.gov.ph/*', 'https://4ps-dp-preprod-loadtest.dswd.gov.ph/*']);
  assert.ok(!m.permissions.includes('tabs') && !m.permissions.includes('<all_urls>'));
});
