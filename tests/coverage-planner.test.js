'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine/swdi-engine');
const P = require('../engine/swdi-planner');
const C = require('../engine/swdi-coverage');
const catalog = require('../engine/swdi-scenarios');

const thresholds = {food:2053, poverty:2647};
const env = 'Newlogic Preprod', loadTest = 'DSWD Preprod Load Test';
const roster = [42,44,12,4].map((age,i) => ({no:i+1,age,name:'Test ' + (i+1),status:1}));
function record(id, household, verdicts, instance = env) {
  const both = E.scoreBoth(household, {thresholds});
  const scores = Object.entries(verdicts).map(([code,platforms]) => ({code,
    level: code === 'LOWB' ? both.target.lowb : both.target.indicators[code].level,
    branches:C.branches(both,code), verdicts:platforms}));
  return {id, env:instance, household, thresholds, scores};
}
function plan(records, members = roster, instance = env) {
  const h = C.history(records, instance);
  return P.plan(members, catalog.map(s => s.id).filter(id => !h.seen.has(id)), thresholds, h);
}
test('the four reported family-score sequences still leave integer family goals after their catalog branches have been exercised', () => {
  const scores = {B:[1.75,2.67,3,3], D:[3,1,1,1], F:[2.33,2,3,3], G:[1,1,3,3], H:[1.5,2,3,3], Y:[1,2,1,1]};
  const baseline = Array.from({length:4}, (_,i) => ({id:String(i), scores:Object.entries(scores).map(([code, levels]) =>
    ({code, level:levels[i], branches:catalog.filter(s => s.ind === code).map(s => s.id), verdicts:i===3 ? {} : {'SWDI App':'PASS'}}))}));
  const h = C.history(baseline,env), p = P.plan(roster, [], thresholds, h);
  assert.equal(h.stats.B.levels.has(2),false);
  assert.deepEqual(Object.fromEntries(p.rows.filter(r => scores[r.code]).map(r => [r.code,r.level])), {B:1,D:2,F:1,G:2,H:1,Y:3});
  for (const code of Object.keys(scores)) {
    const row = p.rows.find(r => r.code === code);
    assert.equal(row.newLevel,true,code);
    assert.deepEqual(row.hits,[]);
    assert.ok(p.targets.some(t => t.scenarios.includes(code + '.family.L' + row.level)),code);
  }
  assert.ok(p.targets.some(t => t.scenarios.includes('B.member.L1') && 'occup_s' in t.patches[0][1]));
});
test('three consecutive verified interviews cover each final level of B, D, F, G, H and Y; every catalog claim survives entry conversion and shared fields', () => {
  const baseline = [];
  for (let i=0;i<3;i++) {
    const p = plan(baseline), both = E.scoreBoth(p.household,{thresholds});
    const next = record(String(i), p.household, Object.fromEntries(p.rows.map(r => [r.code,{'SWDI App':'PASS'}])));
    for (const row of p.rows) {
      const actual = C.branches(both,row.code);
      assert.ok(row.hits.every(id => actual.includes(id)),row.code);
      for (const id of row.hits) assert.ok(baseline.every(r => r.scores.every(s => !s.branches.includes(id))), id);
    }
    const actual = new Set(next.scores.flatMap(s => s.branches));
    for (const t of p.targets) {
      for (const id of t.scenarios.filter(id => catalog.some(s => s.id === id))) assert.ok(actual.has(id),id);
      for (const [key,patch] of t.patches) {
        const real = key === 'hh' ? p.household.hh : p.household.members.find(m => m.no === key);
        for (const [field,v] of Object.entries(patch)) assert.equal(real[field],v,field);
      }
    }
    baseline.push(next);
  }
  const history = C.history(baseline,env);
  for (const code of 'BDFGHY') for (const l of [1,2,3]) assert.ok(history.stats[code].levels.get(l)?.passed,code+l);
});
test('a different household option with the same family level keeps its own regression and platform history', () => {
  const a = {hh:{garbage:9}, members:roster}, b = {hh:{garbage:10}, members:roster};
  const failed = record('01',a,{K:{'SWDI App':'FAIL','4Ps Forward':'ROUNDING'}},'Preprod');
  const alternative = record('02',b,{K:{'SWDI App':'PASS'}});
  const other = record('03',a,{K:{'SWDI App':'PASS'}},loadTest);
  const prior = [failed,alternative,other];
  const h = C.history(prior,env);
  assert.equal(h.stats.K.issues.length,2);
  const p = P.plan(roster,[],thresholds,h), k = p.rows.find(r => r.code === 'K');
  assert.equal(p.household.hh.garbage,9);
  assert.deepEqual(k.issues.map(i => i.verdict).sort(),['FAIL','ROUNDING']);
  assert.ok(p.targets.some(t => t.ind === 'K' && t.scenarios.includes('K.retest')));
  assert.equal(C.history(prior,loadTest).stats.K.issues.length,0);
  const pending = record('04',a,{K:{}});
  const h2 = C.history([...prior,pending],env);
  assert.ok(h2.stats.K.issues.every(i => i.pendingRun === '04'));
  assert.deepEqual(P.plan(roster,[],thresholds,h2).rows.find(r => r.code === 'K').issues,[]);
  const pass = record('05',a,{K:{'SWDI App':'PASS'}});
  assert.deepEqual(C.history([...prior,pass],env).stats.K.issues.map(i => i.platform),['4Ps Forward']);
  assert.equal(C.history([failed],env,'01').stats.K.issues.length,0);
});
test('member identity and roster order do not create coverage; age boundaries, scoring answers and income thresholds do', () => {
  const one = {hh:{},members:[{no:1,name:'Example',age:9,literacy_read:1},{no:2,name:'Example B',age:25,literacy_read:2}]};
  const same = {hh:{roof:5},members:[{...one.members[1],no:1,age:42},{...one.members[0],no:2,name:'Different',literacy_read:'1'}]};
  assert.equal(C.signature('L',one),C.signature('L',same));
  same.members[1].age=10;
  assert.notEqual(C.signature('L',one),C.signature('L',same));
  assert.notEqual(C.signature('C',one,thresholds),C.signature('C',one,{food:2053,poverty:3000}));
  assert.equal(C.signature('B',{hh:{}, members:[{age:40,workind:2,jobind:1,jstatus:3}]}),
    C.signature('B',{hh:{},members:[{age:40,occup_s:5220,workind:1,worked_last_week:2,jstatus:3}]}));
  const adult = {hh:{},members:[{no:1, age:40, sickind:1,confine:1}]};
  for (const verdict of ['N/A CHECK','STATA RULE','ROUNDING','FAIL']) {
    const r = record('bad',adult,{G:{'SWDI App':verdict}});
    const hist = C.history([r],env);
    assert.equal(hist.stats.G.issues[0].verdict,verdict);
    const out = P.plan(roster,[],thresholds,hist).rows.find(row => row.code==='G');
    assert.equal(out.issues.length,0,'different active-member count cannot be labeled an exact retest');
    assert.equal(out.open.length,1);
  }
});
test('age requirements respect active members, missing child outcomes and two-member aggregation', () => {
  const adults = [{age:40,no:1,status:1},{age:5,no:2,status:3}];
  for (const id of ['L.bnd.age_5','W.case.incomplete_immunization','B.f.mixed_member_levels'])
    assert.ok(C.rosterNeed(catalog.find(s => s.id === id),adults),id);
  assert.equal(C.rosterNeed(catalog.find(s => s.id==='W.na.no_children_0_17'),adults),'');
  const p = plan([],adults);
  const w = p.rows.find(r => r.code === 'W');
  assert.equal(w.level,null);
  assert.equal(w.newLevel,false);
  assert.ok(w.hits.includes('W.na.no_children_0_17'));
  assert.ok(!p.targets.some(t => t.ind === 'H' && t.scenarios.includes('H.family.L1')));
});

