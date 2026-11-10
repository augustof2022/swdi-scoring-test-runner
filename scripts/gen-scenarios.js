/* Generates engine/swdi-scenarios.js: description, kind and eligibility of every scenario ID in sheet/scenario_ids.json. */
'use strict';
const fs = require('fs'), path = require('path');
const { LISTS } = require('../engine/swdi-fields.js');
const IDS = require('../sheet/scenario_ids.json');
const D = {
  'B.L2.short_term_seasonal_casual_not_past_week': 'Has a short-term/seasonal/casual job but did not work past week → L2', 'D.excl.under15': 'Under 15 excluded',
  'J.L2.precedence_bug': 'Open defecation with "shared? = No": Stata operator precedence assigns L2', 'V.undefined_by_target_rule': '2+ members in organizations, none active: DSWD "exactly one" rule gives no level',
  'W.case.incomplete_immunization': 'Child 0-5 without all mandatory vaccines', 'W.case.not_enrolled_or_low_attendance': 'Child 3-17 not enrolled or attendance below 85%',
  'A.L1.no_skill': 'Member 15+ with 0 skills and no SHS diploma → L1', 'A.L2.one_skill_not_recognized': '1 skill, not duly recognized → L2',
  'A.L3.recognized_skill': 'At least 1 duly recognized skill → L3', 'A.L3.two_plus_skills': '2+ skills, none recognized → L3',
  'A.L3.shs_or_higher': 'No/1 skill but SHS graduate or higher (gradel/educal) → L3', 'A.excl.15to17_stata_only': 'Age 15-17: counted by target (15+), excluded by Stata (18+)',
  'A.excl.under15': 'Under 15 excluded', 'A.bnd.grade11_12_not_graduate': 'Grade 11/12 still attending — NOT an SHS diploma', 'A.age.15to17': 'Member aged 15-17 scored (target coverage 15+)',
  'B.L1.not_working_willing_available': 'Not working, willing and available → L1', 'B.L2.short_term_seasonal_casual': 'Working, short-term/seasonal/casual (jstatus 2) → L2',
  'B.L2.per_day_per_week': 'Working, different employers per day/week (jstatus 3) → L2', 'B.L2.per_day_per_week_not_past_week': 'Has job but did not work past week, per day/week (jstatus 3) → L2',
  'B.L3.regular': 'Working, permanent/regular (jstatus 1) → L3', 'B.L3.regular_not_past_week': 'Has regular job but did not work past week → L3',
  'B.excl.not_working_not_willing_available': 'Not working and not willing/available → excluded from average', 'B.excl.under15': 'Under 15 excluded',
  'C.L1.food_poor': 'Monthly per-capita income below food threshold → L1', 'C.L2.income_poor': 'PCI ≥ food threshold but < poverty threshold → L2', 'C.L3.not_income_poor': 'PCI ≥ poverty threshold → L3',
  'C.bnd.pci_at_food_threshold': 'Boundary: PCI exactly at food threshold (should be L2)', 'C.bnd.pci_at_poverty_threshold': 'Boundary: PCI exactly at poverty threshold (should be L3)',
  'C.bnd.pci_just_below_poverty': 'Boundary: PCI just below poverty threshold', 'C.case.4ps_cct_excluded': '4Ps cash present — must be excluded from income',
  'C.case.under15_income_excluded': 'Income of member under 15 — excluded by target rule, included by Stata', 'C.case.ofw_in_family_size': 'OFW member — counted in family size by target, excluded by Stata',
  'C.case.moved_out_or_deceased_excluded': 'Moved-out/deceased member — excluded from family size by target, counted by Stata', 'C.case.imputed_rent_included': 'Imputed rent — added to income by target (×12), ignored by Stata',
  'D.L1.no_sss_gsis': 'No SSS/GSIS member → L1', 'D.L2.sss_under_24m': 'SSS < 24 months → L2', 'D.L2.gsis_under_24m': 'GSIS < 24 months → L2', 'D.L3.sss_24m_plus': 'SSS ≥ 24 months → L3',
  'D.L3.gsis_24m_plus': 'GSIS ≥ 24 months → L3', 'D.bnd.23_months': 'Boundary 23 months', 'D.bnd.24_months': 'Boundary 24 months', 'D.f.mixed_member_levels': 'Family takes the HIGHEST member level (MAX)',
  'E.L1.no_access': 'Nobody has insurance/account/savings → L1', 'E.L2.one_member_access': 'One member with insurance or account, no savings → L2', 'E.L3.savings': 'At least one member with savings → L3',
  'E.L3.two_members_access': '2+ members with access → L3', 'E.div.two_members_different_access': 'Member A insurance + member B account → target L3 (combined count), Stata L2',
  'E.case.same_member_insurance_and_account': 'Same member has insurance AND account (still one member) → L2', 'E.case.savings_only': 'Savings only, no insurance/account → L3',
  'F.L1.non_professional_provider': 'Did not avail; went to albularyo/hilot → L1', 'F.L1.did_not_want': 'Got sick but did not want to avail → L1', 'F.L2.poor_health_services': 'Poor health services → L2',
  'F.L2.poor_client_services': 'Poor client services → L2', 'F.L2.no_accessible_services': 'No accessible services → L2', 'F.L3.availed': 'Availed health services → L3',
  'F.L3.did_not_need': 'Did not need to avail (not sick) → L3', 'F.div.not_sick_but_did_not_avail': 'Not sick but reason "did not want" → Stata L1; target has no level (sickind qualifier)',
  'G.L1.confined_or_chronic': 'Confined / bedridden / chronic → L1', 'G.L2.sick_not_confined': 'Sick, not confined → L2', 'G.L3.not_sick': 'Not sick, not confined → L3',
  'G.div.chronic_but_not_sick': 'Not sick in 6 months but chronic/bedridden (confine = Yes) → target L1, Stata L3', 'G.f.mixed_member_levels': 'Family takes the LOWEST member level (MIN)',
  'H.L1.severely_under': 'Severely under (code 4) → L1', 'H.L1.severely_over': 'Severely over / obese (code 5) → L1', 'H.L1.severe': 'Severe (Stata)', 'H.L2.moderate': 'Moderate (Stata)',
  'H.L2.moderately_under': 'Moderately under (code 2) → L2', 'H.L2.moderately_over': 'Moderately over / overweight (code 3) → L2', 'H.L3.normal': 'All normal → L3',
  'H.div.overweight_only': 'Only overweightind abnormal — Stata ignores overweightind (stays L3)', 'H.div.severe_plus_moderate': 'Severe + moderate in same child — Stata overwrite gives L2, target L1',
  'H.excl.age_19_plus': 'Age 19+ excluded from nutrition',
  'L.L1.cannot_all_5to9': 'Age 5-9 cannot read/write/count → target L1 (Stata overwrite gives L2)', 'L.L1.cannot_all_10to64': 'Age 10-64 cannot read/write/count/understand → target L1 (Stata overwrite gives L2)',
  'L.L2.difficulty_some_5to9': 'Age 5-9 difficulty in some → L2', 'L.L2.difficulty_some_10to64': 'Age 10-64 difficulty in some → L2', 'L.L3.able_all_5to9': 'Age 5-9 able to read, write, count → L3',
  'L.L3.able_all_10to64': 'Age 10-64 able to read, write, count, understand → L3', 'L.chk.basic_literacy_understand_no': 'Reads/writes/counts but cannot understand: Stata L2; Criteria code 3 "basic literacy" may be L3 — confirm',
  'L.excl.under5': 'Under 5 excluded', 'L.excl.65plus': '65+ excluded',
  'M.L1.no_internet': 'No internet use → L1', 'M.L2.info_data_literacy_only': 'Internet + information/data literacy only → L2', 'M.L3.higher_activity': 'Internet + communication/content/safety/problem-solving → L3',
  'M.chk.internet_but_no_activity': 'Used internet but no activity selected — no rule assigns a level; confirm', 'M.excl.under10': 'Under 10 excluded', 'M.excl.65plus': '65+ excluded',
  'N.L1.not_enrolled': 'Not enrolled → L1', 'N.L1.attendance_below_70': 'Enrolled, attendance < 70% → L1', 'N.L2.attendance_70_to_84': 'Attendance 70-84% → L2', 'N.L3.attendance_85_plus': 'Attendance ≥ 85% → L3',
  'N.excl.under3': 'Under 3 excluded', 'N.excl.19plus': '19+ excluded',
  'I.L1.unimproved_source': 'Unprotected well/spring or surface water → L1', 'I.L2.improved_over_30min': 'Improved source, > 30 minutes → L2', 'I.L3.improved_30min_or_less': 'Improved source, ≤ 30 minutes → L3',
  'I.L3.piped_into_dwelling_or_yard': 'Piped into dwelling/yard → L3 (DSWD: remove 11, 12 from L2)', 'I.L3.refilling_or_bottled': 'Refilling station / bottled → L3', 'I.bnd.30min': 'Boundary exactly 30 minutes (L3)',
  'I.bnd.31min': 'Boundary 31 minutes (L2)', 'I.div.piped_dwelling_far_or_blank': 'Piped into dwelling/yard with > 30 min or blank minutes → Stata L2 (missing counts as > 30), target L3',
  'J.L1.open_defecation': 'No facility / open defecation → L1', 'J.L2.unimproved': 'Unimproved facility → L2', 'J.L2.improved_shared': 'Improved facility shared with other families → L2',
  'J.L3.improved_not_shared': 'Improved facility, not shared → L3', 'J.div.open_defecation_toil_shared_no': 'Open defecation but "shared? = No" answered → Stata precedence bug gives L2',
  'J.chk.improved_shared_criteria_code4': 'Criteria code 4 ("has access to improved") may be Level 3 — Stata gives L2; confirm',
  'O.L1.makeshift': 'Roof makeshift → L1', 'O.L1.light_hazard': 'Light roof + hazard-prone → target L1 (Stata overwrite L2)', 'O.L2.light': 'Light roof, not hazard-prone → L2',
  'O.L2.strong_hazard': 'Strong roof + hazard-prone → target L2 (Stata overwrite L3)', 'O.L3.strong': 'Strong roof, not hazard-prone → L3',
  'P.L1.makeshift': 'Wall makeshift → L1', 'P.L1.light_hazard': 'Light wall + hazard-prone → target L1 (Stata overwrite L2)', 'P.L2.light': 'Light wall, not hazard-prone → L2',
  'P.L2.strong_hazard': 'Strong wall + hazard-prone → target L2 (Stata overwrite L3)', 'P.L3.strong': 'Strong wall, not hazard-prone → L3',
  'S.L1': 'Total assets ≤ 3 → L1', 'S.L2': 'Total assets 4-5 → L2', 'S.L3': 'Total assets ≥ 6 → L3', 'S.case.land_or_fishpond_counted': 'Land / fishpond items counted as assets',
  'S.chk.quantity_vs_item_types': 'Stata sums QUANTITIES; level differs if the app counts item TYPES — confirm',
  'T.L1': 'Parenting practices 0-1 → L1', 'T.L2': 'Parenting practices 2-4 → L2', 'T.L3': 'Parenting practices 5-9 → L3',
  'U.L1.no_solution': 'Problem, no solution identified → L1', 'U.L2.solution_not_resolved': 'Solution identified, not resolved → L2', 'U.L3.no_problem': 'No problem → L3', 'U.L3.resolved': 'All problems resolved → L3',
  'U.case.multiple_problems': 'More than one problem', 'U.div.worst_case_mixed_problems': 'Problems with different statuses — target worst case; Stata "resolved" overwrites to L3',
  'V.L1.no_member': 'No member in an organization → L1', 'V.L2.member_only': 'One member is part of an organization → L2', 'V.L2.one_member_participated': 'One member participated in activities → L2',
  'V.L3.officer': 'A member is an officer → L3', 'V.L3.two_plus_participated': '2+ members participated → L3', 'V.div.two_plus_members_not_active': '2+ members, none active/officer: Stata L2; DSWD "==1" leaves no level — confirm',
  'W.L3.every_child_meets_all_applicable': 'Every child 0-17 meets all age-appropriate requirements → L3', 'W.L2.a_child_meets_two_or_more': 'At least one child meets 2+ requirements → L2',
  'W.L1.no_child_meets_two': 'No child meets 2+ requirements → L1', 'W.na.no_children_0_17': 'No children 0-17 — indicator not applicable', 'W.div.partial_vaccines': 'Some vaccines only — Stata counts any vaccine; target needs all mandatory (age 0-5)',
  'W.div.enrolled_attendance_below_85': 'Enrolled but attendance < 85% — Stata counts enrolment; target needs ≥ 85%', 'W.case.child_labor': 'Child engaged in child labour',
  'W.case.birth_not_registered': 'Birth not registered', 'W.case.multiple_children_one_fails': 'Several children, one fails a requirement (blocks L3)',
  'X.L1.no_action': 'GBV experienced, no action → L1', 'X.L2.support_authorities': 'Reported to support authorities → L2', 'X.L3.formal_authorities': 'Reported to formal authorities → L3', 'X.L3.no_gbv': 'No GBV → L3',
  'Y.L1.hazard_prone': 'Hazard-prone area → L1', 'Y.L1.gida': 'GIDA → L1', 'Y.L1.no_items': 'None of kit/knowledge/plan/savings → L1', 'Y.L1.affected_not_recovered': 'Affected and not recovered → L1',
  'Y.L2.one_to_two_items': '1-2 preparedness items → L2', 'Y.L2.three_plus_partially_recovered': '3+ items, partially recovered → L2', 'Y.L3.three_plus_ok': '3+ items, fully recovered or not affected → L3',
  'Y.div.kit_incomplete': 'Kit with only some items — Stata counts any item; DSWD requires ALL kit items', 'Y.div.no_savings_other_three': 'Kit + knowledge + plan but no savings — Stata leaves DRRM missing; target L3',
  'Y.div.volcanic_eruption_not_in_stata': 'Volcanic eruption is not in the Stata disaster list', 'Y.chk.not_recovered_with_one_to_two_items': 'Not recovered + 1-2 items: DSWD comment says L2, Criteria code 3 says L1 — confirm',
  'Y.stata_missing': 'Stata command assigns no level (missing)',
  'Z.case.indicator_not_applicable': 'Household has indicators with no eligible member (N/A) — check how the app scores them', 'Z.bnd.total_near_lowb_cutoff': 'Total score within 0.02 of a LOWB cut-off'
};
function describe(b) {
  if (D[b]) return D[b];
  let m;
  if ((m = b.match(/^([IJ])\.code\.(\d+)$/))) return (m[1] === 'I' ? 'Water source ' : 'Toilet ') + m[2] + ' = ' + ((LISTS[m[1] === 'I' ? 'water' : 'toil'] || {})[m[2]] || '');
  if ((m = b.match(/^([KQRO P])\.code\.(\d+)$/))) {}
  if ((m = b.match(/^(K|Q|R|O|P)\.code\.(\d+)$/))) { const L = { K: 'garbage', Q: 'tenur', R: 'light', O: 'roof', P: 'wall' }[m[1]]; return L + ' code ' + m[2] + ' = ' + ((LISTS[L] || {})[m[2]] || ''); }
  if ((m = b.match(/^(K|Q|R)\.L(\d)$/))) return 'Level ' + m[2];
  if ((m = b.match(/^A\.code\.(.+)$/))) return 'SHS-or-higher code group: ' + m[1];
  if ((m = b.match(/^S\.bnd\.total_(\d+)$/))) return 'Boundary: total assets = ' + m[1];
  if ((m = b.match(/^T\.sum\.(\d+)$/))) return 'Parenting practices ticked = ' + m[1];
  if ((m = b.match(/^U\.type\.(.+)$/))) return 'Problem type: ' + m[1];
  if ((m = b.match(/^X\.type\.(\d+)$/))) return 'GBV type ' + m[1] + ' = ' + LISTS.gvbind[m[1]];
  if ((m = b.match(/^M\.act\.(\d)$/))) return 'Digital activity group ' + m[1];
  if ((m = b.match(/^Y\.disaster\.(\w+)\.r(\d)$/))) return 'Disaster ' + m[1] + ', recovery = ' + (LISTS.recovered[m[2]] || m[2]);
  if ((m = b.match(/^(\w)\.bnd\.age_(\d+)$/))) return 'Age boundary ' + m[2];
  if ((m = b.match(/^(\w)\.f\.average_not_whole_number$/))) return 'Family average is not a whole number (tests rounding)';
  if ((m = b.match(/^(\w)\.f\.mixed_member_levels$/))) return 'Members have different levels';
  if ((m = b.match(/^Z\.lowb\.L(\d)$/))) return 'Overall LOWB = Level ' + m[1];
  return b;
}
function kindOf(b) {
  if (/\.div\./.test(b)) return 'Rule conflict (target vs Stata)';
  if (/\.chk\./.test(b)) return 'Needs DSWD confirmation';
  if (/\.bnd\./.test(b)) return 'Boundary';
  if (/\.code\.|\.type\.|\.act\.|\.sum\.|\.disaster\./.test(b)) return 'Option spread';
  if (/\.excl\.|\.na\./.test(b)) return 'Coverage / exclusion';
  if (/\.case\.|\.f\./.test(b)) return 'Special case';
  if (/\.L\d/.test(b)) return 'Level';
  return 'Other';
}


