"""Builds the data workbook for the SWDI Scoring Test Runner (uploaded once to Google Drive as a Google Sheet).
Headers come from src/Code.js (SCHEMA) so the sheet and the web app never drift apart.
Usage: python3 sheet/build_sheet.py out.xlsx
"""
import json, subprocess, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.formatting.rule import CellIsRule
from openpyxl.utils import get_column_letter as L

js = r"""
const vm=require('vm'),fs=require('fs');const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/Code.js','utf8'),ctx);
const E=require('./engine/swdi-engine.js'),SC=require('./engine/swdi-scenarios.js'),F=require('./engine/swdi-fields.js');
console.log(JSON.stringify({schema:ctx.SCHEMA,ind:E.INDICATORS,sc:SC,lists:F.LISTS}));
"""
D = json.loads(subprocess.check_output(['node', '-e', js]))
SCH, IND, SC, LISTS = D['schema'], D['ind'], D['sc'], D['lists']
NAVY, TEAL = '1F3A5F', '0F766E'
HF, HFont = PatternFill('solid', fgColor=NAVY), Font(bold=True, color='FFFFFF')
GREEN, RED, AMBER, BLUE, SUB = [PatternFill('solid', fgColor=c) for c in ('D9F2E3', 'FBDADA', 'FFF1CC', 'DCEBFA', 'E8EEF5')]
WRAP = Alignment(wrap_text=True, vertical='top')
wb = Workbook()

def sheet(title, headers, widths, rows=(), first=False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append(headers)
    for i, h in enumerate(headers, 1):
        c = ws.cell(1, i); c.fill = HF; c.font = HFont; c.alignment = Alignment(wrap_text=True, vertical='center')
        ws.column_dimensions[L(i)].width = widths[i - 1] if i - 1 < len(widths) else 14
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = 'B2'
    for r in rows: ws.append(r)
    return ws

def verdict_cf(ws, rng):
    for v, f in (('PASS', GREEN), ('FAIL', RED), ('STATA RULE', AMBER), ('ROUNDING', AMBER), ('N/A CHECK', BLUE), ('CHECK', BLUE)):
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=['"%s"' % v], fill=f))