test('income one peso to either side of an annual threshold cannot exercise the exact threshold case', () => {
  const person = {no:1, age:35}, at = thresholds.food * 12;
  for (const [delta,label] of [[-1,'just_below_food'],[0,'at_food_threshold'],[1,'just_above_food']]) {
    const household = {hh:{},members:[{...person,other_income:at + delta}]};
    const c = E.scoreBoth(household,{thresholds}).target.indicators.C;
    assert.ok(c.branches.includes('C.bnd.pci_' + label));
    assert.equal(c.branches.includes('C.bnd.pci_at_food_threshold'),delta===0);
    const prior = record('old',household,{C:{'SWDI App':'PASS'}});
    prior.scores[0].branches = ['C.bnd.pci_at_food_threshold'];
    assert.equal(C.history([prior],env).seen.has('C.bnd.pci_at_food_threshold'),delta===0);
  }
  assert.notEqual(C.boundary('F',1.49),C.boundary('F',1.5));
  assert.notEqual(C.boundary('F',1.5),C.boundary('F',1.51));
  assert.notEqual(C.boundary('LOWB',1,1.829),C.boundary('LOWB',2,1.83));
});
test('eligibility-only results stay separate from eligible family goals', () => {
  const kids = {hh:{},members:[{no:1,age:10}]};
  const prior = record('young',kids,{V:{'SWDI App':'PASS'},E:{'SWDI App':'PASS'}});
  const h = C.history([prior],env);
  assert.equal(h.stats.V.levels.has(1),false);
  assert.equal(h.stats.E.levels.has(1),false);
  const kidPlan = P.plan(kids.members,[],thresholds,h);
  assert.ok(kidPlan.rows.filter(r => r.code==='V' || r.code==='E').every(r => !r.newLevel));
});
test('an aggregate discrepancy can replay the full scoring inputs, even with different member names and numbers', () => {
  const base = P.plan(roster,[],thresholds).household;
  const expected = E.score(base,{thresholds});
  const failed = {id:'01',env,household:base,thresholds,scores:[{code:'TOTAL',level:expected.total,branches:[],verdicts:{'SWDI App':'FAIL'}}]};
  const h = C.history([failed],env);
  const p = P.plan(roster.slice().reverse().map((m,i) => ({...m,no:8+i,name:'Other '+i})),[],thresholds,h);
  assert.equal(C.signature('TOTAL',p.household,thresholds),C.signature('TOTAL',base,thresholds));
  assert.equal(p.rows.find(r => r.code==='TOTAL').issues[0].verdict,'FAIL');
  assert.equal(p.repeatedRun,'01');
});
