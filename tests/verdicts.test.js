'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const SWDI = require('../engine/swdi-engine.js'), PL = require('../engine/swdi-planner.js');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8').replace(/\r\n/g, '\n');
function part(from, to) { const i = html.indexOf(from), j = html.indexOf(to, i); assert.ok(i >= 0 && j > i, from); return html.slice(i, j); }
const ctx = vm.createContext({ SWDI, IND: SWDI.INDICATORS, num: SWDI.num, S: { data: { config: { level_tolerance: 0.01, weighted_tolerance: 0.0006 } }, run: null } });
vm.runInContext(part('function finalVerdict(r)', 'function coverage()') + part('function tolFor(code)', '/** ES/SA follow') + part('function totalsOf(r)', 'var PLATFORMS') +
  'var lvlTxt = String, totTxt = function (c, x) { return x; };' + part('function compareValues(p, code, both)', '/** One-paragraph reason'), ctx);
const TH = { food: 1741, poverty: 2493 };
const members = [[1, 24, { sickind: 2, avail_med: 2, ynotavail_med: 99 }], [2, 40, { sickind: 1, avail_med: 2, ynotavail_med: 1 }], [3, 41, {}]]
  .map(([no, age, ov]) => Object.assign({ no, age, status: 1 }, PL.memberDefaults({ age }), ov));
const both = SWDI.scoreBoth({ hh: PL.hhDefaults(), members }, { thresholds: TH });   // F = (1 + 2 + 3) ÷ 3 = 2
const judge = (code, value, all = {}, mode = 'level') => { ctx.S.run = { obs: { swdi: Object.assign({}, all, { [code]: value }), fpf: {}, mode: { swdi: mode, fpf: 'level' } } }; return ctx.judgeDetail('swdi', code, both); };

test('an indicator shown as N/A that has an expected level is NOT SCORED, not FAIL', () => {
  assert.deepEqual({ ...judge('C', 'N/A') }, { verdict: 'NOT SCORED', basis: 'not_computed' });
});
test('totals behind a partial score are NOT SCORED; the other dimension is still graded', () => {
  const all = { C: 'N/A' }, t = both.target;
  for (const code of ['ES', 'TOTAL', 'LOWB']) { const r = judge(code, '2', all); assert.equal(r.verdict, 'NOT SCORED', code); assert.deepEqual([...r.missing], ['C']); }
  assert.equal(judge('SA', t.sa_rescaled.toFixed(4), all).verdict, 'PASS');
  assert.equal(judge('SA', (t.sa_rescaled + 0.01).toFixed(4), all).verdict, 'FAIL');
  assert.equal(judge('ES', '', all).verdict, '');
  assert.equal(judge('TOTAL', t.total.toFixed(4)).verdict, 'PASS');
});
test('a score typed with decimals must match to those decimals', () => {
  const b = JSON.parse(JSON.stringify(both)); b.target.indicators.F.level = b.stata.indicators.F.level = 5 / 3;
  const j = v => { ctx.S.run = { obs: { swdi: { F: v }, fpf: {}, mode: { swdi: 'level', fpf: 'level' } } }; return ctx.judgeDetail('swdi', 'F', b); };
  assert.equal(j('1.67').verdict, 'PASS');
  assert.equal(j('1.6667').verdict, 'PASS');
  assert.equal(j('1.66').basis, 'truncated_decimals');
  assert.equal(j('1.68').verdict, 'FAIL');
  assert.equal(j('2').verdict, 'ROUNDING');
  assert.equal(j('1').basis, 'truncated');
});
test('a verdict is the same before and after the value is saved to the sheet and reloaded', () => {
  const run = (code, value, mode, level) => {
    const b = JSON.parse(JSON.stringify(both)); b.target.indicators[code].level = b.stata.indicators[code].level = level;
    ctx.S.run = { obs: { swdi: { [code]: value }, fpf: {}, mode: { swdi: mode, fpf: 'level' } } };
    return ctx.judgeDetail('swdi', code, b).verdict;
  };
  // Level scores: the sheet returns a number, so trailing zeros are lost.
  for (const [value, level] of [['1.70', 1.7083], ['1.6700', 5 / 3], ['2.50', 2.5], ['1.66', 5 / 3], ['2.00', 7 / 3]]) assert.equal(run('F', value, 'level', level), run('F', Number(value), 'level', level), value);
  // Weighted scores: saved as a level and reloaded in level mode.
  let n = 0;
  for (const d of SWDI.INDICATORS.filter(x => x.agg === 'AVG')) for (let sum = 4; sum <= 18; sum++) for (const members of [3, 4, 5, 6]) {
    const level = sum / members; if (level < 1 || level > 3) continue;
    for (const digits of [4, 5]) {
      const typed = (level * d.w).toFixed(digits), stored = ctx.storedLevel(SWDI.interpretObserved(d.code, Number(typed), 'weighted'));
      assert.equal(run(d.code, stored, 'level', level), run(d.code, typed, 'weighted', level), d.code + ' ' + typed + ' → ' + stored); n++;
    }
  }
  assert.ok(n > 300);
});
test('totals tighten at four decimals and keep the old tolerance below that', () => {
  const total = both.target.total;
  assert.equal(judge('TOTAL', (total + 0.001).toFixed(4)).verdict, 'FAIL');
  assert.equal(judge('TOTAL', (total + 0.001).toFixed(3)).verdict, 'PASS');
});
test('the worst verdict of the two platforms wins', () => {
  const f = (a, b) => ctx.finalVerdict({ 'SWDI App verdict': a, '4Ps Forward verdict': b });
  assert.equal(f('NOT SCORED', 'PASS'), 'NOT SCORED'); assert.equal(f('NOT SCORED', 'FAIL'), 'FAIL'); assert.equal(f('N/A CHECK', 'NOT SCORED'), 'NOT SCORED');
});
