/* Guided planning history. Cases contain only the responses read by the two scoring rules. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./swdi-engine') : root.SWDI;
  const words = s => s.split(' ');
  const member = {
    A: words('skills_n skills regskill1 regskill2 regskill3 educind gradel educal'),
    B: words('occup_s worked_last_week workind jobind jstatus avail willing'),
    C: words('ofw wagcshm wagcomm wagothm entrep_income other_income other_period pantawidcsh pantawidknd other_cct'),
    D: words('sssind sss_months gsisind gsis_months'), E: words('insurance finance_acct savings'),
    F: words('sickind avail_med ynotavail_med'), G: words('sickind confine'),
    H: words('stuntingind wastingind underweightind overweightind'), L: words('literacy_read literacy_write literacy_count literacy_understand'),
    M: words('internet digiact'), N: words('educind schattendance'), V: words('orgmem orgact1 orgofficer1'),
    W: words('birthreg vaccine educind schattendance childlabor childlabor_yes')
  };
  const hh = { C: words('imprnt imprnt_period'), I: words('water water_dist'), J: words('toil toil_shared'), K: ['garbage'],
    O: words('roof location'), P: words('wall location'), Q: ['tenur'], R: ['light'], S: E.ASSET_VARS.concat(E.LAND_VARS),
    T: E.PARENT_VARS, U: E.PROBLEMS.flatMap(p => [p, p + '_sol', p + '_res']), X: words('gvbind gvb_action'),
    Y: words('location gida disastkit disastkit_all disasknow_hotline disasknow_evac disasknow_hosp disasknow_other disasplan emersavings')
      .concat(E.DISASTERS.flatMap(d => [d, d + '_r'])) };
  const codes = E.INDICATORS.map(d => d.code);
  const totals = {ES:'es_raw', SA:'sa_raw', TOTAL:'total', LOWB:'lowb'};
  const averaged = new Set(E.INDICATORS.filter(d => d.agg === 'AVG').map(d => d.code));
  const variables = [...new Set(Object.values(hh).concat(Object.values(member)).flat())];
  const limits = { A: [15, 18], B: [15], C: [15], D: [15], E: [15], H: [19],
    L: [5, 6, 9, 10, 11, 64, 65], M: [10, 11, 64, 65], N: [3, 4, 18, 19], V: [15], W: [3, 5, 6, 18] };
  const ranges = { A: [15, Infinity], B: [15, Infinity], D: [15, Infinity], E: [15, Infinity], H: [0,18],
    L: [5,64], M: [10,64], N: [3,18], V: [15,Infinity], W: [0,17] };
  const active = m => !m.status || Number(m.status) === 1;
  function eligible(code, m) {
    const range = ranges[code];
    return active(m) && (!range || (m.age >= range[0] && m.age <= range[1]));
  }
  function applicable(code, roster) {
    return !member[code] || !roster || roster.some(m => eligible(code,m));
  }
  function band(code, m) {
    if (!active(m)) return 'inactive';
    return (limits[code] || []).filter(n => m.age >= n).length;
  }
  const multi = new Set(['skills','digiact','vaccine','gvbind','disastkit']);
  function value(x, field) {
    if (x == null || x === '') return '';
    // 0 = "None": the same scoring input as no activity group.
    if (multi.has(field)) return E.arr(x).filter(n => field !== 'digiact' || n !== 0).sort((a,b) => a-b).join(';');
    const n = E.num(x);
    return n === null ? String(x) : n;
  }
  function answer(record, key) {
    if (key === 'imprnt_period') return Number(record.imprnt) ? (Number(record[key]) === 2 ? 2 : 1) : '';
    if (key === 'other_period') return Number(record.other_income) ? (Number(record[key]) === 1 ? 1 : 2) : '';
    if (key === 'ynotavail_med' && Number(record.avail_med) !== 2) return '';
    return value(record[key], key);
  }
  function memberValues(code, m) {
    if ((!eligible(code, m) && code !== 'E' && code !== 'C') || (!active(m) && code !== 'C')) return [];
    // Employment compares the job, reference week and nature of work in both entry schemas.
    if (code === 'B') {
      const modern = value(m.occup_s) !== '';
      const employed = modern ? Number(m.occup_s) !== 999 : Number(m.workind) === 1 || Number(m.jobind) === 1;
      return employed ? ['job', value(modern ? m.worked_last_week : m.workind), value(m.jstatus)] :
        ['none', value(modern ? 2 : m.workind), value(m.avail), value(m.willing)];
    }
    return (member[code] || []).map(k => answer(m,k));
  }
  function signature(code, household, thresholds) {
    const th = thresholds || {};
    if (totals[code]) {
      // Keep each person's responses together, including when two households have the same marginal scores.
      const home = Object.keys(hh).map(c => hh[c].map(k => answer(household.hh,k)));
      const people = household.members.map(m => JSON.stringify(Object.keys(member).map(c => [band(c,m),memberValues(c,m)]))).sort();
      return JSON.stringify([home, people, value(th.food), value(th.poverty)]);
    }
    const home = (hh[code] || []).map(k => answer(household.hh,k));
    const rows = member[code] ? household.members.filter(m => active(m) || code === 'C')
      .map(m => JSON.stringify([band(code, m), memberValues(code, m)])).sort() : [];
    return JSON.stringify([home, rows, code === 'C' ? [value(th.food), value(th.poverty)] : []]);
  }
  function memberMix(result) {
    if (!result.members || !result.members.some(m => m.level != null)) return '';
    return result.members.map(m => m.level == null ? 'excluded' : m.level).sort().join('/');
  }
  function branches(both, code) {
    if (code === 'LOWB') return both.target.branches.filter(b => b.startsWith('Z.'));
    if (totals[code]) return [];
    return [...new Set(both.target.indicators[code].branches.concat(
      both.stata.indicators[code].branches.filter(b => /\.div\.|stata_missing|precedence_bug/.test(b))))];
  }
  function boundary(code, level, total, branches) {
    if (code === 'C') {
      const id = (branches || []).find(b => b.startsWith('C.bnd.pci_just_'));
      if (id) return 'PCI ' + id.split('pci_')[1].replace(/_/g,' ') + ' threshold';
    }
    if (code === 'LOWB' && total != null) {
      for (const cut of [E.CUT2,E.CUT3]) if (Math.abs(total - cut) < 0.02) return (total < cut ? 'Just below ' : 'At or just above ') + cut + ' LOWB cutoff';
    }
    if (averaged.has(code) && level != null && !Number.isInteger(level)) {
      const midpoint = Math.floor(level) + 0.5;
      return (level === midpoint ? 'At ' : level < midpoint ? 'Below ' : 'Above ') + midpoint + ' rounding midpoint';
    }
    return '';
  }
  function environment(v) {
    return ({Preprod: 'Newlogic Preprod', 'Preprod load test': 'DSWD Preprod Load Test'})[v] || v || '';
  }
  function history(records, env, excludeId) {
    const stats = {};
    codes.concat(Object.keys(totals)).forEach(c => { stats[c] = {levels: new Map(), cases: new Map(), mixes: new Set(), boundaries: new Set(), issues: [], seen: 0}; });
    const seen = new Set(), checked = new Set(), open = new Map(), fullCases = new Map();
    const baseline = records.filter(r => r.id !== excludeId).sort((a,b) => String(a.savedAt || a.id).localeCompare(String(b.savedAt || b.id)) || a.id.localeCompare(b.id));
    for (const r of baseline) {
      const scored = r.household && E.score(r.household, {thresholds: r.thresholds});
      const fullKey = scored && signature('TOTAL', r.household, r.thresholds);
      if (fullKey) fullCases.set(fullKey, r.id);
      const storedTotal = r.scores.find(s => s.code === 'TOTAL');
      for (const row of r.scores) {
        const stat = stats[row.code];
        if (!stat) continue;
        const verdicts = Object.entries(row.verdicts).filter(([,v]) => v);
        let exercised = row.branches;
        // Older builds credited exact income thresholds within a one-peso interval.
        if (row.code === 'C' && scored && r.thresholds && E.num(r.thresholds.food) !== null && E.num(r.thresholds.poverty) !== null) {
          exercised = exercised.filter(b => !b.startsWith('C.bnd.pci_')).concat(scored.indicators.C.branches.filter(b => b.startsWith('C.bnd.pci_')));
        }
        exercised.forEach(b => { seen.add(b); if (verdicts.length) checked.add(b); });
        const level = E.num(row.level);
        if (level !== null && applicable(row.code, r.household ? r.household.members : r.roster)) {
          const counts = stat.levels.get(level) || {planned: 0, checked: 0, passed: 0};
          counts.planned++;
          if (verdicts.length) counts.checked++;
          if (verdicts.some(([,v]) => v === 'PASS')) counts.passed++;
          stat.levels.set(level, counts);
        }
        stat.seen++;
        const edge = boundary(row.code, level, storedTotal && E.num(storedTotal.level), exercised);
        if (edge) stat.boundaries.add(edge);
        const key = totals[row.code] ? fullKey : (scored ? signature(row.code, r.household, r.thresholds) : '');
        if (key && !totals[row.code]) {
          stat.cases.set(key, 1 + (stat.cases.get(key) || 0));
          const mix = memberMix(scored.indicators[row.code]);
          if (mix) stat.mixes.add(mix);
        }
        if (environment(r.env) !== environment(env)) continue;
        const platforms = new Set(['SWDI App', '4Ps Forward', ...Object.keys(row.verdicts)]);
        for (const platform of platforms) {
          const verdict = row.verdicts[platform];
          // A pass on another platform, family outcome, or set of responses cannot close a previous discrepancy.
          const id = JSON.stringify([row.code, key || r.id, level, platform]);
          const prior = open.get(id);
          if (!verdict) {
            if (prior && key) prior.pendingRun = r.id;
            continue;
          }
          if (verdict === 'PASS') { open.delete(id); continue; }
          open.set(id, {code: row.code, key, level, platform, verdict, run: r.id, source: r.household,
            thresholds: r.thresholds, attempts: prior ? prior.attempts + 1 : 1});
        }
      }
    }
    for (const issue of open.values()) stats[issue.code].issues.push(issue);
    return {stats, seen, checked, fullCases, runs: baseline.length};
  }
  function fits(needs, roster) {
    const ages = roster.filter(active).map(m => Number(m.age));
    const count = (lo, hi) => ages.filter(a => a >= lo && a <= hi).length;
    if (needs === 'no member 0-17') return !count(0,17);
    if (needs === '3+ members, 2 adults') return ages.length >= 3 && count(15, Infinity) >= 2;
    if (needs === '2+ members 15+') return count(15, Infinity) >= 2;
    if (needs === '2+ children 0-17') return count(0,17) >= 2;
    const exact = /aged exactly (\d+)/.exec(needs), range = /(?:member|child)(?: aged)? (\d+)-(\d+)/.exec(needs);
    const under = /member under (\d+)/.exec(needs), above = /member (\d+)\+/.exec(needs);
    if (exact) return ages.includes(Number(exact[1]));
    if (range) return count(Number(range[1]), Number(range[2])) > 0;
    if (under) return count(0, Number(under[1])-1) > 0;
    if (above) return count(Number(above[1]), Infinity) > 0;
    return true;
  }
  function rosterNeed(s, roster) {
    if (s.id.includes('.f.')) {
      return roster.filter(m => eligible(s.ind, m)).length < 2 ? 'At least two eligible members for ' + s.ind : '';
    }
    if (s.id === 'C.case.moved_out_or_deceased_excluded') {
      if (!roster.some(m => !active(m))) return 'An inactive roster member';
    }
    return fits(s.needs, roster) ? '' : s.needs;
  }
  const api = {hh, member, variables, codes, totals, boundary, active, eligible, applicable, band, signature, memberMix, branches, history, fits, rosterNeed};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SWDICoverage = api;
})(this);
