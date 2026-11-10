/* SWDI Scoring Engine — test oracle for the Enhanced SWDI (25 indicators).
 *
 * Two rule sets are computed side by side:
 *   'target' — DSWD-intended rule: Criteria for the Levels of Well-Being + DSWD comments in
 *              BRVD Annex A v0.4 "Scoring Rules".
 *   'stata'  — the BRVD Stata command exactly as written, including Stata's sequential
 *              `replace` overwrite order and missing-value behaviour (missing > any number).
 * Every member-level and family-level result carries a plain-language `why` (the criterion that
 * was applied, or the reason a member was excluded) so testers can check the grading.
 * Works in browsers, Node and Google Apps Script (no dependencies).
 */
(function (root) {
  'use strict';

  var INDICATORS = [
    { code: 'A', key: 'skills', name: 'Employable skill', dim: 'ES', w: 0.0185, scope: 'member', agg: 'AVG', cov: '15+ (Stata: 18+)',
      criteria: { 1: 'Member possesses 0 professional/technical/occupational skills', 2: '1 skill, not duly recognized by appropriate authorities', 3: 'At least 1 duly recognized skill, OR at least 2 skills (recognized or not), OR at least a senior high school diploma' } },
    { code: 'B', key: 'employment', name: 'Employment', dim: 'ES', w: 0.0370, scope: 'member', agg: 'AVG', cov: '15+, working or willing & available',
      criteria: { 1: 'Not working, and willing and available to work', 2: 'Short-term/seasonal/casual job or business, unpaid family work, or different employers per day/week', 3: 'Regular/permanent job or business / unpaid family work' } },
    { code: 'C', key: 'income', name: 'Income', dim: 'ES', w: 0.2500, scope: 'family', agg: 'PCI vs thresholds', cov: 'all active members',
      criteria: { 1: 'Food poor: monthly per-capita income (net of 4Ps/CCT) below the food threshold', 2: 'Income poor: at least the food threshold but below the poverty threshold', 3: 'Not income poor: at least the poverty threshold' } },
    { code: 'D', key: 'socsec', name: "Family's Access to Social Security", dim: 'ES', w: 0.0139, scope: 'member', agg: 'MAX', cov: '15+',
      criteria: { 1: 'Nobody in the family is an active SSS/GSIS member', 2: 'At least one active member, membership less than 2 years (< 24 months)', 3: 'At least one active member for at least 2 years (≥ 24 months)' } },
    { code: 'E', key: 'fininst', name: "Family's Access to Financial Institutions", dim: 'ES', w: 0.0139, scope: 'family', agg: 'COUNT', cov: '15+',
      criteria: { 1: 'Nobody has insurance, a financial account or savings', 2: 'One member has access/account (insurance or financial institution), no savings', 3: 'At least two members have access/account, OR at least one member has savings' } },
    { code: 'F', key: 'healthsvc', name: 'Availment of accessible health services (past 6 months)', dim: 'SA', w: 0.1018, scope: 'member', agg: 'AVG', cov: 'all members',
      criteria: { 1: 'Got sick but did not want to avail, or went to non-professional providers (albularyo, hilot)', 2: 'Wanted to avail but did not: poor health services, poor client services, or no accessible services', 3: 'Availed health services (treatment/prevention), or did not need to avail (not sick)' } },
    { code: 'G', key: 'healthcond', name: 'Health Condition (past 6 months)', dim: 'SA', w: 0.0509, scope: 'member', agg: 'MIN', cov: 'all members',
      criteria: { 1: 'Injured/sick needing hospital confinement, or bedridden / chronic illness needing maintenance', 2: 'Injured/sick needing medical attention but not confinement', 3: 'Not injured or sick needing medical attention or confinement' } },
    { code: 'H', key: 'nutrition', name: 'Nutritional status of children aged 0-18', dim: 'SA', w: 0.0509, scope: 'member', agg: 'AVG', cov: '0-18',
      criteria: { 1: 'Severely wasted, stunted or obese (code 4 severely under / 5 severely over)', 2: 'Moderately wasted or stunted, or overweight (code 2 moderately under / 3 moderately over)', 3: 'Normal (code 1 on all four measures)' } },
    { code: 'I', key: 'water', name: 'Access to improved drinking water', dim: 'SA', w: 0.0255, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Unprotected well (32), unprotected spring (42), surface water (81)', 2: 'Improved source but collection takes longer than 30 minutes', 3: 'Improved source within 30 minutes, piped into dwelling/yard, water refilling station (72) or bottled water (91)' } },
    { code: 'J', key: 'sanitation', name: 'Access to sanitary toilet facilities', dim: 'SA', w: 0.0255, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Open defecation / no facility (95)', 2: 'Unimproved facility (14, 15, 23, 41, 51, 71), or improved facility shared with other families', 3: 'Owns improved facility, not shared (11, 12, 13, 21, 22, 31)' } },
    { code: 'K', key: 'garbage', name: 'Access to Proper Garbage Disposal', dim: 'SA', w: 0.0255, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Unsafe disposal: dumping in pit, burning, throwing in esteros/rivers, no clear manner (1-4)', 2: 'Proper but not segregated: truck, composting, burying (5-7)', 3: 'Proper with segregation (8-10)' } },
    { code: 'L', key: 'literacy', name: 'Functional literacy (members aged 5-64)', dim: 'SA', w: 0.0625, scope: 'member', agg: 'AVG', cov: '5-64',
      criteria: { 1: 'Cannot read, write and count (5-9) / and understand (10-64)', 2: 'Difficulty in at least one but not all', 3: 'Able to read, write and count (5-9) / and understand simple messages (10-64)' } },
    { code: 'M', key: 'diglit', name: 'Digital Literacy (members aged 10-64)', dim: 'SA', w: 0.0625, scope: 'member', agg: 'AVG', cov: '10-64',
      criteria: { 1: 'Did not use the internet in the past 3 months', 2: 'Used the internet; at least 1 activity under (a) Information and data literacy only', 3: 'Used the internet; at least 1 activity under (b) Communication, (c) Content creation, (d) Safety or (e) Problem solving' } },
    { code: 'N', key: 'school', name: 'School enrolment/attendance (children aged 3-18)', dim: 'SA', w: 0.1250, scope: 'member', agg: 'AVG', cov: '3-18',
      criteria: { 1: 'Not currently enrolled, or enrolled with attendance below 70%', 2: 'Enrolled, attendance at least 70% but below 85%', 3: 'Enrolled, attendance at least 85%' } },
    { code: 'O', key: 'roof', name: 'Construction materials of the roof', dim: 'SA', w: 0.0046, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Makeshift/salvaged (7), or light materials (4, 5) in a hazard-prone area', 2: 'Light materials (wood/bamboo, sod/thatch), or strong materials in a hazard-prone area', 3: 'Strong materials (metal, concrete/clay tile, half GI, asbestos), not hazard-prone' } },
    { code: 'P', key: 'wall', name: 'Construction materials of outer walls', dim: 'SA', w: 0.0046, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Makeshift/salvaged (8), or light materials (5, 6) in a hazard-prone area', 2: 'Light materials (wood/bamboo, sawali/cogon/nipa), or strong materials in a hazard-prone area', 3: 'Strong materials (concrete/brick, metal, half concrete, glass, asbestos, fiber cement), not hazard-prone' } },
    { code: 'Q', key: 'tenure', name: 'Tenure status of the house', dim: 'SA', w: 0.0093, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Own house rent-free lot without consent (1); rent-free house and lot without consent (2)', 2: 'Shared rented unit/room (3); own house rent-free lot with consent (6); rent-free house and lot with consent (8)', 3: 'Own or owner-like possession (4); own house rent lot (5); rent house including lot (7)' } },
    { code: 'R', key: 'lighting', name: 'Lighting facility of the house', dim: 'SA', w: 0.0093, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'None (5); homemade lamp/gasera/candle (9); solar 4-6 hours (6)', 2: 'Kerosene (2); oil or gas lamp (4); solar 7-12 hours (7)', 3: 'Electricity (1); LPG (3); solar 12+ hours (8)' } },
    { code: 'S', key: 'assets', name: 'Ownership of Assets', dim: 'SA', w: 0.0255, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Owns 3 or fewer assets', 2: 'Owns 4-5 assets', 3: 'Owns 6 or more assets' } },
    { code: 'T', key: 'parenting', name: 'Parenting Engagement and Support', dim: 'SA', w: 0.0278, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: '0-1 of the 9 parenting practices', 2: '2-4 practices', 3: 'At least 5 practices' } },
    { code: 'U', key: 'discern', name: 'Ability to discern problems and arrive at solutions', dim: 'SA', w: 0.0185, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Experienced a problem and could not identify any solution', 2: 'Identified solutions but has not resolved the problem yet', 3: 'No problem experienced, or all problems experienced were resolved' } },
    { code: 'V', key: 'participation', name: 'Participation in organizations/associations (past 12 months)', dim: 'SA', w: 0.0093, scope: 'family', agg: 'COUNT', cov: '15+',
      criteria: { 1: 'No member is part of any organization/association/support group', 2: 'A member is part of an organization, or one member participated in its activities', 3: 'A member is an officer, or more than one member participated in activities' } },
    { code: 'W', key: 'childrights', name: 'Protection of the rights of children', dim: 'SA', w: 0.0093, scope: 'family', agg: 'CHILDREN', cov: '0-17',
      criteria: { 1: 'A child experienced only 1 of: birth registered, basic immunization, enrolled & regularly attending, not in child labour', 2: 'A child experienced 2-3 of them', 3: 'Every child experienced all (age-appropriate) of them' } },
    { code: 'X', key: 'gbv', name: 'Protection from gender-based violence', dim: 'SA', w: 0.0093, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'A member experienced GBV and no action has been taken', 2: 'Reported to support authorities (parent leader, C/ML, social worker)', 3: 'No member experienced GBV, or reported to formal authorities (barangay, police, court)' } },
    { code: 'Y', key: 'drrm', name: 'Practice of Disaster Risk Reduction and Management', dim: 'SA', w: 0.0093, scope: 'family', agg: 'HH', cov: 'household',
      criteria: { 1: 'Hazard-prone area or GIDA; or none of kit/knowledge/plan/savings; or affected and not recovered', 2: '1-2 of the items; or 3+ items and partially recovered', 3: '3+ of kit/knowledge/plan/savings, and fully recovered or not affected' } }
  ];
  var ES_W = 0.3333, SA_W = 0.6669, CUT3 = 2.83, CUT2 = 1.83;
  var ASSET_VARS = ['ref', 'aircon', 'wash', 'stove', 'radio', 'tv', 'stereo', 'landline', 'oldcp', 'smartcp', 'tablet',
    'car', 'van', 'jeep', 'truck', 'motor', 'ebike', 'tric', 'bic', 'pedicab', 'motorboat', 'nonmotorboat'];
  var LAND_VARS = ['land_agri', 'land_res', 'land_com', 'fishpond', 'fishpen'];
  var PARENT_VARS = ['children_interaction', 'children_idea', 'children_communicate', 'children_behavior', 'children_role',
    'children_feedback', 'children_problem', 'children_rules', 'children_action'];
  var PROBLEMS = ['probfin', 'probhealth', 'probconflict', 'probothers'];
  var DISASTERS = ['typhoon', 'drought', 'flood', 'earthquake', 'landslide', 'pest', 'pollution', 'fire', 'volerupt', 'disastothers'];
  var STATA_DISASTERS = ['typhoon', 'drought', 'flood', 'earthquake', 'landslide', 'pest', 'pollution', 'fire', 'disastothers'];
  var KIT_ALL = [];
  for (var k = 1; k <= 19; k++) KIT_ALL.push(k);
  var MANDATORY_VAX = [1, 2, 3, 4, 5, 6, 7, 8];
  var LBL = {
    water: { 11: 'Piped into dwelling', 12: 'Piped into yard', 13: 'Piped to neighbor', 14: 'Public tap', 21: 'Tube well', 31: 'Protected well', 41: 'Protected spring', 51: 'Rainwater', 61: 'Tanker truck', 71: 'Cart with small tank', 72: 'Refilling station', 91: 'Bottled water', 32: 'Unprotected well', 42: 'Unprotected spring', 81: 'Surface water' },
    toil: { 11: 'Flush to sewer', 12: 'Flush to septic tank', 13: 'Flush to pit latrine', 21: 'Ventilated improved latrine', 22: 'Pit latrine with slab', 31: 'Composting toilet', 14: 'Flush to open drain', 23: 'Pit latrine without slab', 41: 'Bucket', 51: 'Hanging toilet', 15: "Flush to don't know where", 71: 'Public toilet', 95: 'No facility / open defecation' },
    ynot: { 1: 'poor health services', 2: 'poor client services', 3: 'no accessible services', 4: 'non-professional provider (albularyo/hilot)', 5: 'did not need (not sick)', 99: 'did not want to avail' },
    jstatus: { 1: 'permanent/regular', 2: 'short-term/seasonal/casual', 3: 'different employers per day/week' },
    maln: { 1: 'normal', 2: 'moderately under', 3: 'moderately over', 4: 'severely under', 5: 'severely over' },
    att: { 1: 'below 70%', 2: '70% to below 85%', 3: '85% or more' },
    gvb: { 1: 'reported to formal authorities', 2: 'reported to support authorities', 3: 'no action taken' },
    rec: { 1: 'fully recovered', 2: 'partially recovered', 3: 'not recovered' }
  };

  // ---------- helpers ----------
  function blank(v) { return v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v)); }
  function num(v) { if (blank(v)) return null; var n = Number(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; }
  function is(v, x) { var n = num(v); return n !== null && n === x; }
  function yes(v) { return v === true || v === 'TRUE' || is(v, 1); }
  function yn(v) { return is(v, 1) ? 'Yes' : is(v, 2) ? 'No' : '—'; }
  function arr(v) {
    if (blank(v)) return [];
    if (Array.isArray(v)) return v.map(Number).filter(function (x) { return !isNaN(x); });
    return String(v).split(/[;,|]/).map(function (s) { return s.trim(); }).filter(Boolean).map(Number).filter(function (x) { return !isNaN(x); });
  }
  function inList(v, list) { var n = num(v); return n !== null && list.indexOf(n) >= 0; }
  function stataGT(v, x) { var n = num(v); return n === null ? true : n > x; }   // Stata: missing is +infinity
  function stataLE(v, x) { var n = num(v); return n === null ? false : n <= x; }
  function active(m) { return blank(m.status) || is(m.status, 1); }
  function age(m) { return num(m.age); }
  function inAge(m, lo, hi) { var a = age(m); return a !== null && a >= lo && a <= hi; }
  function mean(xs) { if (!xs.length) return null; var s = 0; xs.forEach(function (x) { s += x; }); return s / xs.length; }
  function r4(x) { return x === null ? null : Math.round(x * 100000) / 100000; }
  function f2(x) { return Math.round(x * 100) / 100; }
  function lb(map, v) { var n = num(v); return n === null ? '—' : (map[n] ? map[n] + ' (' + n + ')' : 'code ' + n); }
  function skillCount(m) { var n = num(m.skills_n); return n !== null ? n : arr(m.skills).length; }
  function isSHS(code) {
    var c = num(code); if (c === null) return false;
    return c === 24015 || (c >= 34013 && c <= 34018) || (c >= 34023 && c <= 34028) || c === 34033 || c >= 35013;
  }
  function shsBucket(c) {
    c = num(c); if (c === null) return null;
    if (c === 24015) return '24015 HS grad (old curriculum)';
    if (c >= 34013 && c <= 34018) return '34013-34018 SHS Academic grads';
    if (c >= 34023 && c <= 34028) return '34023-34028 SHS Arts & Design grads';
    if (c === 34033) return '34033 SHS Sports grad';
    if (c >= 35013 && c <= 35018) return '35013-35018 SHS TVL grads';
    if (c >= 40001 && c < 50000) return '400xx Post-secondary';
    if (c >= 50001 && c < 60000) return '500xx Short-cycle tertiary';
    if (c >= 60001 && c < 70000) return '600xx Bachelor level';
    if (c >= 70000 && c < 80000) return '700xx Master level';
    if (c >= 80000) return '800xx Doctoral level';
    return null;
  }
  function ex(br, why) { return { level: null, br: br, why: why }; }

  // ---------- member-level indicators ----------
  function mSkills(m, rs) {
    var a = age(m), min = rs === 'stata' ? 18 : 15;
    if (a === null || a < min) return ex(a !== null && a >= 15 ? 'A.excl.15to17_stata_only' : 'A.excl.under15', 'age ' + a + ' — outside coverage (' + min + '+)');
    var n = skillCount(m), rec = false;
    for (var i = 1; i <= Math.max(n, 3); i++) if (yes(m['regskill' + i])) rec = true;
    var attending = yes(m.educind);
    var edu = rs === 'stata' ? (attending ? m.gradel : null) : (attending ? m.gradel : m.educal);
    var shs = isSHS(edu), lvl, br, why;
    if (n === 0) { lvl = 1; br = 'A.L1.no_skill'; }
    if (n === 1) { lvl = 2; br = 'A.L2.one_skill_not_recognized'; }
    if (rec) { lvl = 3; br = 'A.L3.recognized_skill'; }
    if (n >= 2 && !rec) { lvl = 3; br = 'A.L3.two_plus_skills'; }
    if (shs) { if (lvl !== 3) br = 'A.L3.shs_or_higher'; lvl = 3; }
    why = n + ' skill(s)' + (n ? (rec ? ', at least one recognized' : ', none recognized') : '') + '; ' +
      (attending ? 'attending, grade ' + (blank(m.gradel) ? '—' : m.gradel) : 'highest attainment ' + (blank(m.educal) ? '—' : m.educal) + (rs === 'stata' ? ' (Stata reads gradel only)' : '')) +
      (shs ? ' = SHS diploma or higher' : ' (not SHS graduate)');
    var extra = [];
    if (shs) extra.push('A.code.' + shsBucket(edu));
    if (!shs && [34011, 34012, 34021, 34022, 34031, 34032, 35011, 35012].indexOf(num(edu)) >= 0) extra.push('A.bnd.grade11_12_not_graduate');
    if (a >= 15 && a < 18) extra.push('A.age.15to17');
    return { level: lvl, br: br, extra: extra, why: why };
  }

  function mEmployment(m) {
    var a = age(m);
    if (a === null || a < 15) return ex('B.excl.under15', 'age ' + a + ' — outside coverage (15+)');
    var w = num(m.workind), j = num(m.jobind), js = num(m.jstatus), lvl = null, br = 'B.excl.not_working_not_willing_available';
    var why = 'worked past week: ' + yn(w) + (w === 2 ? ', has job/business: ' + yn(j) : '');
    if (w === 2 && is(m.avail, 1) && is(m.willing, 1)) { lvl = 1; br = 'B.L1.not_working_willing_available'; }
    if ((w === 1 || (w === 2 && j === 1)) && (js === 2 || js === 3)) { lvl = 2; br = js === 2 ? 'B.L2.short_term_seasonal_casual' : 'B.L2.per_day_per_week'; if (w === 2) br += '_not_past_week'; }
    if ((w === 1 || (w === 2 && j === 1)) && js === 1) { lvl = 3; br = 'B.L3.regular' + (w === 2 ? '_not_past_week' : ''); }
    if (w === 1 || j === 1) why += '; nature: ' + lb(LBL.jstatus, js);
    else why += '; available: ' + yn(m.avail) + ', willing: ' + yn(m.willing);
    if (lvl === null) why += ' — not scored (not willing/available), excluded from the average';
    return { level: lvl, br: br, why: why };
  }

  function mSocsec(m) {
    var a = age(m);
    if (a === null || a < 15) return ex('D.excl.under15', 'age ' + a + ' — outside coverage (15+)');
    var s = num(m.sssind), g = num(m.gsisind), sm = num(m.sss_months), gm = num(m.gsis_months), lvl = null, br = 'D.unanswered';
    if (s === 2 && g === 2) { lvl = 1; br = 'D.L1.no_sss_gsis'; }
    if ((s === 1 && sm !== null && sm < 24) || (g === 1 && gm !== null && gm < 24)) { lvl = 2; br = (s === 1 && sm < 24) ? 'D.L2.sss_under_24m' : 'D.L2.gsis_under_24m'; }
    if ((s === 1 && (sm === null || sm >= 24)) || (g === 1 && (gm === null || gm >= 24))) { lvl = 3; br = (s === 1 && (sm === null || sm >= 24)) ? 'D.L3.sss_24m_plus' : 'D.L3.gsis_24m_plus'; }
    var why = 'SSS: ' + yn(s) + (s === 1 ? ' (' + (sm === null ? '?' : sm) + ' months)' : '') + ', GSIS: ' + yn(g) + (g === 1 ? ' (' + (gm === null ? '?' : gm) + ' months)' : '');
    var extra = [];
    if (sm === 23 || gm === 23) extra.push('D.bnd.23_months');
    if (sm === 24 || gm === 24) extra.push('D.bnd.24_months');
    return { level: lvl, br: br, extra: extra, why: why };
  }

  function mHealthSvc(m, rs) {
    var a = num(m.avail_med), y = num(m.ynotavail_med), s = num(m.sickind), lvl = null, br = 'F.unanswered';
    var l1 = a === 2 && (y === 99 || y === 4) && (rs === 'stata' || s === 1);
    if (l1) { lvl = 1; br = y === 4 ? 'F.L1.non_professional_provider' : 'F.L1.did_not_want'; }
    if (a === 2 && (y === 1 || y === 2 || y === 3)) { lvl = 2; br = ['', 'F.L2.poor_health_services', 'F.L2.poor_client_services', 'F.L2.no_accessible_services'][y]; }
    if (a === 1 || (a === 2 && y === 5)) { lvl = 3; br = a === 1 ? 'F.L3.availed' : 'F.L3.did_not_need'; }
    var why = 'availed: ' + yn(a) + (a === 2 ? ', reason: ' + lb(LBL.ynot, y) : '') + '; sick: ' + yn(s);
    if (lvl === null) why += a === 2 && y === null ? ' — no reason recorded, cannot be scored' : ' — not scored under this rule';
    var extra = [];
    if (a === 2 && (y === 99 || y === 4) && s === 2) extra.push('F.div.not_sick_but_did_not_avail');
    return { level: lvl, br: br, extra: extra, why: why };
  }

  function mHealthCond(m, rs) {
    var s = num(m.sickind), c = num(m.confine), lvl = null, br = 'G.unanswered';
    if (rs === 'stata') {
      if (s === 1 && c === 1) { lvl = 1; br = 'G.L1.confined_or_chronic'; }
      if (s === 1 && c === 2) { lvl = 2; br = 'G.L2.sick_not_confined'; }
      if (s === 2) { lvl = 3; br = 'G.L3.not_sick'; }
    } else {
      if (c === 1) { lvl = 1; br = 'G.L1.confined_or_chronic'; }
      else if (s === 1 && c === 2) { lvl = 2; br = 'G.L2.sick_not_confined'; }
      else if (s === 2 && c === 2) { lvl = 3; br = 'G.L3.not_sick'; }
    }
    var extra = [];
    if (s === 2 && c === 1) extra.push('G.div.chronic_but_not_sick');
    return { level: lvl, br: br, extra: extra, why: 'sick needing attention: ' + yn(s) + ', confined/bedridden/chronic: ' + yn(c) };
  }

  function mNutrition(m, rs) {
    if (!inAge(m, 0, 18)) return ex('H.excl.age_19_plus', 'age ' + age(m) + ' — outside coverage (0-18)');
    var st = num(m.stuntingind), wa = num(m.wastingind), uw = num(m.underweightind), ov = num(m.overweightind);
    var three = [st, wa, uw], four = [st, wa, uw, ov], lvl = null, br = 'H.unanswered';
    function any(list, codes) { return list.some(function (x) { return codes.indexOf(x) >= 0; }); }
    if (rs === 'stata') {
      if (any(three, [4, 5])) { lvl = 1; br = 'H.L1.severe'; }
      if (any(three, [2, 3])) { lvl = 2; br = 'H.L2.moderate'; }
      if (st === 1 && wa === 1 && uw === 1) { lvl = 3; br = 'H.L3.normal'; }
    } else {
      if (any(four, [4, 5])) { lvl = 1; br = (ov === 5 || any(three, [5])) ? 'H.L1.severely_over' : 'H.L1.severely_under'; }
      else if (any(four, [2, 3])) { lvl = 2; br = (ov === 3 || any(three, [3])) ? 'H.L2.moderately_over' : 'H.L2.moderately_under'; }
      else if (four.every(function (x) { return x === 1; })) { lvl = 3; br = 'H.L3.normal'; }
    }
    var why = 'stunting ' + lb(LBL.maln, st) + ', wasting ' + lb(LBL.maln, wa) + ', underweight ' + lb(LBL.maln, uw) + ', overweight ' + lb(LBL.maln, ov) + (rs === 'stata' ? ' (Stata ignores overweight)' : '');
    var extra = [];
    if ((ov === 3 || ov === 5) && three.every(function (x) { return x === 1; })) extra.push('H.div.overweight_only');
    if (any(four, [4, 5]) && any(four, [2, 3])) extra.push('H.div.severe_plus_moderate');
    return { level: lvl, br: br, extra: extra, why: why };
  }

  function mLiteracy(m, rs) {
    var a = age(m);
    if (a === null || a < 5) return ex('L.excl.under5', 'age ' + a + ' — outside coverage (5-64)');
    if (a > 64) return ex('L.excl.65plus', 'age ' + a + ' — outside coverage (5-64)');
    var r = num(m.literacy_read), w = num(m.literacy_write), c = num(m.literacy_count), u = num(m.literacy_understand);
    var young = a <= 9, items = young ? [r, w, c] : [r, w, c, u];
    var allNo = items.every(function (x) { return x === 2; }), allYes = items.every(function (x) { return x === 1; });
    var anyNo = items.some(function (x) { return x === 2; });
    var grp = young ? '5to9' : '10to64', lvl = null, br = 'L.unanswered';
    if (rs === 'stata') {
      if (allNo) { lvl = 1; br = 'L.L1.cannot_all_' + grp; }
      if (anyNo) { lvl = 2; br = allNo ? 'L.L1.cannot_all_' + grp : 'L.L2.difficulty_some_' + grp; }
      if (allYes) { lvl = 3; br = 'L.L3.able_all_' + grp; }
    } else {
      if (allNo) { lvl = 1; br = 'L.L1.cannot_all_' + grp; }
      else if (allYes) { lvl = 3; br = 'L.L3.able_all_' + grp; }
      else if (anyNo) { lvl = 2; br = 'L.L2.difficulty_some_' + grp; }
    }
    var why = 'read ' + yn(r) + ', write ' + yn(w) + ', count ' + yn(c) + (young ? ' (age 5-9: understand not asked)' : ', understand ' + yn(u)) +
      (rs === 'stata' && allNo ? ' — Stata overwrite turns all-No into 2' : '');
    var extra = [];
    if (!young && r === 1 && w === 1 && c === 1 && u === 2) extra.push('L.chk.basic_literacy_understand_no');
    if (a === 5 || a === 9 || a === 10 || a === 64) extra.push('L.bnd.age_' + a);
    return { level: lvl, br: br, extra: extra, why: why };
  }

  function mDigital(m) {
    var a = age(m);
    if (a === null || a < 10) return ex('M.excl.under10', 'age ' + a + ' — outside coverage (10-64)');
    if (a > 64) return ex('M.excl.65plus', 'age ' + a + ' — outside coverage (10-64)');
    var i = num(m.internet), d = arr(m.digiact), lvl = null, br = 'M.unanswered';
    if (i === 2) { lvl = 1; br = 'M.L1.no_internet'; }
    if (i === 1 && d.indexOf(1) >= 0) { lvl = 2; br = 'M.L2.info_data_literacy_only'; }
    if (i === 1 && d.some(function (x) { return x >= 2 && x <= 5; })) { lvl = 3; br = 'M.L3.higher_activity'; }
    var why = 'used internet: ' + yn(i) + (i === 1 ? ', activity groups: ' + (d.length ? d.join(', ') : 'none') : '');
    if (i === 1 && !d.length) why += ' — no rule assigns a level';
    var extra = d.filter(function (x) { return x >= 1 && x <= 5; }).map(function (x) { return 'M.act.' + x; });
    if (i === 1 && !d.length) extra.push('M.chk.internet_but_no_activity');
    if (a === 10 || a === 64) extra.push('M.bnd.age_' + a);
    return { level: lvl, br: br, extra: extra, why: why };
  }

  function mSchool(m) {
    var a = age(m);
    if (a === null || a < 3) return ex('N.excl.under3', 'age ' + a + ' — outside coverage (3-18)');
    if (a > 18) return ex('N.excl.19plus', 'age ' + a + ' — outside coverage (3-18)');
    var e = num(m.educind), s = num(m.schattendance), lvl = null, br = 'N.unanswered';
    if (e === 2) { lvl = 1; br = 'N.L1.not_enrolled'; }
    if (e === 1 && s === 1) { lvl = 1; br = 'N.L1.attendance_below_70'; }
    if (e === 1 && s === 2) { lvl = 2; br = 'N.L2.attendance_70_to_84'; }
    if (e === 1 && s === 3) { lvl = 3; br = 'N.L3.attendance_85_plus'; }
    var extra = [];
    if (a === 3 || a === 18) extra.push('N.bnd.age_' + a);
    return { level: lvl, br: br, extra: extra, why: 'attending: ' + yn(e) + (e === 1 ? ', attendance ' + lb(LBL.att, s) : '') };
  }

  // ---------- family-level indicators ----------
  function incomeParts(m) {
    var wage = (num(m.wagcshm) || 0) + (num(m.wagcomm) || 0) + (num(m.wagothm) || 0);
    var other = (num(m.entrep_income) || 0) + (num(m.other_income) || 0);
    var cct = (num(m.pantawidcsh) || 0) + (num(m.pantawidknd) || 0) + (num(m.other_cct) || 0);
    return { earn: wage + other, cct: cct };
  }
  function fIncome(hh, members, rs, th) {
    th = th || {};
    var food = num(th.food), pov = num(th.poverty);
    var fsize, inc, extra = [], why;
    if (rs === 'stata') {
      var ofw = members.filter(function (m) { return is(m.ofw, 1); }).length;
      fsize = members.length - ofw;
      var tot = 0, cct = 0;
      members.forEach(function (m) { var p = incomeParts(m); tot += p.earn + p.cct; cct += p.cct; });
      inc = tot - cct;
      why = 'income of all members ₱' + Math.round(inc).toLocaleString() + ' (CCT excluded, no imputed rent) ÷ 12 ÷ family size ' + fsize + ' (all captured members minus ' + ofw + ' OFW)';
    } else {
      var act = members.filter(active), under = 0, rent = (num(hh.imprnt) || 0) * 12;
      fsize = act.length; inc = 0;
      act.forEach(function (m) { var p = incomeParts(m); if ((age(m) || 0) >= 15) inc += p.earn; else under += p.earn; });
      inc += rent;
      why = 'income of active members 15+ ₱' + Math.round(inc - rent).toLocaleString() + ' + imputed rent ₱' + rent.toLocaleString() + ' (×12)' +
        (under ? ' (₱' + under.toLocaleString() + ' of under-15 income excluded)' : '') + ', 4Ps/CCT excluded, ÷ 12 ÷ family size ' + fsize + ' (active members incl. OFW)';
    }
    var pci = fsize > 0 ? inc / 12 / fsize : 0;
    var lvl = null, br = 'C.no_thresholds';
    why += ' = PCI ₱' + f2(pci).toLocaleString();
    if (food !== null && pov !== null) {
      if (pci < food) { lvl = 1; br = 'C.L1.food_poor'; why += ' < food ₱' + food; }
      else if (pci < pov) { lvl = 2; br = 'C.L2.income_poor'; why += ' ≥ food ₱' + food + ' and < poverty ₱' + pov; }
      else { lvl = 3; br = 'C.L3.not_income_poor'; why += ' ≥ poverty ₱' + pov; }
      if (Math.abs(pci - food) < 1) extra.push('C.bnd.pci_at_food_threshold');
      if (Math.abs(pci - pov) < 1) extra.push(pci >= pov ? 'C.bnd.pci_at_poverty_threshold' : 'C.bnd.pci_just_below_poverty');
    } else why += ' — thresholds not set';
    if (members.some(function (m) { return incomeParts(m).cct > 0; })) extra.push('C.case.4ps_cct_excluded');
    if (members.some(function (m) { return (age(m) || 99) < 15 && incomeParts(m).earn > 0; })) extra.push('C.case.under15_income_excluded');
    if (members.some(function (m) { return is(m.ofw, 1); })) extra.push('C.case.ofw_in_family_size');
    if (members.some(function (m) { return !active(m); })) extra.push('C.case.moved_out_or_deceased_excluded');
    if ((num(hh.imprnt) || 0) > 0) extra.push('C.case.imputed_rent_included');
    return { level: lvl, br: br, extra: extra, why: why, detail: { fsize: fsize, annual_income: Math.round(inc), monthly_pci: f2(pci), food: food, poverty: pov } };
  }

  function fFinInst(members, rs) {
    var el = rs === 'stata' ? members : members.filter(function (m) { return (age(m) || 0) >= 15; });
    var ins = el.filter(function (m) { return is(m.insurance, 1); }).length;
    var acct = el.filter(function (m) { return is(m.finance_acct, 1); }).length;
    var sav = el.filter(function (m) { return is(m.savings, 1); }).length;
    var access = el.filter(function (m) { return is(m.insurance, 1) || is(m.finance_acct, 1); }).length;
    var lvl = null, br;
    if (rs === 'stata') {
      if (ins === 0 && acct === 0) { lvl = 1; br = 'E.L1.no_access'; }
      if ((ins === 1 || acct === 1) && sav === 0) { lvl = 2; br = 'E.L2.one_member_access'; }
      if (ins >= 2 || acct >= 2 || sav >= 1) { lvl = 3; br = sav >= 1 ? 'E.L3.savings' : 'E.L3.two_members_access'; }
    } else {
      if (access === 0 && sav === 0) { lvl = 1; br = 'E.L1.no_access'; }
      else if (sav >= 1) { lvl = 3; br = 'E.L3.savings'; }
      else if (access >= 2) { lvl = 3; br = 'E.L3.two_members_access'; }
      else { lvl = 2; br = 'E.L2.one_member_access'; }
    }
    var why = (rs === 'stata' ? 'all members: ' : 'members 15+: ') + ins + ' with insurance, ' + acct + ' with account, ' + access + ' with either, ' + sav + ' with savings' +
      (rs === 'stata' ? ' (Stata counts insurance and accounts separately)' : ' (combined access count)');
    var extra = [];
    if (ins === 1 && acct === 1 && access === 2 && sav === 0) extra.push('E.div.two_members_different_access');
    if (access === 1 && ins === 1 && acct === 1) extra.push('E.case.same_member_insurance_and_account');
    if (sav >= 1 && access === 0) extra.push('E.case.savings_only');
    return { level: lvl, br: br || 'E.unanswered', extra: extra, why: why, detail: { insurance: ins, account: acct, savings: sav, members_with_access: access } };
  }

  function fWater(hh, rs) {
    var w = num(hh.water), d = hh.water_dist, lvl = null, br = 'I.unanswered';
    var impAll = [11, 12, 13, 14, 21, 31, 41, 51, 61, 71], impT = [13, 14, 21, 31, 41, 51, 61, 71];
    if (inList(w, [32, 42, 81])) { lvl = 1; br = 'I.L1.unimproved_source'; }
    if (rs === 'stata') {
      if (inList(w, impAll) && stataGT(d, 30)) { lvl = 2; br = 'I.L2.improved_over_30min'; }
      if (inList(w, impAll) && stataLE(d, 30)) { lvl = 3; br = 'I.L3.improved_30min_or_less'; }
    } else {
      if (inList(w, impT) && num(d) !== null && num(d) > 30) { lvl = 2; br = 'I.L2.improved_over_30min'; }
      if (inList(w, impT) && num(d) !== null && num(d) <= 30) { lvl = 3; br = 'I.L3.improved_30min_or_less'; }
      if (inList(w, [11, 12])) { lvl = 3; br = 'I.L3.piped_into_dwelling_or_yard'; }
    }
    if (inList(w, [72, 91])) { lvl = 3; br = 'I.L3.refilling_or_bottled'; }
    var why = 'source ' + lb(LBL.water, w) + ', collection ' + (num(d) === null ? 'not recorded' : num(d) + ' min') + (rs === 'stata' && inList(w, impAll) && num(d) === null ? ' (Stata treats blank as > 30)' : '');
    var extra = ['I.code.' + w];
    if (num(d) === 30) extra.push('I.bnd.30min');
    if (num(d) === 31) extra.push('I.bnd.31min');
    if (inList(w, [11, 12]) && (num(d) === null || num(d) > 30)) extra.push('I.div.piped_dwelling_far_or_blank');
    return { level: lvl, br: br, extra: extra, why: why };
  }

  function fSanitation(hh, rs) {
    var t = num(hh.toil), sh = num(hh.toil_shared), lvl = null, br = 'J.unanswered';
    var imp = [11, 12, 13, 21, 22, 31], unimp = [14, 23, 41, 51, 15, 71];
    if (rs === 'stata') {
      if (t === 95) { lvl = 1; br = 'J.L1.open_defecation'; }
      if ((inList(t, unimp) && sh === 1) || sh === 2) { lvl = 2; br = inList(t, unimp) ? 'J.L2.unimproved' : 'J.L2.precedence_bug'; }
      if (inList(t, imp) && sh === 1) { lvl = 2; br = 'J.L2.improved_shared'; }
      if (inList(t, imp) && sh === 2) { lvl = 3; br = 'J.L3.improved_not_shared'; }
    } else {
      if (t === 95) { lvl = 1; br = 'J.L1.open_defecation'; }
      else if (inList(t, unimp)) { lvl = 2; br = 'J.L2.unimproved'; }
      else if (inList(t, imp) && sh === 1) { lvl = 2; br = 'J.L2.improved_shared'; }
      else if (inList(t, imp) && sh === 2) { lvl = 3; br = 'J.L3.improved_not_shared'; }
    }
    var why = lb(LBL.toil, t) + (inList(t, imp) ? ' [improved]' : inList(t, unimp) ? ' [unimproved]' : '') + ', shared with other families: ' + yn(sh);
    var extra = ['J.code.' + t];
    if (t === 95 && sh === 2) extra.push('J.div.open_defecation_toil_shared_no');
    if (inList(t, imp) && sh === 1) extra.push('J.chk.improved_shared_criteria_code4');
    return { level: lvl, br: br, extra: extra, why: why };
  }

  function fCoded(v, map, prefix, label) {
    var n = num(v), lvl = null;
    Object.keys(map).forEach(function (L) { if (map[L].indexOf(n) >= 0) lvl = Number(L); });
    return { level: lvl, br: lvl ? prefix + '.L' + lvl : prefix + '.unanswered', extra: [prefix + '.code.' + n], why: label + ' code ' + (n === null ? '—' : n) + (lvl ? ' is in the Level ' + lvl + ' list' : ' — not in any level list') };
  }

  function fMaterial(v, loc, rs, make, light, strong, P, what) {
    var x = num(v), hz = num(loc) === 1, lvl = null, br = P + '.unanswered';
    if (rs === 'stata') {
      if (x === make) { lvl = 1; br = P + '.L1.makeshift'; }
      if (inList(x, light) && hz) { lvl = 1; br = P + '.L1.light_hazard'; }
      if (inList(x, light)) { lvl = 2; br = hz ? P + '.L1.light_hazard' : P + '.L2.light'; }
      if (inList(x, strong) && hz) { lvl = 2; br = P + '.L2.strong_hazard'; }
      if (inList(x, strong)) { lvl = 3; br = hz ? P + '.L2.strong_hazard' : P + '.L3.strong'; }
    } else {
      if (x === make) { lvl = 1; br = P + '.L1.makeshift'; }
      else if (inList(x, light)) { lvl = hz ? 1 : 2; br = hz ? P + '.L1.light_hazard' : P + '.L2.light'; }
      else if (inList(x, strong)) { lvl = hz ? 2 : 3; br = hz ? P + '.L2.strong_hazard' : P + '.L3.strong'; }
    }
    var kind = x === make ? 'makeshift' : inList(x, light) ? 'light' : inList(x, strong) ? 'strong' : 'unknown';
    var why = what + ' code ' + (x === null ? '—' : x) + ' = ' + kind + ' material; hazard-prone: ' + yn(loc) + (rs === 'stata' && hz && kind !== 'makeshift' ? ' (Stata overwrite ignores hazard-prone)' : '');
    return { level: lvl, br: br, extra: [P + '.code.' + x], why: why };
  }

  function fAssets(hh) {
    var total = 0, types = 0, parts = [];
    ASSET_VARS.forEach(function (v) { var n = num(hh[v]) || 0; total += n; if (n > 0) { types++; parts.push(v + '×' + n); } });
    var land = arr(hh.land);
    LAND_VARS.forEach(function (v, i) { if (yes(hh[v]) || land.indexOf(i + 1) >= 0) { total += 1; types++; parts.push(v); } });
    if (num(hh.assets_total) !== null && !parts.length) { total = num(hh.assets_total); types = total; parts.push('total entered ' + total); }
    var lv = function (t) { return t <= 3 ? 1 : t <= 5 ? 2 : 3; };
    var lvl = lv(total), extra = [];
    if ([3, 4, 5, 6].indexOf(total) >= 0) extra.push('S.bnd.total_' + total);
    if (total === 0) extra.push('S.bnd.total_0');
    if (land.length || LAND_VARS.some(function (v) { return yes(hh[v]); })) extra.push('S.case.land_or_fishpond_counted');
    if (lv(types) !== lvl) extra.push('S.chk.quantity_vs_item_types');
    return { level: lvl, br: 'S.L' + lvl, extra: extra, why: 'total quantity ' + total + (parts.length ? ' (' + parts.join(', ') + ')' : '') + (lv(types) !== lvl ? '; counting item types instead gives ' + types + ' → L' + lv(types) : ''),
      detail: { total_quantity: total, distinct_types: types, level_if_types: lv(types) } };
  }

  function fParenting(hh) {
    var s = 0;
    PARENT_VARS.forEach(function (v) { if (yes(hh[v])) s++; });
    if (num(hh.parenting_n) !== null) s = num(hh.parenting_n);
    var lvl = s <= 1 ? 1 : s <= 4 ? 2 : 3;
    return { level: lvl, br: 'T.L' + lvl, extra: ['T.sum.' + s], why: s + ' of 9 practices ticked', detail: { practices: s } };
  }

  function fDiscern(hh, rs) {
    var ps = PROBLEMS.map(function (p) { return { p: p, exp: yes(hh[p]), sol: num(hh[p + '_sol']), res: num(hh[p + '_res']) }; });
    var ex_ = ps.filter(function (x) { return x.exp; }), lvl = null, br;
    if (rs === 'stata') {
      if (ex_.some(function (x) { return x.sol === 2; })) { lvl = 1; br = 'U.L1.no_solution'; }
      if (ex_.some(function (x) { return x.sol === 1 && x.res === 2; })) { lvl = 2; br = 'U.L2.solution_not_resolved'; }
      if (!ex_.length) { lvl = 3; br = 'U.L3.no_problem'; }
      if (ex_.some(function (x) { return x.sol === 1 && x.res === 1; })) { lvl = 3; br = 'U.L3.resolved'; }
    } else {
      if (!ex_.length) { lvl = 3; br = 'U.L3.no_problem'; }
      else if (ex_.some(function (x) { return x.sol === 2; })) { lvl = 1; br = 'U.L1.no_solution'; }
      else if (ex_.some(function (x) { return x.res === 2; })) { lvl = 2; br = 'U.L2.solution_not_resolved'; }
      else { lvl = 3; br = 'U.L3.resolved'; }
    }
    var why = ex_.length ? ex_.map(function (x) { return x.p.replace('prob', '') + ': solution ' + yn(x.sol) + ', resolved ' + yn(x.res); }).join('; ') + (ex_.length > 1 ? (rs === 'stata' ? ' (Stata: any resolved problem overwrites to 3)' : ' (worst case applies)') : '') : 'no problem experienced';
    var extra = ex_.map(function (x) { return 'U.type.' + x.p; });
    if (ex_.length > 1) extra.push('U.case.multiple_problems');
    var lv = ex_.map(function (x) { return x.sol === 2 ? 1 : x.res === 2 ? 2 : 3; });
    if (lv.length > 1 && Math.min.apply(null, lv) !== Math.max.apply(null, lv)) extra.push('U.div.worst_case_mixed_problems');
    return { level: lvl, br: br || 'U.unanswered', extra: extra, why: why };
  }

  function fParticipation(members, rs) {
    var el = members.filter(function (m) { return (age(m) || 0) >= 15; });
    var mem = el.filter(function (m) { return is(m.orgmem, 1) || is(m.orgact1, 1); }).length;
    var act = el.filter(function (m) { return is(m.orgact1, 1); }).length;
    var off = el.filter(function (m) { return is(m.orgofficer1, 1); }).length;
    var lvl = null, br;
    if (mem === 0) { lvl = 1; br = 'V.L1.no_member'; }
    if (rs === 'stata' ? mem >= 1 : mem === 1) { lvl = 2; br = act === 1 ? 'V.L2.one_member_participated' : 'V.L2.member_only'; }
    if (act > 1 || off >= 1) { lvl = 3; br = off >= 1 ? 'V.L3.officer' : 'V.L3.two_plus_participated'; }
    var why = 'members 15+: ' + mem + ' in an organization, ' + act + ' participated in activities, ' + off + ' officer(s)';
    if (lvl === null) why += ' — the DSWD "exactly one member" rule leaves 2+ inactive members without a level';
    var extra = [];
    if (mem >= 2 && act <= 1 && off === 0) extra.push('V.div.two_plus_members_not_active');
    return { level: lvl, br: br || 'V.undefined_by_target_rule', extra: extra, why: why, detail: { members: mem, participated: act, officers: off } };
  }

  function fChildRights(members, rs) {
    var kids = members.filter(function (m) { return inAge(m, 0, 17); });
    if (!kids.length) return { level: null, br: 'W.na.no_children_0_17', extra: [], na: true, why: 'no member aged 0-17 — not applicable' };
    var extra = [], per = kids.map(function (m) {
      var a = age(m), app = 0, met = 0, flags = [], parts = [];
      app++; if (is(m.birthreg, 1)) { met++; parts.push('birth registered ✓'); } else { flags.push('W.case.birth_not_registered'); parts.push('birth registered ✗'); }
      var vax = arr(m.vaccine);
      if (rs === 'stata' ? a <= 17 : a <= 5) {
        app++;
        var ok = rs === 'stata' ? vax.length > 0 : MANDATORY_VAX.every(function (v) { return vax.indexOf(v) >= 0; });
        if (ok) met++; else flags.push('W.case.incomplete_immunization');
        parts.push((rs === 'stata' ? 'any vaccine ' : 'all 8 vaccines ') + (ok ? '✓' : '✗'));
        if (vax.length > 0 && vax.length < MANDATORY_VAX.length) flags.push('W.div.partial_vaccines');
      }
      if (a >= 3) {
        app++;
        var sch = is(m.educind, 1) && (rs === 'stata' || is(m.schattendance, 3));
        if (sch) met++; else flags.push('W.case.not_enrolled_or_low_attendance');
        parts.push((rs === 'stata' ? 'enrolled ' : 'enrolled & ≥85% ') + (sch ? '✓' : '✗'));
        if (is(m.educind, 1) && !is(m.schattendance, 3)) flags.push('W.div.enrolled_attendance_below_85');
      }
      if (a >= 5) {
        app++;
        var cl = num(m.childlabor), labor = (cl !== null && cl >= 1) || is(m.childlabor_yes, 1);
        if (!labor) met++; else flags.push('W.case.child_labor');
        parts.push('no child labour ' + (labor ? '✗' : '✓'));
      }
      flags.forEach(function (f) { extra.push(f); });
      var lvl = rs === 'stata' ? (met === 4 ? 3 : met >= 2 ? 2 : met === 1 ? 1 : null) : null;
      return { no: m.no, name: m.name || m.fname || '', age: a, applicable: app, met: met, all: met === app, level: lvl, parts: parts };
    });
    var lvl, br;
    if (rs === 'stata') {
      var ls = per.map(function (p) { return p.level; }).filter(function (x) { return x !== null; });
      lvl = ls.length ? Math.max.apply(null, ls) : null;
      br = lvl === 3 ? 'W.L3.child_all_four' : lvl === 2 ? 'W.L2.child_two_to_three' : lvl === 1 ? 'W.L1.child_one' : 'W.unscored';
    } else {
      if (per.every(function (p) { return p.all; })) { lvl = 3; br = 'W.L3.every_child_meets_all_applicable'; }
      else if (per.some(function (p) { return p.met >= 2; })) { lvl = 2; br = 'W.L2.a_child_meets_two_or_more'; }
      else { lvl = 1; br = 'W.L1.no_child_meets_two'; }
    }
    if (kids.length > 1 && per.some(function (p) { return p.all; }) && per.some(function (p) { return !p.all; })) extra.push('W.case.multiple_children_one_fails');
    var why = per.map(function (p) { return 'M' + p.no + (p.name ? ' ' + p.name : '') + ' (' + p.age + '): ' + p.met + '/' + p.applicable + ' — ' + p.parts.join(', '); }).join(' | ') +
      (rs === 'stata' ? ' (Stata needs all 4, family = best child assumed)' : '');
    return { level: lvl, br: br, extra: uniq(extra), why: why, detail: { children: per.map(function (p) { return 'm' + p.no + ':' + p.met + '/' + p.applicable; }).join(' ') } };
  }

  function fGBV(hh) {
    var t = arr(hh.gvbind), a = num(hh.gvb_action), lvl = null, br = 'X.unanswered';
    if (!t.length) { lvl = 3; br = 'X.L3.no_gbv'; }
    else if (a === 3) { lvl = 1; br = 'X.L1.no_action'; }
    else if (a === 2) { lvl = 2; br = 'X.L2.support_authorities'; }
    else if (a === 1) { lvl = 3; br = 'X.L3.formal_authorities'; }
    return { level: lvl, br: br, extra: t.map(function (x) { return 'X.type.' + x; }), why: t.length ? 'GBV types ' + t.join(', ') + '; action: ' + lb(LBL.gvb, a) : 'no member experienced GBV' };
  }

  function fDRRM(hh, rs) {
    var kit = arr(hh.disastkit);
    var kitAny = kit.length > 0, kitAll = KIT_ALL.every(function (x) { return kit.indexOf(x) >= 0; }) || is(hh.disastkit_all, 1);
    var know = ['disasknow_hotline', 'disasknow_evac', 'disasknow_hosp', 'disasknow_other'].some(function (v) { return is(hh[v], 1); });
    var plan = is(hh.disasplan, 1), sav = is(hh.emersavings, 1);
    var loc = num(hh.location), gida = num(hh.gida);
    function expOf(list) {
      var aff = list.filter(function (d) { return yes(hh[d]); });
      if (!aff.length) return 3;
      var rs_ = aff.map(function (d) { return num(hh[d + '_r']); });
      if (rs_.indexOf(3) >= 0) return 1;
      if (rs_.indexOf(2) >= 0) return 2;
      return 3;
    }
    var lvl = null, br, count, counter, exp;
    if (rs === 'stata') {
      count = (kitAny ? 1 : 0) + (know ? 1 : 0) + (plan ? 1 : 0);
      counter = count >= 3 ? 3 : count >= 1 ? 2 : 1;
      exp = expOf(STATA_DISASTERS);
      if (loc === 1 || gida === 1 || counter === 1 || exp === 1) { lvl = 1; br = loc === 1 ? 'Y.L1.hazard_prone' : gida === 1 ? 'Y.L1.gida' : counter === 1 ? 'Y.L1.no_items' : 'Y.L1.affected_not_recovered'; }
      if (loc === 2 && gida === 2 && counter === 2) { lvl = 2; br = 'Y.L2.one_to_two_items'; }
      if (loc === 2 && gida === 2 && counter === 3 && exp === 2) { lvl = 2; br = 'Y.L2.three_plus_partially_recovered'; }
      if (loc === 2 && gida === 2 && counter === 3 && exp === 3 && sav) { lvl = 3; br = 'Y.L3.three_plus_ok'; }
      if (lvl === null) br = 'Y.stata_missing';
    } else {
      count = (kitAll ? 1 : 0) + (know ? 1 : 0) + (plan ? 1 : 0) + (sav ? 1 : 0);
      counter = count >= 3 ? 3 : count >= 1 ? 2 : 1;
      exp = expOf(DISASTERS);
      if (loc === 1) { lvl = 1; br = 'Y.L1.hazard_prone'; }
      else if (gida === 1) { lvl = 1; br = 'Y.L1.gida'; }
      else if (counter === 1) { lvl = 1; br = 'Y.L1.no_items'; }
      else if (counter === 2) { lvl = 2; br = 'Y.L2.one_to_two_items'; }
      else if (exp === 1) { lvl = 1; br = 'Y.L1.affected_not_recovered'; }
      else if (exp === 2) { lvl = 2; br = 'Y.L2.three_plus_partially_recovered'; }
      else { lvl = 3; br = 'Y.L3.three_plus_ok'; }
    }
    var why = 'hazard-prone ' + yn(loc) + ', GIDA ' + yn(gida) + '; items: kit ' + (rs === 'stata' ? (kitAny ? '✓ (any item)' : '✗') : (kitAll ? '✓ (all items)' : kitAny ? '✗ (incomplete kit, ' + kit.length + ' items)' : '✗')) +
      ', knowledge ' + (know ? '✓' : '✗') + ', plan ' + (plan ? '✓' : '✗') + ', savings ' + (sav ? '✓' : '✗') + (rs === 'stata' ? ' (Stata counts 3 items, no savings)' : '') +
      ' = ' + count + ' item(s); disasters: ' + (exp === 3 ? 'none affected / fully recovered' : exp === 2 ? 'partially recovered' : 'not recovered') + (rs === 'stata' && lvl === null ? ' — Stata assigns no level' : '');
    var extra = [];
    if (kitAny && !kitAll) extra.push('Y.div.kit_incomplete');
    if (kitAll && know && plan && !sav) extra.push('Y.div.no_savings_other_three');
    if (yes(hh.volerupt)) extra.push('Y.div.volcanic_eruption_not_in_stata');
    if (expOf(DISASTERS) === 1 && counter === 2) extra.push('Y.chk.not_recovered_with_one_to_two_items');
    DISASTERS.forEach(function (d) { if (yes(hh[d])) extra.push('Y.disaster.' + d + '.r' + num(hh[d + '_r'])); });
    return { level: lvl, br: br, extra: extra, why: why, detail: { items: count, counter: counter, disaster_status: exp } };
  }

  function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

  // ---------- main ----------
  function score(household, opts) {
    opts = opts || {};
    var rs = opts.ruleset === 'stata' ? 'stata' : 'target';
    var hh = household.hh || {};
    var all = (household.members || []).slice();
    var mem = all.filter(active);   // answers are only captured for active members
    var out = { ruleset: rs, indicators: {}, branches: [] };

    function memberInd(code, fn, how) {
      var rows = mem.map(function (m) { var r = fn(m, rs); return { no: m.no, name: m.name || m.fname || '', age: age(m), level: r.level, br: r.br, extra: r.extra || [], why: r.why || '' }; });
      var lvl = aggregate(rows, how);
      var scored = rows.filter(function (r) { return r.level !== null; });
      var brs = [];
      rows.forEach(function (r) { brs.push(r.br); r.extra.forEach(function (e) { brs.push(e); }); });
      if (lvl !== null && how === 'AVG' && Math.abs(lvl - Math.round(lvl)) > 1e-9) brs.push(code + '.f.average_not_whole_number');
      if (scored.length > 1) {
        var ls = scored.map(function (r) { return r.level; });
        if (Math.min.apply(null, ls) !== Math.max.apply(null, ls)) brs.push(code + '.f.mixed_member_levels');
      }
      var detail = how + '(' + scored.map(function (r) { return 'm' + r.no + '=' + r.level; }).join(', ') + ')';
      var why = !scored.length ? 'no eligible/scored member — not applicable'
        : how === 'AVG' ? 'average of ' + scored.length + ' scored member(s): (' + scored.map(function (r) { return r.level; }).join(' + ') + ') ÷ ' + scored.length + ' = ' + f2(lvl)
          : how === 'MAX' ? 'highest member level (any member qualifies the family) = ' + lvl : 'lowest member level (worst member decides) = ' + lvl;
      return { level: lvl, members: rows, branches: uniq(brs), detail: detail, why: why, na: lvl === null };
    }
    function famInd(r) {
      var brs = [r.br].concat(r.extra || []);
      var d = r.detail ? Object.keys(r.detail).map(function (k) { return k + '=' + r.detail[k]; }).join('; ') : '';
      return { level: r.level, branches: uniq(brs), detail: d, why: r.why || '', na: r.level === null };
    }
    function aggregate(rows, how) {
      var lv = rows.filter(function (r) { return r.level !== null; }).map(function (r) { return r.level; });
      if (!lv.length) return null;
      if (how === 'AVG') return mean(lv);
      if (how === 'MAX') return Math.max.apply(null, lv);
      return Math.min.apply(null, lv);
    }

    var I = out.indicators;
    I.A = memberInd('A', mSkills, 'AVG');
    I.B = memberInd('B', mEmployment, 'AVG');
    I.C = famInd(fIncome(hh, rs === 'stata' ? all : mem, rs, opts.thresholds));   // Stata family size = all captured members - OFW
    I.D = memberInd('D', mSocsec, 'MAX');
    I.E = famInd(fFinInst(mem, rs));
    I.F = memberInd('F', mHealthSvc, 'AVG');
    I.G = memberInd('G', mHealthCond, 'MIN');
    I.H = memberInd('H', mNutrition, 'AVG');
    I.I = famInd(fWater(hh, rs));
    I.J = famInd(fSanitation(hh, rs));
    I.K = famInd(fCoded(hh.garbage, { 1: [1, 2, 3, 4], 2: [5, 6, 7], 3: [8, 9, 10] }, 'K', 'garbage disposal'));
    I.L = memberInd('L', mLiteracy, 'AVG');
    I.M = memberInd('M', mDigital, 'AVG');
    I.N = memberInd('N', mSchool, 'AVG');
    I.O = famInd(fMaterial(hh.roof, hh.location, rs, 7, [4, 5], [1, 2, 3, 6], 'O', 'roof'));
    I.P = famInd(fMaterial(hh.wall, hh.location, rs, 8, [5, 6], [1, 2, 3, 4, 7, 9], 'P', 'wall'));
    I.Q = famInd(fCoded(hh.tenur, { 1: [1, 2], 2: [3, 6, 8], 3: [4, 5, 7] }, 'Q', 'tenure'));
    I.R = famInd(fCoded(hh.light, { 1: [5, 6, 9], 2: [2, 4, 7], 3: [1, 3, 8] }, 'R', 'lighting'));
    I.S = famInd(fAssets(hh));
    I.T = famInd(fParenting(hh));
    I.U = famInd(fDiscern(hh, rs));
    I.V = famInd(fParticipation(mem, rs));
    I.W = famInd(fChildRights(mem, rs));
    I.X = famInd(fGBV(hh));
    I.Y = famInd(fDRRM(hh, rs));

    var es = 0, sa = 0, esNull = false, saNull = false, na = [];
    INDICATORS.forEach(function (d) {
      var r = I[d.code];
      r.weight = d.w;
      r.weighted = r.level === null ? null : r4(r.level * d.w);
      if (r.level === null) { na.push(d.code); if (d.dim === 'ES') esNull = true; else saNull = true; }
      else if (d.dim === 'ES') es += r.level * d.w; else sa += r.level * d.w;
      r.branches = r.branches.filter(function (b) { return !/\.unanswered$/.test(b); });
      r.branches.forEach(function (b) { out.branches.push(b); });
    });
    if (rs === 'stata') {           // gen x = a*w + ... -> missing if any term missing; egen rowtotal treats missing as 0
      out.es_raw = esNull ? null : r4(es);
      out.sa_raw = saNull ? null : r4(sa);
      out.total = r4((out.es_raw || 0) + (out.sa_raw || 0));
    } else {
      out.es_raw = r4(es); out.sa_raw = r4(sa); out.total = r4(es + sa);
    }
    out.es_rescaled = out.es_raw === null ? null : r4(out.es_raw / ES_W);
    out.sa_rescaled = out.sa_raw === null ? null : r4(out.sa_raw / SA_W);
    out.lowb = out.total >= CUT3 ? 3 : out.total >= CUT2 ? 2 : 1;
    out.na = na;
    out.branches = uniq(out.branches);
    if (Math.abs(out.total - CUT3) < 0.02 || Math.abs(out.total - CUT2) < 0.02) out.branches.push('Z.bnd.total_near_lowb_cutoff');
    out.branches.push('Z.lowb.L' + out.lowb);
    if (na.length) out.branches.push('Z.case.indicator_not_applicable');
    return out;
  }

  function scoreBoth(household, opts) {
    opts = opts || {};
    var t = score(household, { ruleset: 'target', thresholds: opts.thresholds });
    var s = score(household, { ruleset: 'stata', thresholds: opts.thresholds });
    var div = [];
    INDICATORS.forEach(function (d) {
      var a = t.indicators[d.code].level, b = s.indicators[d.code].level;
      if (!(a === b || (a !== null && b !== null && Math.abs(a - b) < 1e-9))) div.push(d.code);
    });
    return { target: t, stata: s, divergent: div };
  }

  // Resolve income tokens like "@PCI:poverty:-1:4:down" -> annual amount to enter.
  function resolveToken(v, th) {
    if (typeof v !== 'string' || v.indexOf('@PCI:') !== 0) return v;
    var p = v.split(':'), base = p[1], delta = Number(p[2]) || 0, fs = Number(p[3]) || 1, rnd = p[4] || 'up';
    var food = num(th && th.food), pov = num(th && th.poverty);
    if (food === null || pov === null) return null;
    var b = base === 'food' ? food : base === 'poverty' ? pov : (food + pov) / 2;
    var x = (b + delta) * 12 * fs;
    return rnd === 'down' ? Math.floor(x) : Math.ceil(x);
  }

  function interpretObserved(code, value, mode) {
    var n = num(value); if (n === null) return null;
    var d = INDICATORS.filter(function (x) { return x.code === code; })[0];
    if (mode === 'weighted' && d) return n / d.w;
    return n;
  }

  var api = {
    INDICATORS: INDICATORS, ES_W: ES_W, SA_W: SA_W, CUT3: CUT3, CUT2: CUT2, LBL: LBL,
    score: score, scoreBoth: scoreBoth, resolveToken: resolveToken, interpretObserved: interpretObserved,
    isSHS: isSHS, arr: arr, num: num, ASSET_VARS: ASSET_VARS, LAND_VARS: LAND_VARS, PARENT_VARS: PARENT_VARS, PROBLEMS: PROBLEMS, DISASTERS: DISASTERS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SWDI = api;
})(this);
