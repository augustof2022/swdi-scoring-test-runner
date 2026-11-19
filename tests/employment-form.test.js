'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('../engine/swdi-fields.js');
const PL = require('../engine/swdi-planner.js');
const E = require('../engine/swdi-engine.js');

const ui = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
const start = ui.indexOf('function visible(f, rec, age) {');
const end = ui.indexOf('function ctrl(f, val, key) {', start);
assert.ok(start !== -1 && end > start, 'UI visibility function must be present');

const context = {
  S: { showAll: false },
  num(v) { return v == null || v === '' ? null : Number(v); },
  SWDI: { arr(v) { return v == null ? [] : String(v).split(';').filter(Boolean).map(Number); } }
};
vm.runInNewContext(ui.slice(start, end), context);
const employment = Object.fromEntries(F.FIELDS.filter(f => f.sec === 'Employment').map(f => [f.v, f]));
const shown = (field, age, rec = {}) => context.visible(employment[field], rec, age);

test('activity question is the only child labor prompt (ages 5-17)', () => {
  assert.match(ui, /LISTS\.childlabor\s*=\s*Object\.assign\(\{ 0: 'NONE' \}/);
  assert.equal(shown('childlabor', 4), false);
  assert.equal(shown('childlabor', 5), true);
  assert.equal(shown('childlabor', 14), true);
  assert.equal(shown('childlabor', 17), true);
  assert.equal(shown('childlabor', 18), false);
  assert.equal(shown('childlabor_yes', 12), false);
  assert.equal(F.LISTS.childlabor[1], 'Farmers and Other Plant Growers');
  assert.equal(F.LISTS.childlabor[99], 'Others');
});
test('industry, work days and weekly hours appear only after a non-NONE child labor activity', () => {
  for (const age of [5, 12, 14, 15, 17]) {
    for (const field of ['indust', 'work_hrs', 'work_tothrs']) {
      assert.equal(shown(field, age, {}), false, field + ' without answer');
      assert.equal(shown(field, age, { childlabor: 0 }), false, field + ' with NONE');
      assert.equal(shown(field, age, { childlabor: 1 }), true, field + ' with selected activity');
      assert.equal(shown(field, age, { childlabor: 99 }), true, field + ' with Others');
    }
  }
  assert.equal(shown('indust', 18, { childlabor: 1 }), false);
  assert.equal(shown('work_tothrs', 19, { childlabor: 1 }), false);
});
test('PSOC employment questions start at 15; no-occupation questions need PSOC NONE', () => {
  for (const field of ['occup_s', 'workind', 'jobind', 'avail', 'willing', 'jstatus', 'worked_last_week']) {
    assert.equal(shown(field, 14, { occup_s: 999 }), false, field);
  }
  for (const age of [15, 17, 18, 33]) {
    assert.equal(shown('occup_s', age), true);
    for (const f of ['jobind', 'avail', 'willing']) {
      assert.equal(shown(f, age, { occup_s: 999 }), true, f + ' on NONE');
      assert.equal(shown(f, age, { occup_s: 5220 }), false, f + ' on employed PSOC');
      assert.equal(shown(f, age, {}), false, f + ' without PSOC answer');
    }
    assert.equal(shown('workind', age, { occup_s: 5220 }), true);
    assert.equal(shown('jstatus', age, { occup_s: 5220 }), true);
    assert.equal(shown('workind', age, { occup_s: 999 }), false);
  }
});
test('Show all cannot expose employment outside its specified age/skip rules', () => {
  context.S.showAll = true;
  try {
    assert.equal(shown('occup_s', 12), false);
    assert.equal(shown('childlabor', 18), false);
    assert.equal(shown('indust', 10, { childlabor: 0 }), false);
    assert.equal(shown('avail', 30, { occup_s: 5220 }), false);
  } finally { context.S.showAll = false; }
});
test('guided defaults/translation never show adult occupation in under-15 plans', () => {
  const young = PL.memberDefaults({ age: 14 });
  assert.equal(young.childlabor, 0);
  young.workind = 1;
  PL.setEmploymentAnswers(young, 14);
  assert.equal(young.occup_s, undefined);
  assert.equal(young.workind, undefined);
  assert.equal(young.childlabor, 0);
  assert.equal(young.work_tothrs, undefined);

  const active = PL.memberDefaults({ age: 10 });
  active.childlabor = 2;
  PL.setEmploymentAnswers(active, 10);
  assert.equal(active.work_hrs, 2);
  assert.equal(active.work_tothrs, 4);
  assert.equal(active.occup_s, undefined);

  const older = PL.memberDefaults({ age: 16 });
  older.childlabor = 0;
  PL.setEmploymentAnswers(older, 16);
  assert.equal(older.occup_s, 999);
  assert.equal(older.work_hrs, undefined);
});
test('child activity NONE versus work activity continues to drive child rights scoring', () => {
  const child = { no: 1, name: 'Test child', age: 12, status: 1, birthreg: 1, educind: 1, schattendance: 3, childlabor: 0 };
  const hh = { hh: PL.hhDefaults(), members: [child] };
  const score = () => E.score(hh, { thresholds: { food: 2053, poverty: 2647 } }).indicators.W.members[0];
  assert.equal(score().met, 3);
  child.childlabor = 1;
  assert.equal(score().met, 2);
  child.indust = 2;
  assert.equal(score().met, 2, 'industry does not currently alter the SWDI W engine result');
});
