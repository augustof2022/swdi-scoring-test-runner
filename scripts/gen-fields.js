/* Generates engine/swdi-fields.js (form definitions + choice lists) from the BRVD-derived varmeta.json.
 * Usage: node scripts/gen-fields.js path/to/varmeta.json */
'use strict';
const fs = require('fs'), path = require('path');
const VM = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const CH = VM.choices, META = VM.meta;
const pick = (name, keep) => { const o = {}; Object.keys(CH[name] || {}).forEach(k => { if (!keep || keep.includes(Number(k))) o[k] = CH[name][k].replace(/\s+/g, ' ').trim(); }); return o; };
const lists = {
  yn: { 1: 'Yes', 2: 'No' }, sex: pick('sex'), reln: pick('reln'), memberstatus: { 1: 'Active', 2: 'Deceased', 3: 'Moved Out' },
  water: pick('water', [11, 12, 13, 14, 21, 31, 41, 51, 61, 71, 72, 91, 32, 42, 81]), toil: pick('toil', [11, 12, 13, 21, 22, 31, 14, 23, 41, 51, 15, 71, 95]),
  garbage: pick('garbage'), roof: pick('roof', [1, 2, 3, 4, 5, 6, 7]), wall: pick('wall', [1, 2, 3, 4, 5, 6, 7, 8, 9]), tenur: pick('tenur'), light: pick('light', [1, 2, 3, 4, 5, 6, 7, 8, 9]),
  jstatus: pick('jstatus'), ynotavail_med: pick('ynotavail_med'), maln: pick('maln'), schattendance: pick('schattendance'), gvb_res: pick('gvb_res'), recovered: pick('recovered'),
  gvbind: CH.gvbind, disastkit: pick('disastkit', Array.from({ length: 19 }, (_, i) => i + 1)), vaccine: pick('vaccine', [1, 2, 3, 4, 5, 6, 7, 8]), land: CH.land,
  digiact: { 1: 'Information and data literacy', 2: 'Communication and collaboration', 3: 'Digital content creation', 4: 'Safety', 5: 'Problem solving' },
  gradel: pick('gradel')
};
const q = v => (META[v] && META[v].q || v).replace(/member\(#\)/g, 'member').replace(/â€™/g, "'");
const ASSETS = ['ref', 'aircon', 'wash', 'stove', 'radio', 'tv', 'stereo', 'landline', 'oldcp', 'smartcp', 'tablet', 'car', 'van', 'jeep', 'truck', 'motor', 'ebike', 'tric', 'bic', 'pedicab', 'motorboat', 'nonmotorboat'];
const PARENT = ['children_interaction', 'children_idea', 'children_communicate', 'children_behavior', 'children_role', 'children_feedback', 'children_problem', 'children_rules', 'children_action'];
const DIS = [['typhoon', 'Typhoon'], ['drought', 'Drought'], ['flood', 'Flood'], ['earthquake', 'Earthquake'], ['landslide', 'Erosion/Landslide'], ['pest', 'Pests'], ['pollution', 'Pollution caused by mining'], ['fire', 'Fire'], ['volerupt', 'Volcanic eruption'], ['disastothers', 'Others']];
const F = [];
const hh = (sec, v, t, extra) => F.push(Object.assign({ v, s: 'hh', sec, q: q(v), t }, extra || {}));
const mm = (sec, v, t, extra) => F.push(Object.assign({ v, s: 'm', sec, q: q(v), t }, extra || {}));
// household
hh('Housing characteristics', 'roof', 'sel', { list: 'roof' });
hh('Housing characteristics', 'wall', 'sel', { list: 'wall' });
hh('Housing', 'tenur', 'sel', { list: 'tenur' });
hh('Housing', 'imprnt', 'num', { q: 'Imputed rent per month for the house and/or lot (₱)' });
hh('Housing', 'light', 'sel', { list: 'light' });
hh('Water, sanitation and garbage', 'water', 'sel', { list: 'water' });
hh('Water, sanitation and garbage', 'water_dist', 'num', { q: 'Minutes to go, get water and come back', when: 'improved_far' });
hh('Water, sanitation and garbage', 'toil', 'sel', { list: 'toil' });
hh('Water, sanitation and garbage', 'toil_shared', 'yn', { when: 'has_toilet' });
hh('Water, sanitation and garbage', 'garbage', 'sel', { list: 'garbage' });
ASSETS.forEach(v => hh('Assets (quantity owned, good working condition)', v, 'num', { short: true }));
[['land_agri', 'Agricultural land'], ['land_res', 'Residential land'], ['land_com', 'Commercial/industrial land'], ['fishpond', 'Fishpond'], ['fishpen', 'Fish pen']].forEach(([v, l]) => hh('Assets (quantity owned, good working condition)', v, 'chk', { q: l, short: true }));
PARENT.forEach(v => hh('Parenting engagement and support (activities in the past 12 months)', v, 'chk'));
[['probfin', 'Financial problem'], ['probhealth', 'Health problem'], ['probconflict', 'Conflict within the family'], ['probothers', 'Other problem']].forEach(([v, l]) => {
  hh('Problems faced in the past 12 months', v, 'chk', { q: l });
  hh('Problems faced in the past 12 months', v + '_sol', 'yn', { q: '↳ ' + l + ': solution identified?', when: v });
  hh('Problems faced in the past 12 months', v + '_res', 'yn', { q: '↳ ' + l + ': resolved?', when: v + '_sol' });
});
hh('Protection from gender-based violence', 'gvbind', 'multi', { list: 'gvbind', q: 'Member experienced any of the following (leave empty if none)' });
hh('Protection from gender-based violence', 'gvb_action', 'sel', { list: 'gvb_res', when: 'gvbind' });
hh('Practice of DRRM', 'disastkit', 'multi', { list: 'disastkit', q: 'Disaster preparedness kit items the family has' });
['disasknow_hotline', 'disasknow_evac', 'disasknow_hosp', 'disasknow_other'].forEach(v => hh('Practice of DRRM', v, 'yn', { q: 'Knows: ' + q(v) }));
hh('Practice of DRRM', 'disasplan', 'yn', { q: 'Does the family have an emergency plan?' });
hh('Practice of DRRM', 'emersavings', 'yn');
hh('Practice of DRRM', 'location', 'yn');
hh('Practice of DRRM', 'gida', 'yn');
DIS.forEach(([v, l]) => { hh('Disasters in the past 12 months', v, 'chk', { q: 'Affected by ' + l }); hh('Disasters in the past 12 months', v + '_r', 'sel', { list: 'recovered', q: '↳ ' + l + ': recovered?', when: v }); });
// member
mm('Demography', 'status', 'sel', { list: 'memberstatus', q: 'Member status' });
mm('Demography', 'birthreg', 'yn');
mm('Education and literacy', 'educind', 'yn', { age: [3, 99] });
mm('Education and literacy', 'gradel', 'sel', { list: 'gradel', when: 'educind_yes' });
mm('Education and literacy', 'schattendance', 'sel', { list: 'schattendance', when: 'educind_yes', age: [3, 18] });
mm('Education and literacy', 'educal', 'sel', { list: 'gradel', when: 'educind_no', q: 'Highest educational attainment completed' });
mm('Education and literacy', 'literacy_read', 'yn', { age: [5, 64], q: 'Can read' });
mm('Education and literacy', 'literacy_write', 'yn', { age: [5, 64], q: 'Can write' });
mm('Education and literacy', 'literacy_count', 'yn', { age: [5, 64], q: 'Can count' });
mm('Education and literacy', 'literacy_understand', 'yn', { age: [10, 64], q: 'Can understand simple messages/instructions' });
mm('Education and literacy', 'internet', 'yn', { age: [10, 64] });
mm('Education and literacy', 'digiact', 'multi', { list: 'digiact', age: [10, 64], when: 'internet', q: 'Digital activity groups performed (past 3 months)' });
mm('Membership in organizations', 'orgmem', 'yn', { age: [15, 99] });
mm('Membership in organizations', 'orgofficer1', 'yn', { age: [15, 99], when: 'orgmem', q: 'Officer and/or volunteer?' });
mm('Membership in organizations', 'orgact1', 'yn', { age: [15, 99], when: 'orgmem', q: 'Participated in activities/programs?' });
mm('Employable skills', 'skills_n', 'num', { age: [15, 99], q: 'Number of skills selected' });
[1, 2, 3].forEach(i => mm('Employable skills', 'regskill' + i, 'yn', { age: [15, 99], when: 'skill' + i, q: 'Skill ' + i + ' duly recognized?' }));
mm('Employment', 'ofw', 'yn', { age: [15, 99] });
mm('Employment', 'workind', 'yn', { age: [15, 99] });
mm('Employment', 'jobind', 'yn', { age: [15, 99], when: 'workind_no', q: 'Has a job/business though did not work past week?' });
mm('Employment', 'jstatus', 'sel', { list: 'jstatus', age: [15, 99], when: 'working' });
mm('Employment', 'avail', 'yn', { age: [15, 99], when: 'not_working', q: 'Available for work?' });
mm('Employment', 'willing', 'yn', { age: [15, 99], when: 'not_working', q: 'Willing to take up work?' });
mm('Employment', 'childlabor_yes', 'yn', { age: [5, 17], q: 'Engaged in any listed child-labour work/activity?' });
mm('Income (past 12 months, ₱)', 'wagcshm', 'num', { q: 'Salaries & wages + commissions + other compensation (A–C)' });
mm('Income (past 12 months, ₱)', 'entrep_income', 'num', { q: 'Net income from entrepreneurial activities' });
mm('Income (past 12 months, ₱)', 'other_income', 'num', { q: 'Other income EXCLUDING 4Ps and other CCT (remittances, pension, rentals, interest…)' });
mm('Income (past 12 months, ₱)', 'pantawidcsh', 'num', { q: '4Ps (Pantawid) cash received' });
mm('Income (past 12 months, ₱)', 'other_cct', 'num', { q: 'Other conditional cash transfers received' });
mm('Social security', 'sssind', 'yn', { age: [15, 99] });
mm('Social security', 'sss_months', 'num', { age: [15, 99], when: 'sssind', q: 'Months as active SSS member' });
mm('Social security', 'gsisind', 'yn', { age: [15, 99] });
mm('Social security', 'gsis_months', 'num', { age: [15, 99], when: 'gsisind', q: 'Months as active GSIS member' });
mm('Social security', 'insurance', 'yn', { age: [15, 99] });
mm('Social security', 'finance_acct', 'yn', { age: [15, 99] });
mm('Social security', 'savings', 'yn', { age: [15, 99] });
['stuntingind', 'wastingind', 'underweightind', 'overweightind'].forEach(v => mm('Nutrition (0-18)', v, 'sel', { list: 'maln', age: [0, 18] }));
mm('Nutrition (0-18)', 'vaccine', 'multi', { list: 'vaccine', age: [0, 5], q: 'Vaccinations received' });
mm('Health condition (past 6 months)', 'sickind', 'yn');
mm('Health condition (past 6 months)', 'confine', 'yn');
mm('Availment of health services (past 6 months)', 'avail_med', 'yn');
mm('Availment of health services (past 6 months)', 'ynotavail_med', 'sel', { list: 'ynotavail_med', when: 'avail_no' });
const out = '/* Generated by scripts/gen-fields.js from BRVD Annex A v0.4 (Field Inventory + Choices Lists). Do not edit by hand. */\n' +
  '(function (root) {\n  var api = ' + JSON.stringify({ FIELDS: F, LISTS: lists }) + ';\n' +
  '  if (typeof module !== \'undefined\' && module.exports) module.exports = api; else root.SWDIFields = api;\n})(this);\n';
fs.writeFileSync(path.join(__dirname, '../engine/swdi-fields.js'), out);
console.log('fields', F.length, 'lists', Object.keys(lists).length);
