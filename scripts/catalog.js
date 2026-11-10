/* Build the scenario catalog: every branch the engine can emit for realistic inputs. */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../engine/swdi-engine.js'), PL = require('../engine/swdi-planner.js');
const TH = { food: 2053, poverty: 2647 };
const roster = [[1, 45], [2, 40], [3, 70], [4, 64], [5, 17], [6, 16], [7, 15], [8, 12], [9, 10], [10, 9], [11, 5], [12, 4], [13, 3], [14, 1], [15, 18], [16, 19], [17, 0]].map(([no, age]) => ({ no, age, name: 'M' + no }));
const base = () => ({ hh: PL.hhDefaults(), members: roster.map(m => Object.assign({ no: m.no, age: m.age, name: m.name, status: 1 }, PL.memberDefaults(m))) });
const seen = {};
function collect(h) { const b = E.scoreBoth(h, { thresholds: TH }); b.target.branches.forEach(x => seen[x] = 1); b.stata.branches.forEach(x => { if (/\.div\.|stata_missing|precedence_bug/.test(x)) seen[x] = 1; }); }
collect(base());
PL.HH_SLOTS.forEach(s => s.cands().forEach(p => { const h = base(); Object.assign(h.hh, p); collect(h); }));
roster.forEach(m => PL.memberCands(m).forEach(c => { const h = base(); Object.assign(h.members.find(x => x.no === m.no), c.patch); collect(h); }));
PL.familyCands([1, 2]).forEach(c => { const h = base(); c.patches.forEach(([k, p]) => Object.assign(h.members.find(x => x.no === k), p)); collect(h); });
// income cases via planner on a few rosters
[[[1, 40], [2, 38], [3, 12], [4, 8]], [[1, 50], [2, 48], [3, 22], [4, 14]], [[1, 66], [2, 30]]].forEach(r => {
  const ros = r.map(([no, age]) => ({ no, age, name: 'M' + no }));
  for (let i = 0; i < 12; i++) { const p = PL.plan(ros, Object.keys(seen).length ? null : [], TH); collect(p.household); }
});
// special: moved-out member, no children household, all-L1 household
const mo = base(); mo.members[1].status = 3; collect(mo);
collect({ hh: PL.hhDefaults(), members: [{ no: 1, age: 70, ...PL.memberDefaults({ age: 70 }) }, { no: 2, age: 68, ...PL.memberDefaults({ age: 68 }) }] });
// v1 hand design (adds cross-indicator combos such as income cases)
try { const { households } = require('/home/claude/swdi-test/build/design.js'); households.forEach(h => collect({ hh: h.hh, members: h.members.map(m => Object.assign({}, m, { wagcshm: E.resolveToken(m.wagcshm, TH) })) })); } catch (e) {}
const ids = Object.keys(seen).filter(b => !/\.unanswered$|\.no_thresholds$|^Z\.lowb|\.code\.null|\.code\.undefined/.test(b)).sort();
fs.writeFileSync(path.join(__dirname, '../sheet/scenario_ids.json'), JSON.stringify(ids, null, 0));
console.log('catalog size', ids.length);
