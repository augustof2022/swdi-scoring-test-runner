/* Guided planning uses the policy and BRVD scoring engines to evaluate the final answers. */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./swdi-engine.js') : root.SWDI;
  var C = (typeof module !== 'undefined' && module.exports) ? require('./swdi-coverage') : root.SWDICoverage;
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
    if (a >= 5 && a <= 17) o.childlabor = 0;
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
      add('M', { internet: 1, digiact: '5' }); add('M', { internet: 1, digiact: '2' }); add('M', { internet: 1, digiact: '0' });
    }
    if (a >= 3 && a <= 18) { add('N', { educind: 2, gradel: '', schattendance: '' }); add('N', { schattendance: 1 }); add('N', { schattendance: 2 }); }
    if (a <= 17) {
      add('W', { birthreg: 2 });
      if (a <= 5) { add('W', { vaccine: '1;7' }); add('W', { vaccine: '1;2;3;4;5;6;7' }); add('W', { vaccine: '' }); }
      if (a >= 5) add('W', { childlabor: 1 });
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
      c.push({ ind: 'V', patches: p([[a1, { orgmem: 1, orgact1: 1, orgofficer1: 2 }], [a2, { orgmem: 1, orgact1: 2, orgofficer1: 2 }]]) });
      c.push({ ind: 'V', patches: p([[a1, { orgmem: 1, orgact1: 1, orgofficer1: 2 }], [a2, { orgmem: 1, orgact1: 1, orgofficer1: 2 }]]) });
      c.push({ ind: 'V', patches: p([[a1, { orgmem: 1, orgact1: 2, orgofficer1: 2 }], [a2, { orgmem: 1, orgact1: 2, orgofficer1: 2 }]]) });
    }
    return c;
  }

  // Score a complete candidate against the history. Shared fields can change several indicators.
  function entries(raw) {
    return {hh: raw.hh, members: raw.members.map(function (m) {
      const out = Object.assign({}, m);
      if (isActive(m)) setEmploymentAnswers(out, m.age);
      return out;
    })};
  }
  function patchPlan(plan, patches) {
    const copy = {hh: Object.assign({}, plan.hh), members: plan.members.map(m => Object.assign({}, m))};
    const members = new Map(copy.members.map(m => [m.no, m]));
    patches.forEach(([key, values]) => Object.assign(key === 'hh' ? copy.hh : members.get(key), values));
    return copy;
  }
  function issueMatch(issue, key, level) {
    return !issue.pendingRun && issue.key === key && (issue.level === level ||
      (issue.level != null && level != null && Math.abs(issue.level - level) < 0.000006));
  }
  function catalogWeight(id) {
    if (/\.div\.|\.chk\.|\.bnd\./.test(id)) return 4;
    if (/\.L\d|^Z\./.test(id)) return 3;
    return 2;
  }
  function purpose(code, actual, both, thresholds, history, want) {
    const ids = C.branches(both, code);
    let points = ids.reduce((n, id) => n + (want.has(id) ? catalogWeight(id) : 0), 0);
    if (!history) return points;
    const stat = history.stats[code], result = both.target.indicators[code];
    const level = result ? result.level : both.target[C.totals[code]];
    // Fractional averages and unobserved draft outcomes remain distinct from checked integer levels.
    if ((result || code === 'LOWB') && C.applicable(code, actual.members) && [1,2,3].includes(level) && !stat.levels.has(level)) points += stat.seen ? 32 : 3;
    const edge = C.boundary(code, level, both.target.total, ids);
    if (stat.seen && edge && !stat.boundaries.has(edge)) points += 6;
    if (!result && !stat.issues.length) return points;
    const key = C.signature(code, actual, thresholds), mix = result && C.memberMix(result);
    const usable = level != null || ids.some(id => /\.na\.|\.excl\.|\.chk\./.test(id));
    if (usable && stat.cases.size && !stat.cases.has(key)) points += 3;
    if (level != null && mix && stat.mixes.size && !stat.mixes.has(mix)) points += 5;
    const issues = stat.issues.filter(i => issueMatch(i, key, level));
    // Retests compete with novelty. Repeated open discrepancies get fewer successive interviews.
    if (issues.length) {
      const priority = result ? 1 : 3;
      points += priority * Math.max(...issues.map(i => (i.verdict === 'FAIL' ? 55 : 42) / i.attempts));
    }
    return points;
  }
  function memberOptions(ind, m) {
    const cs = memberCands(m).filter(c => c.ind === ind).map(c => Object.assign({}, c.patch));
    if (!cs.length) return [];
    const defaults = memberDefaults(m);
    const reset = (keys, p) => Object.assign(Object.fromEntries(keys.map(k => [k, defaults[k] == null ? '' : defaults[k]])), p);
    if (ind === 'B') return cs.map(p => reset(['workind','jobind','jstatus','avail','willing'], p));
    if (ind === 'A') return cs.map(p => reset(['skills_n','regskill1','regskill2','regskill3'], p));
    if (ind === 'G') return cs.concat([{}]).map(p => reset(C.member.G, {sickind: p.sickind || 2, confine: p.confine || 2}));
    if (ind === 'F') return cs.concat([{avail_med: 2, ynotavail_med: 5}]).map(p => {
      delete p.confine;
      if (p.avail_med === 1) p.ynotavail_med = '';
      return p;
    });
    if (ind === 'N') return cs.concat([{schattendance: 3}]).map(p =>
      p.educind === 2 ? p : Object.assign({educind: 1, gradel: gradeFor(m.age), educal: ''}, p));
    if (ind === 'W') {
      const good = {birthreg: 1};
      if (m.age <= 5) good.vaccine = ALL_VAX;
      if (m.age >= 5) good.childlabor = 0;
      if (m.age >= 3) Object.assign(good, {educind: 1, gradel: gradeFor(m.age), educal: '', schattendance: 3});
      const low = Object.assign({}, good, {birthreg: 2});
      if (m.age <= 5) low.vaccine = '';
      if (m.age >= 3) low.schattendance = 1;
      if (m.age >= 5) low.childlabor = 1;
      return cs.concat([good, low]);
    }
    if (ind === 'H' || ind === 'L' || ind === 'M' || ind === 'D') {
      return cs.concat([{}]).map(p => reset(C.member[ind], p));
    }
    return cs;
  }
  // Try coordinated family outcomes as well as changes to each individual member.
  function memberSearch(code, raw, choose, thresholds) {
    const groups = raw.members.filter(isActive).map(m => {
      const options = memberOptions(code, m), byLevel = {};
      options.forEach(p => {
        const one = entries({hh: raw.hh, members: [Object.assign({}, m, p)]});
        const level = E.score(one, {thresholds}).indicators[code].level;
        if (level !== null) (byLevel[level] || (byLevel[level] = [])).push(p);
      });
      return {no: m.no, options, byLevel};
    }).filter(g => g.options.length);
    if (!groups.length) return;
    const bundles = [];
    for (const pattern of [[1],[2],[3],[1,2,3],[3,2,1],[1,3],[1,2],[2,3]]) {
      for (let variant = 0; variant < 2; variant++) {
        const patches = groups.map((g,i) => {
          const opts = g.byLevel[pattern[i % pattern.length]];
          return opts && [g.no, opts[(i + variant) % opts.length]];
        });
        if (patches.every(Boolean)) bundles.push(patches);
      }
    }
    choose(bundles);
    groups.forEach(g => choose(g.options.map(p => [[g.no, p]])));
  }

  // Apply historical scoring inputs only to a compatible roster. Acceptance is based on the final signature.
  function replayHousehold(source, current) {
    const profile = m => JSON.stringify(Object.keys(C.member).map(c => C.band(c,m)));
    const buckets = new Map();
    for (const m of source.members) {
      const key = profile(m);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(m);
    }
    if (source.members.length !== current.members.length) return null;
    const extract = (keys, from) => Object.fromEntries(keys.map(k => [k, from[k] == null ? '' : from[k]]));
    const patches = [['hh', extract(Object.values(C.hh).flat(), source.hh)]];
    for (const m of current.members) {
      const matches = buckets.get(profile(m));
      if (!matches || !matches.length) return null;
      const p = extract(Object.values(C.member).flat(), matches.shift());
      if (isActive(m) && m.age >= 15 && !p.occup_s) setEmploymentAnswers(p, m.age);
      if (Number(p.childlabor_yes) === 1 && !Number(p.childlabor)) return null;
      if (Number(p.childlabor) > 0) { p.work_hrs = m.work_hrs || 2; p.work_tothrs = m.work_tothrs || 4; }
      patches.push([m.no, p]);
    }
    return patches;
  }
  function replay(issue, current) {
    const code = issue.code, source = issue.source;
    if (!source || !issue.key || issue.pendingRun) return null;
    if (C.totals[code]) return replayHousehold(source, current);
    const project = (keys, from) => Object.fromEntries(keys.map(k => [k, from[k] == null ? '' : from[k]]));
    const patches = C.hh[code] ? [['hh', project(C.hh[code], source.hh)]] : [];
    if (!C.member[code]) return patches;
    const buckets = new Map();
    for (const m of source.members.filter(m => isActive(m) || code === 'C')) {
      const band = C.band(code, m);
      if (!buckets.has(band)) buckets.set(band, []);
      buckets.get(band).push(m);
    }
    for (const m of current.members.filter(m => isActive(m) || code === 'C')) {
      const bucket = buckets.get(C.band(code, m));
      if (!bucket || !bucket.length) return null;
      const from = bucket.shift();
      if (!C.eligible(code, m) && code !== 'C' && code !== 'E') continue;
      const p = project(C.member[code], from);
      if (code === 'B') {
        if (!p.occup_s) setEmploymentAnswers(p, m.age);
        if (Number(p.occup_s) === 999) Object.assign(p, {wagcshm:'', entrep_income:''});
        else if (Number(p.workind) === 2) Object.assign(p, {entrep_income: m.entrep_income || m.wagcshm || 12000, wagcshm:''});
        else Object.assign(p, {wagcshm: m.wagcshm || m.entrep_income || 12000, entrep_income:''});
      }
      if (code === 'C' && isActive(m) && m.age >= 15) {
        // Each proposed worker must still have the requested annual wage or profit on the visible path.
        const wage = Number(p.wagcshm) > 0, profit = Number(p.entrep_income) > 0;
        if (Number(m.occup_s) === 999 ? wage || profit : Number(m.workind) === 2 ? (!profit || wage) : (!wage || profit)) return null;
      }
      if (code === 'N' || code === 'W') {
        if (Number(p.educind) === 1 && !m.gradel) p.gradel = gradeFor(m.age);
        if (Number(p.educind) === 2) p.gradel = '';
        if (code === 'W' && Number(p.childlabor_yes) === 1 && !Number(p.childlabor)) return null;
        if (code === 'W' && Number(p.childlabor) > 0) { p.work_hrs = m.work_hrs || 2; p.work_tothrs = m.work_tothrs || 4; }
      }
      patches.push([m.no, p]);
    }
    return [...buckets.values()].some(b => b.length) ? null : patches;
  }

  function plan(roster, uncovered, thresholds, history) {
    const want = new Set(uncovered || []);
    let P = {hh: hhDefaults(), members: roster.map(m => Object.assign({no:m.no, name:m.name, age:Number(m.age), status:m.status || 1}, memberDefaults(m)))};
    let finalForm = false, scoreLowb = false;
    // Compare the gains AND losses across every indicator which reads any changed input.
    function choose(options, force, avoidFullRepeat) {
      if (!options.length) return;
      const fields = {hh:new Set(), m:new Set()};
      options.forEach(patches => patches.forEach(([key,p]) => Object.keys(p).forEach(k => fields[key === 'hh' ? 'hh':'m'].add(k))));
      if (!finalForm && (fields.m.has('workind') || fields.m.has('jobind'))) fields.m.add('wagcshm');
      const affected = C.codes.filter(c => (C.hh[c] || []).some(k => fields.hh.has(k)) || (C.member[c] || []).some(k => fields.m.has(k))).concat(scoreLowb ? 'LOWB' : []);
      if (history) for (const code of ['ES','SA','TOTAL']) if (history.stats[code].issues.length) affected.push(code);
      function evaluate(q) {
        const actual = finalForm ? q : entries(q), both = E.scoreBoth(actual, {thresholds});
        const score = affected.reduce((total,c) => total + purpose(c, actual, both, thresholds, history, want), 0);
        return score - (avoidFullRepeat && history.fullCases.has(C.signature('TOTAL', actual, thresholds)) ? 1 : 0);
      }
      let best = P, points = force ? -Infinity : evaluate(P);
      for (const opt of options) {
        const q = patchPlan(P, opt), value = evaluate(q);
        if (value > points + 1e-9) { best = q; points = value; }
      }
      P = best;
    }
    HH_SLOTS.forEach(slot => {
      let options = slot.cands();
      if (slot.ind === 'Y') {
        // Outside a hazard area, roof and wall keep their level only with the next weaker material.
        options = options.flatMap(p => [p, Object.assign({location:2},p), Object.assign({location:2, roof:7, wall:8},p), Object.assign({location:2, roof:4, wall:5},p)]);
      }
      choose(options.map(p => [['hh',p]]));
    });
    const adults = P.members.filter(m => isActive(m) && m.age >= 15).map(m => m.no);
    for (const code of ['E','V']) choose(familyCands(adults).filter(c => c.ind === code).map(c => c.patches));
    for (const code of ['W','A','B','D','F','G','H','L','M','N']) memberSearch(code, P, choose, thresholds);
    // The overall level is compared from the income step on: before it, the total still lacks the heaviest indicator.
    scoreLowb = true;
    const income = incomeOptions(P, thresholds);
    choose(income, true);
    P = entries(P);
    finalForm = true;
    if (history) {
      for (const code of C.codes.concat(Object.keys(C.totals))) {
        const options = history.stats[code].issues.map(i => replay(i, P)).filter(Boolean);
        choose(options);
      }
      if (history.fullCases.has(C.signature('TOTAL',P,thresholds))) {
        // Break a whole-interview tie when previously used options can be recombined without losing a target.
        for (const slot of HH_SLOTS) {
          choose(slot.cands().map(p => [['hh',p]]), false, true);
          if (!history.fullCases.has(C.signature('TOTAL',P,thresholds))) break;
        }
      }
    }
    return describe(P, thresholds, history, want);
  }

  function describe(P, thresholds, history, want) {
    const both = E.scoreBoth(P, {thresholds}), rows = [], targets = [];
    const summaryCodes = ['LOWB'].concat(['ES','SA','TOTAL'].filter(c => history && history.stats[c].issues.length));
    for (const code of C.codes.concat(summaryCodes)) {
      const result = both.target.indicators[code], level = result ? result.level : both.target[C.totals[code]];
      const hits = C.branches(both, code).filter(id => want.has(id));
      const stat = history && history.stats[code], key = (result || (stat && stat.issues.length)) && C.signature(code, P, thresholds);
      const mix = result && C.memberMix(result);
      const edge = C.boundary(code, level, both.target.total, C.branches(both, code));
      const newBoundary = stat && stat.seen && edge && !stat.boundaries.has(edge) ? edge : '';
      const newLevel = !!stat && (!!result || code === 'LOWB') && C.applicable(code,P.members) && [1,2,3].includes(level) && !stat.levels.has(level);
      const issues = stat && key ? stat.issues.filter(i => issueMatch(i, key, level)) : [];
      const usable = level != null || hits.length > 0;
      const newCase = !!(stat && result && stat.seen && stat.cases.size && usable && !stat.cases.has(key));
      const newMix = !!(stat && stat.mixes.size && mix && level != null && !stat.mixes.has(mix));
      const goals = [];
      if (newLevel) goals.push(code + '.family.L' + level);
      if (newBoundary) goals.push(code + '.boundary.' + newBoundary);
      if (issues.length) goals.push(code + '.retest');
      if (newMix) goals.push(code + '.member_mix');
      if (newCase) goals.push(code + '.input_combination');
      rows.push({code, level, hits, newLevel, newCase, newMix, newBoundary, issues, open: stat ? stat.issues : [], members: result && result.members || [],
        excluded: C.member[code] ? P.members.filter(m => !C.eligible(code,m)) : []});
      if (!hits.length && !goals.length) continue;
      function tag(where, rec, vars, ids) {
        const patch = {};
        (vars || []).forEach(v => { if (rec[v] != null) patch[v] = rec[v]; });
        if (Object.keys(patch).length && ids.length) targets.push({ind:code, patches:[[where,patch]], scenarios:ids});
      }
      if (!result) continue;
      tag('hh', P.hh, C.hh[code], goals.concat(hits));
      P.members.filter(isActive).forEach(m => {
        const row = (result.members || []).find(r => r.no === m.no);
        if (!C.eligible(code,m)) return;
        let local = hits;
        if (row && row.br) local = hits.filter(id => id === row.br || row.extra.includes(id) || id.includes('.f.'));
        if (code === 'W') {
          const single = E.scoreBoth({hh:P.hh, members:[m]}, {thresholds});
          const childBranches = C.branches(single, code);
          local = hits.filter(id => childBranches.includes(id) || id === 'W.case.multiple_children_one_fails');
        }
        const ids = goals.concat(local);
        if (row && row.level != null && ids.length) ids.unshift(code + '.member.L' + row.level);
        tag(m.no, m, C.member[code], ids);
      });
    }
    return {household:P, targets, rows, repeatedRun: history && history.fullCases.get(C.signature('TOTAL',P,thresholds))};
  }

  // The scenario catalog uses legacy job flags. Translate the finished plan to BRVD entries.
  function setEmploymentAnswers(m, memberAge) {
    if (memberAge < 5) return;
    // Ages 5-14 answer only the child labor activity path, not adult PSOC employment questions.
    if (memberAge < 15) {
      ['occup_s', 'workind', 'jobind', 'jobind_specify', 'avail', 'willing', 'jstatus', 'worked_last_week']
        .forEach(function (key) { delete m[key]; });
      if (Number(m.childlabor) > 0) {
        if (m.work_hrs == null) m.work_hrs = 2;
        if (m.work_tothrs == null) m.work_tothrs = 4;
      } else { delete m.indust; delete m.work_hrs; delete m.work_tothrs; }
      return;
    }
    var working = Number(m.workind) === 1 || Number(m.jobind) === 1;
    if (working) {
      m.occup_s = m.entrep_income > 0 ? 9111 : 5220;
      m.worked_last_week = m.workind;
      m.workind = m.entrep_income > 0 ? 2 : 1;
      delete m.jobind; delete m.avail; delete m.willing;
      if (m.workind === 1 && m.wagcshm == null) m.wagcshm = 12000;
    } else {
      m.occup_s = 999; delete m.jstatus; delete m.worked_last_week;
      delete m.workind;
      m.jobind = memberAge < 18 ? 9 : 4;
      if (m.avail == null) m.avail = 2;
      if (m.willing == null) m.willing = 2;
    }
    if (memberAge <= 17) {
      if (Number(m.childlabor) > 0) {
        if (m.work_hrs == null) m.work_hrs = 2;
        if (m.work_tothrs == null) m.work_tothrs = 4;
      } else { delete m.indust; delete m.work_hrs; delete m.work_tothrs; }
    }
  }

  function incomeOptions(P, th) {
    var food = Number(th && th.food), pov = Number(th && th.poverty);
    if (!food || !pov) return [];
    var act = P.members.filter(isActive), all = P.members, A = act.length, K = all.length - A;
    var earners = act.filter(function (m) { return m.age >= 15 && (Number(m.workind) === 1 || Number(m.jobind) === 1); });
    var adults = act.filter(function (m) { return m.age >= 15; });
    var kids = act.filter(function (m) { return m.age >= 5 && m.age < 15; });
    var e = earners[0] || adults[0];
    if (!e) {
      if (!A || ![1,4,5,6].includes(Number(P.hh.tenur))) return [];
      return [0, food, pov].map(pci => [['hh', {imprnt_period: 2, imprnt: Math.ceil(pci * 12 * A)}]]);
    }
    var field = earners[0] ? 'wagcshm' : 'other_income';
    var cands = [];
    function amt(pci, fs, up) { var x = pci * 12 * fs; return up ? Math.ceil(x) : Math.floor(x); }
    function c(note, list) { cands.push({ note: note, patches: list }); }
    c('Low income → food poor', [[e.no, mk(field, earners.length ? Math.max(earners.length, amt(food / 2, A, false)) : 0)]]);
    c('PCI midway between food and poverty thresholds', [[e.no, mk(field, amt((food + pov) / 2, A, true))]]);
    c('PCI well above poverty threshold', [[e.no, mk(field, amt(pov * 2, A, true))]]);
    c('PCI exactly at the food threshold', [[e.no, mk(field, amt(food, A, true))]]);
    c('PCI exactly at the poverty threshold', [[e.no, mk(field, amt(pov, A, true))]]);
    [food,pov].forEach(cut => {
      const annual = cut * 12 * A;
      c('Annual income just below the threshold', [[e.no, mk(field, Math.max(0, Math.ceil(annual) - 1))]]);
      c('Annual income just above the threshold', [[e.no, mk(field, Math.floor(annual) + 1)]]);
    });
    var grantee = adults.filter(function (m) { return m.no !== e.no; })[0] || e;
    c('4Ps cash present; PCI below poverty only if 4Ps is excluded', [[e.no, mk(field, amt(pov - 300, A, false))], [grantee.no, { pantawidind: 1, pantawidcsh: Math.ceil(600 * 12 * A) }]]);
    if (kids.length) c('Income of a member under 15 (excluded by target rule)', [[e.no, mk(field, amt(pov - 200, A, false))], [kids[0].no, { other_income: Math.ceil(400 * 12 * A) }]]);
    var ofwC = adults.filter(function (m) { return m.no !== e.no; })[0];
    if (ofwC && A >= 3) c('OFW member: counted in family size (target) vs excluded (Stata)', [[e.no, mk(field, amt(pov, A - 0.5, true))], [ofwC.no, { ofw: 1 }]]);
    if (K > 0) c('Moved-out/deceased member: excluded from family size (target) vs counted (Stata)', [[e.no, mk(field, amt(pov, A + 0.5 * K, true))]]);
    if ([1, 4, 5, 6].indexOf(Number(P.hh.tenur)) >= 0) c('Imputed rent added to income (target) vs ignored (Stata)', [[e.no, mk(field, amt(pov - 500, A, false))], ['hh', { imprnt: 500 * A }]]);
    const options = [];
    cands.forEach(function (cd) {
      // Divide the proposed annual earnings across all workers before scoring the candidate.
      // Keeping the total intact preserves threshold and imputed-rent scenarios.
      if (earners.length) {
        var incomePatch = cd.patches[0][1], total = incomePatch.wagcshm;
        if (total < earners.length) return;
        delete incomePatch.wagcshm;
        earners.forEach(function (worker, i) {
          var amount = Math.floor(total / earners.length) + (i < total % earners.length ? 1 : 0);
          cd.patches.push([worker.no, mk(i % 2 ? 'entrep_income' : 'wagcshm', amount)]);
        });
      }
      options.push(cd.patches);
    });
    return options;
    function mk(f, v) { var o = {}; o[f] = v; if (f === 'wagcshm') { o.other_income = 0; } return o; }
  }

  var api = { setEmploymentAnswers: setEmploymentAnswers, plan: plan, hhDefaults: hhDefaults, memberDefaults: memberDefaults, HH_SLOTS: HH_SLOTS, memberCands: memberCands, familyCands: familyCands, gradeFor: gradeFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SWDIPlanner = api;
})(this);
