# SWDI Scoring Test Runner

Test tool for **Enhanced SWDI scoring** in the **SWDI App** (mobile) and **4Ps Forward** (Odoo SWDI Review).

* Testers use real households that already exist in the SWDI App. They record the **roster as the app lists it** (name, age, sex, relationship, status), so every age filter is exercised.
* **Guided mode** previews new family levels, member combinations, scoring boundaries and open platform checks for the entered roster. It compares saved runs across test instances for coverage and replays discrepancies on the instance where they were observed. **Record mode** logs whatever the tester entered.
* The **scoring engine** grades automatically and shows its reasoning: for every indicator and member it states the criterion applied, who was excluded by age, and how the family level was aggregated. No manual grading.
* After sync, the tester types or pastes the scores shown by each platform. Every indicator gets a verdict: `PASS`, `STATA RULE`, `ROUNDING`, `FAIL`, `NOT SCORED` or `N/A CHECK`.
* Everything is stored in a Google Sheet (runs, roster, entries, scores, scenario coverage, dashboard).
* **Several testers** share the sheet. Each run records who created it and who saved it last. The run list shows the Family ID and household head, can be searched, and defaults to **My runs** (switch to **All runs** to see everyone's). Runs can be saved part-way and resumed: opening a run goes to its next unfinished step.
* The **SWDI Test Capture** browser extension reads the 4Ps Forward Assessment Review (score, indicators, roster, answers) and sends it to the web app, so 4Ps Forward results are not retyped.

| Piece | Where |
|---|---|
| Data sheet | `config.json → sheetId` ([SWDI Scoring Test Runner — Data](https://docs.google.com/spreadsheets/d/1gn8McB-G4chm4NzzVI9rb25Vo4sfUmqzp5RALhoKMIU/edit)) |
| Scoring engine (target + Stata rule sets, criteria trail) | `engine/swdi-engine.js` |
| Guided planner and case history | `engine/swdi-planner.js`, `engine/swdi-coverage.js` |
| Form definitions and choice lists (BRVD Annex A v0.4 / v0.6) | `engine/swdi-fields.js` (generated) |
| Scenario catalog (313 branches, boundaries, option spread, rule conflicts) | `engine/swdi-scenarios.js` (generated from `sheet/scenario_ids.json`) |
| Apps Script back end | `src/Code.js`, `src/appsscript.json` |
| Web app UI | `src/index.html` (engine files are inlined at build) |
| 4Ps Forward helpers (code map D1→D …, score card reader, capture → run) | `engine/swdi-fpf.js` (copied to `extension/lib/` at build) |
| SWDI Test Capture extension (Chrome / Edge, MV3, read-only) | `extension/` |
| Deploy | `scripts/deploy.js` (clasp) and `.github/workflows/deploy.yml` |

## Several testers

* **Who is who.** The web app runs as the deploying account. Google tells the script the visitor's email only when the visitor is in the same Google Workspace domain; otherwise the app uses the **Tester** name typed at the top right (remembered per browser). Each tester should type the same name every time.
* **Runs columns.** `Created by`, `Last saved by`, `Household head`, `Environment`, `4Ps Forward link`, `Progress` (n/4 steps and the next one) and `Revision`. Existing sheets get the new header cells automatically on the next page load.
* **Two people on one run.** Each save carries the revision the tester opened. If someone else saved in between, the save is refused with their name, so nobody overwrites a colleague's work silently.
* **Unsaved work** is kept in the browser every few seconds; the Overview offers *Restore* after a closed tab or lost connection.

## Test details and exported test records

* **Food and poverty thresholds** (① Household & roster) can be typed **monthly** or **annual** per capita. Tick **Annual (÷ 12)** for yearly values: income (C) is graded on monthly per-capita income, so annual thresholds are divided by 12 before the comparison. The field shows the monthly values used, and the run saves the values as typed plus a `Threshold period` column (runs saved before this column are monthly).
* **Screen shows: level / weighted score** (④ Verify scores) also switches the expected ES and SA totals: **level** shows them re-scaled (raw ÷ 0.3333 or ÷ 0.6669, the 1–3 scale 4Ps Forward shows), **weighted score** shows the raw weighted sums. The TOTAL SWDI score and LOWB are the same in both.
* **Levels** (indicator levels, family averages and the TOTAL score) always show 4 decimal places, e.g. `2.4000`.
* **Why?** Every verdict other than `PASS` (`FAIL`, `STATA RULE`, `ROUNDING`, `NOT SCORED`, `N/A CHECK`), in both the SWDI App and the 4Ps Forward column, has a collapsible explanation: what the platform showed against the policy and Stata results, the member responses, and the criteria.
* **Test details for the developer** (④ Verify scores): SWDI App version, SWDI App used (date & time), 4Ps Forward used (date & time) and the 4Ps Forward assessment shown (period, date, status). A capture fills the 4Ps Forward fields. They are saved in the Runs tab.
* **Export test record** (④ Verify scores) builds a record to attach to an issue: test details, summary, every non-passing score with its explanation **expanded**, all scores, the roster, notes and (optionally) the values entered.
  * **Print / Save as PDF** uses the browser's print dialog.
  * **Download PDF** and **Upload PDF to Google Drive** convert the record on the server. The upload saves it in the Drive folder and shows the link with a **Copy link** button. The link is also saved in the run's `Exported record link` column.
  * Drive folder: `config.json → driveFolderId`. The sheet's Config tab can override it with a `drive_folder_id` row (folder ID or link).
  * The web app runs as the deploying account, so that account needs **Editor** access to the folder, and people who open the links need at least view access to it. After deploying this version, the owner opens the web app once and clicks **Allow** again, because it now asks for Google Drive access.

## Reports

* **Reports** (weekly, custom period or final) use the same layout as the exported test record. Findings are grouped by indicator and verdict, with a summary table of the runs in each group.
* **Detailed findings** (on by default): under each finding, every run is explained the same way as in its test record: what each platform showed against the policy and Stata results, why the verdict, the member responses and the criteria. The report loads the saved answers of those runs once (one sheet read) and grades them again. A run already explained under an earlier finding (same run and indicator) points back to it. If grading the saved answers again gives a different verdict from the one saved (the rules changed since), the run says so; open the run and save it again to update the sheet.
* **Print / Save as PDF**, **Download PDF** and **Upload PDF to Google Drive** work as for test records (same Drive folder). **Copy for Docs** pastes the report into Google Docs or Word.

## SWDI Test Capture extension

A separate, read-only extension (it does not replace the SWDI CMS Assistant reviewer extension). It runs only on `4ps-dp-preprod.dswd.gov.ph` and `4ps-dp-preprod-loadtest.dswd.gov.ph`.

1. Install: `chrome://extensions` (or `edge://extensions`) → **Developer mode** → **Load unpacked** → select this repository's `extension` folder. Each GitHub Actions run also publishes it as the `swdi-test-capture-extension` artifact.
2. Click the extension icon → **Settings** → paste the web app URL (from the deploy summary).
3. In 4Ps Forward open the household's **Assessment Review** → **Capture this assessment**. It reads the Current column only: Household ID, period, status, the SWDI Score card (total, level, Partial flag, ES/SA as shown, each indicator), and — when *Include roster and answers* is ticked — every member tab and every answer. To read them it opens sections and member tabs, then switches back. It never edits, approves or returns an assessment.
4. **Send to Test Runner** opens the web app with the capture in the URL `#hash` (it is not sent to any server). The web app offers to fill the 4Ps Forward scores of an existing run with the same Family ID, or to create a **Record-mode run** from the captured roster and answers. **Copy JSON** + *Import from 4Ps Forward → paste* does the same by hand.

Notes: 4Ps Forward shows **re-scaled** ES/SA (raw ÷ 0.3333 and raw ÷ 0.6669). Indicators missing from a *Partial* score are imported as `N/A`; the verdict is `NOT SCORED` when the expected result has a level for them, and the totals that depend on them are not compared. 4Ps Forward codes map as A, B, C, D1→D, D2→E, E1→F, E2→G, E3→H, E4→I, E5→J, E6→K, F1→L, F2→M, F3→N, G1→O … G5→S, H1→T, H2→U, H3→V, I1→W, I2→X, I3→Y.

## Verdicts

| Verdict | When |
|---|---|
| `PASS` | The platform shows the policy (target) result, within tolerance. |
| `STATA RULE` | The platform shows the BRVD Stata result and the policy result differs. |
| `ROUNDING` | Only a decimal problem. The criteria were followed: the policy rule and the Stata command give the **same** family average with decimals (e.g. 2.8333), and the platform shows it rounded (3) or truncated (2). Its other family averages in the run show no decimals either. |
| `FAIL` | Neither rule explains the score. A whole number near the policy average is **not** called `ROUNDING` when the policy and Stata rules give different family results for the indicator (the platform's member levels are then in question), or when the platform keeps decimals on its other family averages. The *Why?* text says which and, where possible, which member levels reproduce the platform score. |
| `NOT SCORED` | The platform shows `N/A` for an indicator that has an expected level, or the total is a partial score (for example, Income has no threshold on the device). Check that the platform was ready; if it was, report a defect. |
| `N/A CHECK` | The policy rule gives no level (no eligible member); confirm the handling with SCMD. |

A score typed with two or more decimals (trailing zeros not counted) must match to the decimals shown (1.67 passes for 1.6667; 1.66 is `ROUNDING`, decimals cut). Weighted scores keep the weighted tolerance. ES, SA and TOTAL tighten to ±0.0001 when typed with four decimals. The SWDI App version (build) is required before results are saved, and a report that mixes builds says so.

## Rule sets

* **Target**: the Criteria for the Levels of Well-Being plus the DSWD comments in BRVD *Scoring Rules*. Examples: age 15+ for skills; `educal` also counts for the SHS diploma; hazard-prone downgrades roof and walls; worst case applies to problems and DRRM; savings counts as a DRRM item; financial institutions use a combined access count; overweight is included in nutrition; income is net of 4Ps/CCT and of under-15 income, adds imputed rent ×12, and the family size excludes moved-out and deceased members.
* **Stata**: the BRVD Stata command (Annex A v0.4; the v0.6 formulas are the same) run exactly as written. It is not the separate Stata do file of March 2026. It keeps the overwrite order of `replace` and Stata's rule that a missing value is greater than any number. When the platform matches this rule and not the target, the verdict is `STATA RULE`. That means the DSWD-requested change has not been implemented.

## One-time setup: deploy from GitHub with clasp

1. With the DSWD Google account that owns the data sheet, turn on **Google Apps Script API**: <https://script.google.com/home/usersettings>.
2. On your computer (Node 20+), run `npx @google/clasp login` and approve in the browser with the same account. This writes `~/.clasprc.json` (on Windows: `C:\Users\<you>\.clasprc.json`).
3. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `CLASPRC_JSON` and paste the whole content of that file.
4. Go to **Actions → Test and deploy → Run workflow**, and enable **Create a new Apps Script project on first deployment** for a new project. For an existing project, set `SCRIPT_ID` to its Apps Script project ID. The job summary prints its `SCRIPT_ID` and the web-app URL.
5. Under **Settings → Secrets and variables → Actions → Variables**, add `SCRIPT_ID` with the printed value. Later runs then update the same project and keep the same URL.
6. Open the web-app URL once with the owner account and click **Allow** (this grants access to the sheet). Paste the URL in the sheet's `Config` tab and share it with the testers. Access is limited to dswd.gov.ph accounts, and testers do not need access to the sheet.

Every push to `main` runs the tests, builds the app, pushes with clasp and updates the deployment. Compare the version next to the web app title with **App version** in the successful deployment summary. The eight-character build ID changes automatically when the web app code or manifest changes.

Notes:
* `CLASPRC_JSON` is a Google login token. Keep the repo private, and revoke it at <https://myaccount.google.com/permissions> if needed.
* If the Workspace admin blocks the clasp OAuth client, ask them to allow it, or log in with your own OAuth client: `clasp login --creds client_secret.json`.
* Local deploy works too: run `npm ci`, then `npx clasp login`, then `npm run deploy`. Set `SCRIPT_ID=...` to target the existing project.

## Development

```bash
npm ci
npm test            # engine rules, Manual worked example, sample sheet checks, planner, server logic (fake SpreadsheetApp)
npm run build       # dist/ for clasp + preview/index.html (stand-alone demo, data kept in the browser)
```

* To regenerate the form definitions after a new BRVD version: `node scripts/gen-fields.js varmeta.json`. The `varmeta.json` is extracted from the BRVD workbook.
* After changing engine branches: `npm run catalog`. This rebuilds the scenario catalog; then reload the Scenarios tab with the new rows.
* The sheet structure is defined by `SCHEMA` in `src/Code.js`. `sheet/build_sheet.py` builds the initial workbook from it, and `setupSheet()` recreates any missing tab.

Indicator V uses the BRVD v0.4 Scoring Rules Level 2 criterion (“any member”). Two or more members with no officer and fewer than two participants score Level 2. The review comment on row 112 proposes exactly one member, which leaves that case unassigned.

Indicator W grades each eligible child against the requirements for that age. In mixed households the tester uses the lowest child level for the policy result. This gives Level 1 precedence when one child meets only one requirement and another meets more. The BRVD row 123 review describes overlapping Level 1 and Level 2 cases. The Stata comparison retains the tester's highest-child assumption.

## Rules confirmed by SCMD

Confirmed on 25 November 2026:

* Availment of health services: "did not want to avail" (99) is Level 1, sick or not; so is a non-professional provider (4)
* assets: count the number of assets, not the item types
* functional literacy, ages 10-64: cannot understand simple messages → Level 2
* DRRM: "not recovered" is Level 1, also with 1-2 items
* nutrition: stunting, wasting, underweight and overweight for each child, then the average (OI-090)
* employable skills: members aged 15 and above
* digital literacy: internet = Yes with None in all five activity groups is Level 1; activities not recorded give no level

## Open rules to confirm with SCMD

These show up as **Needs DSWD confirmation** or `N/A CHECK`:

* how indicators with no eligible member are scored
* improved toilet shared with other families: L2 or L3
* nutrition fields recorded as Yes/No in Odoo but as maln codes in BRVD