# Guide
g = wb.active; g.title = 'Guide'; g.column_dimensions['A'].width = 3; g.column_dimensions['B'].width = 125
lines = [
 ('SWDI Scoring Test Runner — data workbook', 't'),
 ('Testers work in the web app (link in the Config tab once deployed). This workbook stores every test run and is the source for progress reporting. Do not rename tabs or header cells.', ''),
 ('How a test run works', 'h'),
 ('1. In the SWDI App, open an existing household. In the web app click "New test run", enter its Family ID, the SWDI IS food/poverty thresholds for its province, and the roster exactly as the app lists it (name, age, sex, relationship, status).', ''),
 ('2. Guided mode: the web app proposes the value to enter for every question, chosen by the members\' ages to hit scenarios no earlier run covered. Record mode: you enter what you put in the app. Either way, change any field to what you actually entered.', ''),
 ('3. "Expected & criteria" shows each indicator\'s level with the criterion applied to every member, members excluded by age, and the family aggregation (average / highest / lowest). No manual grading is needed — review the reasoning instead.', ''),
 ('4. After submitting and syncing, type (or paste) the scores shown by the SWDI App and by 4Ps Forward. Each indicator gets a verdict and the run is saved here.', ''),
 ('Verdicts', 'h'),
 ('PASS = matches the DSWD target rule.  STATA RULE = matches the BRVD Stata command as written (DSWD-requested change not implemented).  ROUNDING = matches the family average rounded.  FAIL = matches neither.  N/A CHECK = no eligible member; confirm the rule.', ''),
 ('Tabs', 'h'),
 ('Dashboard — progress.  Runs — one row per interview (PK Run ID).  Roster — members per run.  Entries — every value entered (with the suggested value and target scenarios in Guided mode).  Scores — expected vs observed per indicator, with the grading trail.  Scenarios — catalog of 313 rule branches/boundaries/options with live coverage.  Criteria — level criteria per indicator.  Config — default thresholds, tolerances, testers.', ''),
 ('Sources: BRVD Annex A SWDI Field Inventory v0.4 (Scoring Rules, Field Inventory, Choices Lists); FINAL Criteria for the Levels of Well-Being for the Enhanced SWDI Indicators; Enhanced SWDI Manual (weights, formula, LOWB cut-offs 2.83 / 1.83).', 's'),
]
for i, (t, k) in enumerate(lines, 1):
    c = g.cell(i, 2, t); c.alignment = WRAP
    if k == 't': c.font = Font(bold=True, size=16, color=NAVY); g.row_dimensions[i].height = 28
    elif k == 'h': c.font = Font(bold=True, size=12, color=TEAL)
    elif k == 's': c.font = Font(italic=True, size=9, color='666666')
    else: g.row_dimensions[i].height = max(18, 15 * (len(t) // 115 + 1))

# data tabs (headers from Code.js)
widths = {'Runs': [18, 22, 9, 16, 12, 10, 10, 20, 8, 10, 9, 9, 12, 10, 10, 10, 9, 9, 10, 30, 16, 16],
          'Roster': [22, 18, 8, 22, 6, 8, 16, 12], 'Entries': [30, 18, 8, 18, 26, 18, 44, 10, 26, 10, 40, 10],
          'Scores': [22, 18, 6, 32, 8, 9, 9, 9, 8, 50, 60, 40, 9, 11, 9, 11, 11, 40, 20, 16], 'Log': [18, 16, 18, 18, 60]}
for name in ['Runs', 'Roster', 'Entries', 'Scores']:
    ws = sheet(name, SCH[name], widths[name])
    if name == 'Scores':
        for col in ('N', 'P', 'Q'): verdict_cf(ws, '%s2:%s5000' % (col, col))
        ws.conditional_formatting.add('I2:I5000', CellIsRule(operator='equal', formula=['TRUE'], fill=AMBER))
    if name == 'Runs':
        ws.conditional_formatting.add('H2:H500', CellIsRule(operator='equal', formula=['"Verified in 4Ps Forward"'], fill=GREEN))

# Scenarios with live coverage formulas
NS = len(SC) + 1
rows = []
for i, s in enumerate(SC, 2):
    crit = '"*|"&A%d&"|*"' % i
    rows.append([s['id'], s['ind'], s['kind'], s['desc'], s['needs'],
                 '=COUNTIF(Scores!$R:$R,%s)' % crit,
                 '=COUNTIFS(Scores!$R:$R,%s,Scores!$Q:$Q,"?*")' % crit,
                 '=COUNTIFS(Scores!$R:$R,%s,Scores!$Q:$Q,"PASS")' % crit,
                 '=COUNTIFS(Scores!$R:$R,%s,Scores!$Q:$Q,"FAIL")' % crit,
                 '=COUNTIFS(Scores!$R:$R,%s,Scores!$Q:$Q,"STATA RULE")' % crit,
                 '=IF(I{0}>0,"FAIL",IF(J{0}>0,"STATA RULE",IF(H{0}>0,"PASS",IF(G{0}>0,"CHECK",IF(F{0}>0,"Planned","Not tested")))))'.format(i)])
ws = sheet('Scenarios', ['Scenario ID', 'Indicator', 'Kind', 'What is being tested', 'Needs', 'Runs exercising it', 'Verified', 'Pass', 'Fail', 'Stata rule', 'Status'],
           [36, 8, 24, 66, 26, 9, 9, 7, 7, 9, 12], rows)
verdict_cf(ws, 'K2:K%d' % NS)
ws.conditional_formatting.add('C2:C%d' % NS, CellIsRule(operator='equal', formula=['"Rule conflict (target vs Stata)"'], fill=AMBER))
ws.conditional_formatting.add('C2:C%d' % NS, CellIsRule(operator='equal', formula=['"Needs DSWD confirmation"'], fill=BLUE))
ws.auto_filter.ref = 'A1:K%d' % NS
for r in ws.iter_rows(min_row=2): r[3].alignment = WRAP

# Criteria
NOTES = {'A': 'Stata covers 18+ only and reads gradel (attending) only.', 'C': 'Stata: family size = all captured members − OFW; under-15 income counted; no imputed rent.',
         'E': 'Stata counts insurance and accounts separately.', 'F': 'Stata Level 1 has no "got sick" qualifier.', 'G': 'Stata: not sick → 3 even if confined/chronic.',
         'H': 'Stata ignores overweightind; moderate overwrites severe.', 'I': 'Stata keeps 11/12 in the > 30 min rule; blank minutes count as > 30.',
         'J': 'Stata precedence: any toilet with shared = No passes the Level 2 line.', 'L': 'Stata overwrite turns all-No into 2.', 'O': 'Stata overwrite ignores hazard-prone.',
         'P': 'Stata overwrite ignores hazard-prone.', 'U': 'Stata: any resolved problem overwrites to 3.', 'V': 'Stata: ≥1 member → 2 (DSWD asked for exactly 1).',
         'W': 'Stata: any vaccine, enrolment only, needs all 4 for 3.', 'Y': 'Stata: any kit item, no savings, no volcanic eruption; 3 items without savings → missing.'}
rows = [[d['code'], d['name'], d['dim'], d['w'], d['cov'], d['agg'], d['criteria']['1'], d['criteria']['2'], d['criteria']['3'], NOTES.get(d['code'], 'Same as target.')] for d in IND]
ws = sheet('Criteria', ['Code', 'Indicator', 'Dim', 'Weight', 'Coverage', 'Family aggregation', 'Level 1', 'Level 2', 'Level 3', 'Stata as written — difference'],
           [6, 34, 6, 8, 18, 12, 40, 40, 40, 40], rows)
for r in ws.iter_rows(min_row=2):
    for c in r: c.alignment = WRAP
ws.append([]); ws.append(['', 'Economic Sufficiency weight 0.3333 · Social Adequacy weight 0.6669 · ES re-scaled = raw ÷ 0.3333 · SA re-scaled = raw ÷ 0.6669 · LOWB: total ≥ 2.83 → 3, ≥ 1.83 → 2, else 1'])

# Dashboard
db = wb.create_sheet('Dashboard', 1)
db.column_dimensions['A'].width = 40
for c in 'BCDEFGH': db.column_dimensions[c].width = 14
db['A1'] = 'SWDI Scoring Test — Progress'; db['A1'].font = Font(bold=True, size=16, color=NAVY)
db['A2'] = '=CONCATENATE("Updated ",TEXT(NOW(),"yyyy-mm-dd hh:mm"))'; db['A2'].font = Font(italic=True, color='666666')
STAT = ['Draft', 'Entering in SWDI App', 'Synced — verify scores', 'Verified in SWDI App', 'Verified in 4Ps Forward', 'Blocked']
db['A4'] = 'Test runs'; db['A4'].font = Font(bold=True, color=TEAL, size=12)
db['A5'] = 'Total'; db['B5'] = '=COUNTA(Runs!A2:A5000)'
for k, s in enumerate(STAT): db.cell(6 + k, 1, s); db.cell(6 + k, 2, '=COUNTIF(Runs!H2:H5000,"%s")' % s)
db['D4'] = 'Indicator checks'; db['D4'].font = Font(bold=True, color=TEAL, size=12)
for k, (lab, f, fill) in enumerate([('Executed', '=COUNTIF(Scores!Q2:Q50000,"?*")', None), ('PASS', '=COUNTIF(Scores!Q2:Q50000,"PASS")', GREEN), ('FAIL', '=COUNTIF(Scores!Q2:Q50000,"FAIL")', RED),
                                    ('STATA RULE', '=COUNTIF(Scores!Q2:Q50000,"STATA RULE")', AMBER), ('ROUNDING', '=COUNTIF(Scores!Q2:Q50000,"ROUNDING")', AMBER), ('N/A CHECK', '=COUNTIF(Scores!Q2:Q50000,"N/A CHECK")', BLUE)]):
    db.cell(5 + k, 4, lab); c = db.cell(5 + k, 5, f); c.font = Font(bold=True)
    if fill: c.fill = fill
db['G4'] = 'Scenario coverage'; db['G4'].font = Font(bold=True, color=TEAL, size=12)
for k, (lab, f) in enumerate([('Scenarios', '=COUNTA(Scenarios!A2:A%d)' % NS), ('Exercised', '=COUNTIF(Scenarios!F2:F%d,">0")' % NS), ('Verified', '=COUNTIF(Scenarios!G2:G%d,">0")' % NS),
                              ('Passed', '=COUNTIF(Scenarios!K2:K%d,"PASS")' % NS), ('Failed', '=COUNTIF(Scenarios!K2:K%d,"FAIL")' % NS), ('Stata rule', '=COUNTIF(Scenarios!K2:K%d,"STATA RULE")' % NS),
                              ('% verified', '=IFERROR(H7/H5,0)')]):
    db.cell(5 + k, 7, lab); db.cell(5 + k, 8, f).font = Font(bold=True)
db['H11'].number_format = '0%'
top = 14
db.cell(top, 1, 'By indicator').font = Font(bold=True, color=TEAL, size=12)
for j, h in enumerate(['Indicator', 'Executed', 'PASS', 'FAIL', 'STATA RULE', 'ROUNDING', 'Scenarios', 'Exercised'], 1):
    c = db.cell(top + 1, j, h); c.fill = HF; c.font = HFont
codes = [(d['code'], d['code'] + ' — ' + d['name']) for d in IND] + [('TOTAL', 'TOTAL SWDI score'), ('LOWB', 'LOWB')]
for k, (code, name) in enumerate(codes):
    r = top + 2 + k
    db.cell(r, 1, name)
    db.cell(r, 2, '=COUNTIFS(Scores!C:C,"%s",Scores!Q:Q,"?*")' % code)
    for j, v in enumerate(['PASS', 'FAIL', 'STATA RULE', 'ROUNDING'], 3): db.cell(r, j, '=COUNTIFS(Scores!C:C,"%s",Scores!Q:Q,"%s")' % (code, v))
    db.cell(r, 7, '=COUNTIF(Scenarios!B:B,"%s")' % code); db.cell(r, 8, '=COUNTIFS(Scenarios!B:B,"%s",Scenarios!F:F,">0")' % code)
end = top + 1 + len(codes)
db.conditional_formatting.add('D%d:D%d' % (top + 2, end), CellIsRule(operator='greaterThan', formula=['0'], fill=RED))
db.conditional_formatting.add('E%d:F%d' % (top + 2, end), CellIsRule(operator='greaterThan', formula=['0'], fill=AMBER))
db.conditional_formatting.add('C%d:C%d' % (top + 2, end), CellIsRule(operator='greaterThan', formula=['0'], fill=GREEN))

# Config
cf = wb.create_sheet('Config')
cf.column_dimensions['A'].width = 22; cf.column_dimensions['B'].width = 40; cf.column_dimensions['C'].width = 90
cf.append(['key', 'value', 'notes'])
for c in cf[1]: c.fill = HF; c.font = HFont
for r in [('food_threshold', 2053, 'Default monthly per-capita FOOD threshold (₱) offered for new runs (value from the Sample 1 score sheet). Each run stores its own thresholds — set the SWDI IS value for the household\'s province/urban-rural.'),
          ('poverty_threshold', 2647, 'Default monthly per-capita POVERTY threshold (₱) for new runs (Sample 1 value).'),
          ('level_tolerance', 0.01, 'Observed level within this of expected = match.'),
          ('weighted_tolerance', 0.0006, 'Observed weighted score within this of expected = match.'),
          ('web_app_url', '', 'Filled in after the first deployment (GitHub Actions log prints it).'),
          ('app_version', '', 'SWDI App build under test.')]:
    cf.append(list(r))
for row in cf.iter_rows(min_row=2): row[2].alignment = WRAP
cf.append([]); cf.append(['tester', 'Tester 1', 'One row per tester name (key = tester).']); cf.append(['tester', 'Tester 2', ''])

# Lists
rows = []
for ln in ['water', 'toil', 'garbage', 'roof', 'wall', 'tenur', 'light', 'jstatus', 'ynotavail_med', 'maln', 'schattendance', 'gvb_res', 'recovered', 'gvbind', 'disastkit', 'digiact', 'vaccine', 'reln', 'gradel']:
    for code, lab in LISTS[ln].items(): rows.append([ln, int(code), lab])
sheet('Lists', ['List', 'Code', 'Label'], [16, 8, 90], rows)
sheet('Log', SCH['Log'], widths['Log'])

order = ['Guide', 'Dashboard', 'Runs', 'Roster', 'Entries', 'Scores', 'Scenarios', 'Criteria', 'Config', 'Lists', 'Log']
wb._sheets = [wb[n] for n in order]
for n, c in {'Guide': NAVY, 'Dashboard': TEAL, 'Runs': '2563EB', 'Scores': 'D97706', 'Scenarios': 'D97706', 'Criteria': '7C3AED', 'Config': '6B7280'}.items():
    wb[n].sheet_properties.tabColor = c
out = sys.argv[1] if len(sys.argv) > 1 else 'SWDI_Scoring_Test_Runner_Data.xlsx'
wb.save(out)
print('saved', out, 'scenarios', NS - 1)