function needs(b) {
  const ind = b[0]; let m;
  if ((m = b.match(/bnd\.age_(\d+)/))) return 'member aged exactly ' + m[1];
  if (/^A\.(excl\.15to17|age\.15to17)/.test(b)) return 'member aged 15-17';
  if (/^A\.bnd\.grade11/.test(b)) return 'member 16-18 attending Grade 11/12';
  if (/^A\.code\./.test(b)) return 'member 19+ (SHS diploma or higher)';
  if (/^A\.excl\.under15|^B\.excl\.under15|^D\.excl/.test(b)) return 'member under 15';
  if ('ABD'.includes(ind)) return 'member 15+';
  if (ind === 'C') { if (/under15/.test(b)) return 'member 5-14 with income'; if (/ofw/.test(b)) return '3+ members, 2 adults'; if (/moved_out/.test(b)) return 'moved-out or deceased member in the roster'; return 'any household'; }
  if (ind === 'E' || ind === 'V') return /div|two/.test(b) ? '2+ members 15+' : 'member 15+';
  if (ind === 'H') return /excl/.test(b) ? 'member 19+' : 'member 0-18';
  if (ind === 'L') return /5to9/.test(b) ? 'member 5-9' : /under5/.test(b) ? 'member under 5' : /65plus/.test(b) ? 'member 65+' : 'member 10-64';
  if (ind === 'M') return /under10/.test(b) ? 'member under 10' : /65plus/.test(b) ? 'member 65+' : 'member 10-64';
  if (ind === 'N') return /under3/.test(b) ? 'member under 3' : /19plus/.test(b) ? 'member 19+' : 'member 3-18';
  if (ind === 'W') { if (/vaccin/.test(b)) return 'child 0-5'; if (/labor/.test(b)) return 'child 5-17'; if (/multiple|one_fails/.test(b)) return '2+ children 0-17'; if (/na\./.test(b)) return 'no member 0-17'; if (/attendance|enrolled/.test(b)) return 'child 3-17'; return 'child 0-17'; }
  if ('FG'.includes(ind)) return 'any member';
  if (ind === 'Z') return /not_applicable/.test(b) ? 'no eligible member for an indicator (e.g. no children)' : 'any household';
  return 'any household';
}
const list = IDS.map(id => ({ id, ind: id[0] === 'Z' ? 'LOWB' : id[0], kind: kindOf(id), desc: describe(id), needs: needs(id) }));
fs.writeFileSync(path.join(__dirname, '../engine/swdi-scenarios.js'), '/* Generated by scripts/gen-scenarios.js. */\n(function (root) {\n  var SCENARIOS = ' + JSON.stringify(list) + ';\n  if (typeof module !== \'undefined\' && module.exports) module.exports = SCENARIOS; else root.SWDIScenarios = SCENARIOS;\n})(this);\n');
console.log('scenarios', list.length);
