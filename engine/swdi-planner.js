/* SWDI Guided-test planner.
 * Given the real roster of the household picked in the SWDI App (names, ages, status) and the set of
 * scenarios already exercised, it proposes the values to enter so that this interview hits as many
 * not-yet-covered scenarios as possible. The scoring engine is the oracle: every candidate value set
 * is scored and kept only if it newly exercises catalogued scenarios.
 * Requires swdi-engine.js (SWDI) in the same scope.
 */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./swdi-engine.js') : root.SWDI;
  var ALL_VAX = '1;2;3;4;5;6;7;8';
  var ALL_KIT = []; for (var i = 1; i <= 19; i++) ALL_KIT.push(i); ALL_KIT = ALL_KIT.join(';');
  var PARENT = E.PARENT_VARS;

  function gradeFor(a) {
    if (a <= 3) return 1000; if (a <= 5) return 2000;
    if (a <= 11) return 10011 + (a - 6);
    if (a <= 15) return 24011 + (a - 12);
    if (a === 16) return 34011; if (a === 17) return 34012; if (a === 18) return 34012;
    return 60001;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function age(m) { return Number(m.age); }
  function isActive(m) { return !m.status || Number(m.status) === 1; }

  // ---------- defaults ("good" values that score Level 3 where possible) ----------
  function hhDefaults() {
    var h = { water: 72, water_dist: '', toil: 12, toil_shared: 2, garbage: 8, roof: 1, wall: 1, location: 2, gida: 2, tenur: 4, imprnt: 0, light: 1,
      tv: 1, smartcp: 2, ref: 1, disastkit: ALL_KIT, disasknow_hotline: 1, disasknow_evac: 1, disasknow_hosp: 1, disasknow_other: 2, disasplan: 1, emersavings: 1,
      gvbind: '', gvb_action: '' };
    PARENT.forEach(function (p, i) { h[p] = i < 6 ? 1 : 2; });
    E.PROBLEMS.forEach(function (p) { h[p] = 2; });
    E.DISASTERS.forEach(function (d) { h[d] = 2; });
    return h;
  }
  function memberDefaults(m) {
    var a = age(m), o = { sickind: 2, confine: 2, avail_med: 2, ynotavail_med: 5, birthreg: 1 };
    if (a <= 18) { o.stuntingind = 1; o.wastingind = 1; o.underweightind = 1; o.overweightind = 1; }
    if (a <= 5) o.vaccine = ALL_VAX;
    if (a >= 3 && a <= 18) { o.educind = 1; o.gradel = gradeFor(a); o.schattendance = 3; }
    if (a >= 19) { o.educind = 2; o.educal = 24014; }
    if (a >= 5 && a <= 64) { o.literacy_read = 1; o.literacy_write = 1; o.literacy_count = 1; }
    if (a >= 10 && a <= 64) { o.literacy_understand = 1; o.internet = 1; o.digiact = a < 18 ? '1' : '2'; }
    if (a >= 5 && a <= 17) o.childlabor_yes = 2;
    if (a >= 15) {
      o.ofw = 2; o.skills_n = 0; o.sssind = 2; o.gsisind = 2; o.insurance = 2; o.finance_acct = 2; o.savings = 2; o.orgmem = 2;
      if (a >= 19 && a <= 64) { o.workind = 1; o.jstatus = 1; } else { o.workind = 2; o.jobind = 2; o.avail = 2; o.willing = 2; }
    }
    return o;
  }

  // ---------- candidate patches ----------
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  var HH_SLOTS = [
    { key: 'roof/wall', ind: 'O,P', cands: function () {
      var c = [];
      [2, 1].forEach(function (loc) { [7, 4, 5, 1, 2, 3, 6].forEach(function (r) { [8, 5, 6, 1, 2, 3, 4, 7, 9].forEach(function (w) { c.push({ roof: r, wall: w, location: loc }); }); }); });
      return c; } },
    { key: 'water', ind: 'I', cands: function () {
      var c = [{ water: 32, water_dist: '' }, { water: 42, water_dist: '' }, { water: 81, water_dist: '' }, { water: 72, water_dist: '' }, { water: 91, water_dist: '' },
        { water: 11, water_dist: 0 }, { water: 12, water_dist: 0 }, { water: 12, water_dist: 35 }, { water: 11, water_dist: '' }, { water: 21, water_dist: 30 }, { water: 31, water_dist: 31 }];
      [13, 14, 21, 31, 41, 51, 61, 71].forEach(function (w) { c.push({ water: w, water_dist: 10 }); c.push({ water: w, water_dist: 45 }); });
      return c; } },
    { key: 'toilet', ind: 'J', cands: function () {
      var c = [{ toil: 95, toil_shared: '' }, { toil: 95, toil_shared: 2 }];
      [11, 12, 13, 21, 22, 31, 14, 15, 23, 41, 51, 71].forEach(function (t) { c.push({ toil: t, toil_shared: 2 }); c.push({ toil: t, toil_shared: 1 }); });
      return c; } },
    { key: 'garbage', ind: 'K', cands: function () { return range(1, 10).map(function (g) { return { garbage: g }; }); } },
    { key: 'tenure', ind: 'Q', cands: function () { return range(1, 8).map(function (t) { return { tenur: t }; }); } },
    { key: 'lighting', ind: 'R', cands: function () { return [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (l) { return { light: l }; }); } },
    { key: 'assets', ind: 'S', cands: function () {
      var z = {}; E.ASSET_VARS.forEach(function (v) { z[v] = 0; }); E.LAND_VARS.forEach(function (v) { z[v] = 2; });
      function w(o) { return Object.assign({}, z, o); }
      return [w({}), w({ tv: 1, radio: 1 }), w({ tv: 1, oldcp: 1, radio: 1 }), w({ tv: 1, ref: 1, smartcp: 1, radio: 1 }), w({ tv: 1, ref: 1, wash: 1, smartcp: 2 }),
        w({ tv: 1, ref: 1, wash: 1, aircon: 1, smartcp: 1, tablet: 1 }), w({ smartcp: 4 }), w({ tv: 1, ref: 1, land_agri: 1, fishpond: 1 }), w({ tv: 2, smartcp: 3, ref: 1, motor: 1, bic: 2, radio: 1 })]; } },
    { key: 'parenting', ind: 'T', cands: function () { return range(0, 9).map(function (n) { var o = {}; PARENT.forEach(function (p, i) { o[p] = i < n ? 1 : 2; }); return o; }); } },
    { key: 'problems', ind: 'U', cands: function () {
      var none = {}; E.PROBLEMS.forEach(function (p) { none[p] = 2; none[p + '_sol'] = ''; none[p + '_res'] = ''; });
      var c = [Object.assign({}, none)];
      E.PROBLEMS.forEach(function (p) {
        [[2, ''], [1, 2], [1, 1]].forEach(function (sr) { var o = Object.assign({}, none); o[p] = 1; o[p + '_sol'] = sr[0]; o[p + '_res'] = sr[1]; c.push(o); });
      });
      var m1 = Object.assign({}, none, { probfin: 1, probfin_sol: 1, probfin_res: 1, probhealth: 1, probhealth_sol: 2 });
      var m2 = Object.assign({}, none, { probfin: 1, probfin_sol: 1, probfin_res: 2, probconflict: 1, probconflict_sol: 1, probconflict_res: 1 });
      return c.concat([m1, m2]); } },
    { key: 'gbv', ind: 'X', cands: function () {
      var c = [{ gvbind: '', gvb_action: '' }];
      range(1, 8).forEach(function (t) { [3, 2, 1].forEach(function (a) { c.push({ gvbind: String(t), gvb_action: a }); }); });
      c.push({ gvbind: '4;6', gvb_action: 3 }); c.push({ gvbind: '1;2', gvb_action: 1 });
      return c; } },
    { key: 'drrm', ind: 'Y', cands: function () {
      var nd = {}; E.DISASTERS.forEach(function (d) { nd[d] = 2; nd[d + '_r'] = ''; nd[d + '_e'] = ''; });
      var K = { disasknow_hotline: 1, disasknow_evac: 1, disasknow_hosp: 1, disasknow_other: 2 }, NK = { disasknow_hotline: 2, disasknow_evac: 2, disasknow_hosp: 2, disasknow_other: 2 };
      function d(kit, know, plan, sav, gida, dis, r) {
        var o = Object.assign({}, nd, know ? K : NK, { disastkit: kit, disasplan: plan ? 1 : 2, emersavings: sav ? 1 : 2, gida: gida ? 1 : 2 });
        if (dis) { o[dis] = 1; o[dis + '_e'] = 4; o[dis + '_r'] = r; }
        return o;
      }
      var P = '1;2;5;8;13';
      return [d(ALL_KIT, 1, 1, 1, 0), d(ALL_KIT, 1, 1, 1, 1), d('', 0, 0, 0, 0), d('', 0, 1, 0, 0), d('', 1, 0, 1, 0, 'typhoon', 3), d('', 1, 1, 1, 0),
        d(ALL_KIT, 1, 1, 0, 0), d(ALL_KIT, 1, 1, 1, 0, 'flood', 1), d(ALL_KIT, 1, 1, 1, 0, 'typhoon', 2), d(ALL_KIT, 1, 1, 1, 0, 'earthquake', 3),
        d(P, 0, 0, 0, 0, 'volerupt', 3), d(P, 0, 0, 0, 0), d(P, 1, 1, 0, 0), d(ALL_KIT, 1, 1, 1, 0, 'drought', 2), d(ALL_KIT, 1, 1, 1, 0, 'landslide', 1),
        d(ALL_KIT, 1, 1, 1, 0, 'pest', 1), d(ALL_KIT, 1, 1, 1, 0, 'pollution', 2), d(ALL_KIT, 1, 1, 1, 0, 'fire', 1), d(ALL_KIT, 1, 1, 1, 0, 'disastothers', 1)]; } }
  ];

  var SHS_CODES = [24015, 34013, 34016, 34024, 34027, 34033, 35013, 35015, 40001, 50002, 60009, 70019, 80019];
  function memberCands(m) {
    var a = age(m), c = [];
    function add(ind, p) { c.push({ ind: ind, patch: p }); }
    if (a >= 15) {
      add('A', { skills_n: 0 }); add('A', { skills_n: 1, regskill1: 2 }); add('A', { skills_n: 1, regskill1: 1 }); add('A', { skills_n: 2, regskill1: 2, regskill2: 2 });
      add('A', { skills_n: 3, regskill1: 2, regskill2: 1, regskill3: 2 });
      if (a >= 19) SHS_CODES.forEach(function (code) { add('A', { skills_n: 0, educind: 2, educal: code, gradel: '', schattendance: '' }); });
      if (a >= 16 && a <= 18) { add('A', { skills_n: 0, educind: 1, gradel: 34012, schattendance: 3 }); add('A', { skills_n: 0, educind: 1, gradel: 35012, schattendance: 3 }); }
      if (a >= 19 && a <= 30) add('A', { skills_n: 0, educind: 1, gradel: 60002, educal: '', schattendance: '' });
      add('B', { workind: 2, jobind: 2, avail: 1, willing: 1, jstatus: '' }); add('B', { workind: 1, jstatus: 2 }); add('B', { workind: 1, jstatus: 3 }); add('B', { workind: 1, jstatus: 1 });
      add('B', { workind: 2, jobind: 1, jstatus: 1 }); add('B', { workind: 2, jobind: 1, jstatus: 3 }); add('B', { workind: 2, jobind: 1, jstatus: 2 }); add('B', { workind: 2, jobind: 2, avail: 2, willing: 2, jstatus: '' });
      add('D', { sssind: 1, sss_months: 23, gsisind: 2 }); add('D', { sssind: 1, sss_months: 24, gsisind: 2 }); add('D', { sssind: 2, gsisind: 1, gsis_months: 12 }); add('D', { sssind: 2, gsisind: 1, gsis_months: 36 }); add('D', { sssind: 2, gsisind: 2 });
    }
    add('F', { avail_med: 1 }); add('F', { sickind: 1, confine: 2, avail_med: 2, ynotavail_med: 1 }); add('F', { sickind: 1, confine: 2, avail_med: 2, ynotavail_med: 2 });
    add('F', { sickind: 1, confine: 2, avail_med: 2, ynotavail_med: 3 }); add('F', { sickind: 1, avail_med: 2, ynotavail_med: 4 }); add('F', { sickind: 1, avail_med: 2, ynotavail_med: 99 });
    add('F', { sickind: 2, confine: 2, avail_med: 2, ynotavail_med: 99 });
    add('G', { sickind: 1, confine: 1, avail_med: 1 }); add('G', { sickind: 1, confine: 2, avail_med: 1 }); add('G', { sickind: 2, confine: 1, avail_med: 2, ynotavail_med: 5 });
    if (a <= 18) {
      add('H', { stuntingind: 4 }); add('H', { overweightind: 5 }); add('H', { wastingind: 2 }); add('H', { overweightind: 3 }); add('H', { underweightind: 4 });
      add('H', { stuntingind: 4, wastingind: 2 }); add('H', { underweightind: 2 });
    }
    if (a >= 5 && a <= 9) { add('L', { literacy_read: 2, literacy_write: 2, literacy_count: 2 }); add('L', { literacy_write: 2 }); add('L', { literacy_count: 2 }); }
    if (a >= 10 && a <= 64) {
      add('L', { literacy_read: 2, literacy_write: 2, literacy_count: 2, literacy_understand: 2 }); add('L', { literacy_read: 2 }); add('L', { literacy_understand: 2 });
      add('M', { internet: 2, digiact: '' }); add('M', { internet: 1, digiact: '1' }); add('M', { internet: 1, digiact: '1;4' }); add('M', { internet: 1, digiact: '3' });
      add('M', { internet: 1, digiact: '5' }); add('M', { internet: 1, digiact: '2' }); add('M', { internet: 1, digiact: '' });
    }
    if (a >= 3 && a <= 18) { add('N', { educind: 2, gradel: '', schattendance: '' }); add('N', { schattendance: 1 }); add('N', { schattendance: 2 }); }
    if (a <= 17) {
      add('W', { birthreg: 2 });
      if (a <= 5) { add('W', { vaccine: '1;7' }); add('W', { vaccine: '1;2;3;4;5;6;7' }); add('W', { vaccine: '' }); }
      if (a >= 5) add('W', { childlabor_yes: 1, childlabor: 1 });
    }
    return c;
  }

  function familyCands(adults) {
    var c = [];
    function p(list) { return list; }   // list of [memberNo, patch]
    var a1 = adults[0], a2 = adults[1];
    if (a1) {
      c.push({ ind: 'E', patches: p([[a1, { insurance: 1 }]]) }); c.push({ ind: 'E', patches: p([[a1, { finance_acct: 1 }]]) });
      c.push({ ind: 'E', patches: p([[a1, { insurance: 1, finance_acct: 1 }]]) }); c.push({ ind: 'E', patches: p([[a1, { savings: 1 }]]) });
      c.push({ ind: 'V', patches: p([[a1, { orgmem: 1, orgact1: 2, orgofficer1: 2 }]]) }); c.push({ ind: 'V', patches: p([[a1, { orgmem: 1, orgact1: 1, orgofficer1: 2 }]]) });
      c.push({ ind: 'V', patches: p([[a1, { orgmem: 1, orgact1: 2, orgofficer1: 1 }]]) });
    }
    if (a1 && a2) {
      c.push({ ind: 'E', patches: p([[a1, { insurance: 1 }], [a2, { finance_acct: 1 }]]) }); c.push({ ind: 'E', patches: p([[a1, { finance_acct: 1 }], [a2, { finance_acct: 1 }]]) });
      c.push({ ind: 'V', patches: p([[a1, { orgmem: 1, orgact1: 1, orgofficer1: 2 }], [a2, { orgmem: 1, orgact1: 1, orgofficer1: 2 }]]) });
      c.push({ ind: 'V', patches: p([[a1, { orgmem: 1, orgact1: 2, orgofficer1: 2 }], [a2, { orgmem: 1, orgact1: 2, orgofficer1: 2 }]]) });
    }
    return c;
  }

  // ---------- scoring of candidates ----------
  function weight(b) {
    if (/^Z\./.test(b)) return 0;
    if (/\.div\./.test(b)) return 6;
    if (/\.chk\./.test(b)) return 4;
    if (/\.bnd\./.test(b)) return 3;
    if (/\.L\d/.test(b)) return 3;
    if (/\.case\./.test(b)) return 2;
    return 1;
  }
  function branchesOf(plan, th) {
    var b = E.scoreBoth(plan, { thresholds: th });
    var s = {};
    b.target.branches.forEach(function (x) { s[x] = 1; });
    b.stata.branches.forEach(function (x) { if (/\.div\.|stata_missing|precedence_bug/.test(x)) s[x] = 1; });
    return s;
  }
  function gain(after, before, want) {
    var g = 0, hits = [];
    Object.keys(after).forEach(function (b) { if (!before[b] && want[b]) { g += weight(b); hits.push(b); } });
    return { g: g, hits: hits };
  }
  function lockedConflict(locks, key, patch) {
    var L = locks[key] || {};
    return Object.keys(patch).some(function (v) { return v in L && String(L[v]) !== String(patch[v]); });
  }
  function lock(locks, key, patch) { locks[key] = locks[key] || {}; Object.keys(patch).forEach(function (v) { locks[key][v] = patch[v]; }); }

  /**
   * roster: [{no, name, age, sex, status}]  •  uncovered: array of scenario IDs still to test (catalog)
   * thresholds: {food, poverty}  •  returns {household, targets:[{where, ind, values, scenarios}], income}
   */
  function plan(roster, uncovered, thresholds) {
    var want = {}; (uncovered || []).forEach(function (b) { want[b] = 1; });
    var P = { hh: hhDefaults(), members: roster.map(function (m) { return Object.assign({ no: m.no, name: m.name, age: Number(m.age), status: m.status || 1 }, memberDefaults(m)); }) };
    var locks = {}, targets = [];
    var cur = branchesOf(P, thresholds);
    function tryApply(where, ind, applyFns) {
      // applyFns: list of {label, apply(planCopy), patches:[[key, patch]]}
      var best = null;
      applyFns.forEach(function (cand) {
        if (cand.patches.some(function (kp) { return lockedConflict(locks, kp[0], kp[1]); })) return;
        var Q = clone(P); cand.patches.forEach(function (kp) { applyPatch(Q, kp[0], kp[1]); });
        var after = branchesOf(Q, thresholds), g = gain(after, cur, want);
        if (g.g > 0 && (!best || g.g > best.g.g)) best = { cand: cand, Q: Q, after: after, g: g };
      });
      if (best) {
        P = best.Q; cur = best.after;
        best.cand.patches.forEach(function (kp) { lock(locks, kp[0], kp[1]); });
        targets.push({ where: where, ind: ind, patches: best.cand.patches, scenarios: best.g.hits });
      }
    }
    function applyPatch(Q, key, patch) {
      if (key === 'hh') Object.assign(Q.hh, patch);
      else { var m = Q.members.filter(function (x) { return x.no === key; })[0]; if (m) Object.assign(m, patch); }
    }
    // household slots
    HH_SLOTS.forEach(function (s) { tryApply('Household', s.ind, s.cands().map(function (p) { return { patches: [['hh', p]] }; })); });
    // family composition: children's rights first (it constrains school/vaccines), then E, V
    var act = P.members.filter(isActive);
    var adults = act.filter(function (m) { return m.age >= 15; }).map(function (m) { return m.no; });
    var kids = act.filter(function (m) { return m.age <= 17; });
    if (kids.length) {
      var wc = [];
      kids.forEach(function (k) { memberCands(k).filter(function (c) { return c.ind === 'W'; }).forEach(function (c) { wc.push({ patches: [[k.no, c.patch]] }); }); });
      if (kids.length >= 2) wc.push({ patches: kids.map(function (k) { return [k.no, k.age >= 3 ? { birthreg: 2, educind: 2, gradel: '', schattendance: '' } : { birthreg: 2, vaccine: '' }]; }) });
      tryApply('Children 0-17', 'W', wc);
    }
    familyCands(adults).forEach(function () {});
    ['E', 'V'].forEach(function (ind) { tryApply('Members 15+', ind, familyCands(adults).filter(function (c) { return c.ind === ind; })); });
    // member slots
    act.forEach(function (m) {
      var cs = memberCands(m);
      ['A', 'B', 'D', 'F', 'G', 'H', 'L', 'M', 'N'].forEach(function (ind) {
        tryApply('M' + m.no + ' ' + (m.name || '') + ' (' + m.age + ')', ind, cs.filter(function (c) { return c.ind === ind; }).map(function (c) { return { patches: [[m.no, c.patch]] }; }));
      });
    });
    // income last (depends on who works and on family size)
    var inc = planIncome(P, want, cur, thresholds, locks);
    if (inc) { P = inc.plan; targets.push({ where: 'Income', ind: 'C', patches: inc.patches, scenarios: inc.hits, note: inc.note }); }
    return { household: P, targets: targets };
  }

  function planIncome(P, want, cur, th, locks) {
    var food = Number(th && th.food), pov = Number(th && th.poverty);
    if (!food || !pov) return null;
    var act = P.members.filter(isActive), all = P.members, A = act.length, K = all.length - A;
    var earners = act.filter(function (m) { return m.age >= 15 && (Number(m.workind) === 1 || Number(m.jobind) === 1); });
    var adults = act.filter(function (m) { return m.age >= 15; });
    var kids = act.filter(function (m) { return m.age >= 5 && m.age < 15; });
    var e = earners[0] || adults[0];
    if (!e) return null;
    var field = earners[0] ? 'wagcshm' : 'other_income';
    var cands = [];
    function amt(pci, fs, up) { var x = pci * 12 * fs; return up ? Math.ceil(x) : Math.floor(x); }
    function c(note, list) { cands.push({ note: note, patches: list }); }
    c('Zero income → food poor', [[e.no, mk(field, 0)]]);
    c('PCI midway between food and poverty thresholds', [[e.no, mk(field, amt((food + pov) / 2, A, true))]]);
    c('PCI well above poverty threshold', [[e.no, mk(field, amt(pov * 2, A, true))]]);
    c('PCI exactly at the food threshold', [[e.no, mk(field, amt(food, A, true))]]);
    c('PCI exactly at the poverty threshold', [[e.no, mk(field, amt(pov, A, true))]]);
    var grantee = adults.filter(function (m) { return m.no !== e.no; })[0] || e;
    c('4Ps cash present; PCI below poverty only if 4Ps is excluded', [[e.no, mk(field, amt(pov - 300, A, false))], [grantee.no, { pantawidind: 1, pantawidcsh: Math.ceil(600 * 12 * A) }]]);
    if (kids.length) c('Income of a member under 15 (excluded by target rule)', [[e.no, mk(field, amt(pov - 200, A, false))], [kids[0].no, { workind: 1, jstatus: 2, wagcshm: Math.ceil(400 * 12 * A) }]]);
    var ofwC = adults.filter(function (m) { return m.no !== e.no; })[0];
    if (ofwC && A >= 3) c('OFW member: counted in family size (target) vs excluded (Stata)', [[e.no, mk(field, amt(pov, A - 0.5, true))], [ofwC.no, { ofw: 1 }]]);
    if (K > 0) c('Moved-out/deceased member: excluded from family size (target) vs counted (Stata)', [[e.no, mk(field, amt(pov, A + 0.5 * K, true))]]);
    if ([1, 4, 5, 6].indexOf(Number(P.hh.tenur)) >= 0) c('Imputed rent added to income (target) vs ignored (Stata)', [[e.no, mk(field, amt(pov - 500, A, false))], ['hh', { imprnt: 500 * A }]]);
    var best = null;
    cands.forEach(function (cd) {
      if (cd.patches.some(function (kp) { return lockedConflict(locks || {}, kp[0], kp[1]); })) return;
      var Q = clone(P);
      cd.patches.forEach(function (kp) { if (kp[0] === 'hh') Object.assign(Q.hh, kp[1]); else Object.assign(Q.members.filter(function (x) { return x.no === kp[0]; })[0], kp[1]); });
      var after = branchesOf(Q, th), g = gain(after, cur, want);
      if (!best || g.g > best.g.g) best = { cd: cd, Q: Q, g: g };
    });
    if (!best) return null;
    return { plan: best.Q, patches: best.cd.patches, hits: best.g.hits, note: best.cd.note };
    function mk(f, v) { var o = {}; o[f] = v; if (f === 'wagcshm') { o.other_income = 0; } return o; }
  }

  var api = { plan: plan, hhDefaults: hhDefaults, memberDefaults: memberDefaults, HH_SLOTS: HH_SLOTS, memberCands: memberCands, familyCands: familyCands, gradeFor: gradeFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SWDIPlanner = api;
})(this);
