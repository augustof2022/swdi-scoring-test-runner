/* Builds dist/ (pushed by clasp) and preview/index.html (stand-alone demo). */
'use strict';
const fs = require('fs'), path = require('path');
const { createHash } = require('crypto');
const R = p => path.join(__dirname, '..', p);
const cfg = JSON.parse(fs.readFileSync(R('config.json'), 'utf8'));
const sheetId = process.env.SHEET_ID || cfg.sheetId;
const read = p => fs.readFileSync(R(p), 'utf8');
const tpl = read('src/index.html');
const records = read('src/planning-records.js');
const planningVariables = require('../engine/swdi-coverage').variables;
const inline = t => t.replace('/*ENGINE*/', () => read('engine/swdi-engine.js')).replace('/*PLANNER*/', () => read('engine/swdi-planner.js'))
  .replace('/*COVERAGE*/', () => read('engine/swdi-coverage.js')).replace('/*PLANNING_RECORDS*/', () => records)
  .replace('/*FIELDS*/', () => read('engine/swdi-fields.js')).replace('/*SCENARIOS*/', () => read('engine/swdi-scenarios.js')).replace('/*FPF*/', () => read('engine/swdi-fpf.js'));
const page = inline(tpl);
const server = read('src/Code.js').replace('__SHEET_ID__', sheetId).replace('__DRIVE_FOLDER_ID__', process.env.DRIVE_FOLDER_ID || cfg.driveFolderId || '').replace('/*PLANNING_VARIABLES*/[]', JSON.stringify(planningVariables)) + '\n' + records;
const manifest = read('src/appsscript.json');
const digest = createHash('sha256').update(JSON.stringify([page, server, manifest])).digest('hex').slice(0, 8);
const release = 'v' + require('../package.json').version + ' · ' + digest;
const versionedPage = page.replace('__APP_RELEASE__', release);
fs.mkdirSync(R('dist'), { recursive: true });
fs.writeFileSync(R('dist/Index.html'), versionedPage.replace('/*DEMO*/null', 'null'));
fs.writeFileSync(R('dist/Code.js'), server);
fs.writeFileSync(R('dist/appsscript.json'), manifest);
const demo = { live: false, user: '', testers: ['Tester 1', 'Tester 2'], runs: [], scores: [],
  config: { food_threshold: 2053, poverty_threshold: 2647, level_tolerance: 0.01, weighted_tolerance: 0.0006 } };
fs.mkdirSync(R('preview'), { recursive: true });
fs.writeFileSync(R('preview/index.html'), versionedPage.replace('/*DEMO*/null', () => JSON.stringify(demo)));
// The capture extension ships the same 4Ps Forward helpers as the web app (kept in git so the folder loads unpacked).
fs.mkdirSync(R('extension/lib'), { recursive: true });
fs.copyFileSync(R('engine/swdi-fpf.js'), R('extension/lib/swdi-fpf.js'));
console.log('Built ' + release + ' in dist/ and preview/index.html');
