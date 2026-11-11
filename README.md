# SWDI Scoring Test Runner

Test tool for **Enhanced SWDI scoring** in the **SWDI App** (mobile) and **4Ps Forward** (Odoo SWDI Review).

* Testers use real households that already exist in the SWDI App. They record the **roster as the app lists it** (name, age, sex, relationship, status), so every age filter is exercised.
* **Guided mode** proposes the value to enter for each question, chosen from the members' ages to hit scenarios that no earlier run has covered. **Record mode** logs whatever the tester entered.
* The **scoring engine** grades automatically and shows its reasoning: for every indicator and member it states the criterion applied, who was excluded by age, and how the family level was aggregated. No manual grading.
* After sync, the tester types or pastes the scores shown by each platform. Every indicator gets a verdict: `PASS`, `STATA RULE`, `ROUNDING`, `FAIL` or `N/A CHECK`.
* Everything is stored in a Google Sheet (runs, roster, entries, scores, scenario coverage, dashboard).
* **Several testers** share the sheet. Each run records who created it and who saved it last. The run list shows the Family ID and household head, can be searched, and defaults to **My runs** (switch to **All runs** to see everyone's). Runs can be saved part-way and resumed: opening a run goes to its next unfinished step.
* The **SWDI Test Capture** browser extension reads the 4Ps Forward Assessment Review (score, indicators, roster, answers) and sends it to the web app, so 4Ps Forward results are not retyped.

| Piece | Where |
|---|---|
| Data sheet | `config.json → sheetId` ([SWDI Scoring Test Runner — Data](https://docs.google.com/spreadsheets/d/1gn8McB-G4chm4NzzVI9rb25Vo4sfUmqzp5RALhoKMIU/edit)) |
| Scoring engine (target + Stata rule sets, criteria trail) | `engine/swdi-engine.js` |
| Guided planner (engine-driven scenario search) | `engine/swdi-planner.js` |
| Form definitions and choice lists (BRVD Annex A v0.4) | `engine/swdi-fields.js` (generated) |
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

## SWDI Test Capture extension

A separate, read-only extension (it does not replace the SWDI CMS Assistant reviewer extension). It runs only on `4ps-dp-preprod.dswd.gov.ph` and `4ps-dp-preprod-loadtest.dswd.gov.ph`.

1. Install: `chrome://extensions` (or `edge://extensions`) → **Developer mode** → **Load unpacked** → select this repository's `extension` folder. Each GitHub Actions run also publishes it as the `swdi-test-capture-extension` artifact.
2. Click the extension icon → **Settings** → paste the web app URL (from the deploy summary).
3. In 4Ps Forward open the household's **Assessment Review** → **Capture this assessment**. It reads the Current column only: Household ID, period, status, the SWDI Score card (total, level, Partial flag, ES/SA as shown, each indicator), and — when *Include roster and answers* is ticked — every member tab and every answer. To read them it opens sections and member tabs, then switches back. It never edits, approves or returns an assessment.
4. **Send to Test Runner** opens the web app with the capture in the URL `#hash` (it is not sent to any server). The web app offers to fill the 4Ps Forward scores of an existing run with the same Family ID, or to create a **Record-mode run** from the captured roster and answers. **Copy JSON** + *Import from 4Ps Forward → paste* does the same by hand.

Notes: 4Ps Forward shows **re-scaled** ES/SA (raw ÷ 0.3333 and raw ÷ 0.6669). Indicators missing from a *Partial* score are imported as `N/A`; the verdict is `FAIL` when the expected result has a level for them. 4Ps Forward codes map as A, B, C, D1→D, D2→E, E1→F, E2→G, E3→H, E4→I, E5→J, E6→K, F1→L, F2→M, F3→N, G1→O … G5→S, H1→T, H2→U, H3→V, I1→W, I2→X, I3→Y.

## Rule sets

* **Target**: the Criteria for the Levels of Well-Being plus the DSWD comments in BRVD *Scoring Rules*. Examples: age 15+ for skills; `educal` also counts for the SHS diploma; hazard-prone downgrades roof and walls; worst case applies to problems and DRRM; savings counts as a DRRM item; financial institutions use a combined access count; overweight is included in nutrition; income is net of 4Ps/CCT and of under-15 income, adds imputed rent ×12, and the family size excludes moved-out and deceased members.
* **Stata**: the BRVD Stata command run exactly as written, including the overwrite order of `replace` and Stata's rule that a missing value is greater than any number. When the platform matches this rule and not the target, the verdict is `STATA RULE`. That means the DSWD-requested change has not been implemented.

## One-time setup: deploy from GitHub with clasp

1. With the DSWD Google account that owns the data sheet, turn on **Google Apps Script API**: <https://script.google.com/home/usersettings>.
2. On your computer (Node 20+), run `npx @google/clasp login` and approve in the browser with the same account. This writes `~/.clasprc.json` (on Windows: `C:\Users\<you>\.clasprc.json`).
3. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `CLASPRC_JSON` and paste the whole content of that file.
4. Go to **Actions → Test and deploy → Run workflow**, or push to `main`. The first run creates the Apps Script project. The job summary prints its `SCRIPT_ID` and the web-app URL.
5. Under **Settings → Secrets and variables → Actions → Variables**, add `SCRIPT_ID` with the printed value. Later runs then update the same project and keep the same URL.
6. Open the web-app URL once with the owner account and click **Allow** (this grants access to the sheet). Paste the URL in the sheet's `Config` tab and share it with the testers. Access is limited to dswd.gov.ph accounts, and testers do not need access to the sheet.

From then on every push to `main` runs the tests, builds, `clasp push`es and updates the deployment.

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

## Open rules to confirm with SCMD

These show up as **Needs DSWD confirmation** or `N/A CHECK`:

* how indicators with no eligible member are scored
* improved toilet shared with other families: L2 or L3
* literate member who cannot understand simple messages
* assets: count quantity or item types
* 2+ organization members, none active
* DRRM "not recovered" with 1–2 items
* internet use with no activity selected
* nutrition fields recorded as Yes/No in Odoo but as maln codes in BRVD
