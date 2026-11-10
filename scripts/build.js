/* Builds dist/ (pushed by clasp) and preview/index.html (stand-alone demo). */
'use strict';
const fs = require('fs'), path = require('path');
const R = p => path.join(__dirname, '..', p);
const cfg = JSON.parse(fs.readFileSync(R('config.json'), 'utf8'));
const sheetId = process.env.SHEET_ID || cfg.sheetId;
const read = p => fs.readFileSync(R(p), 'utf8');
const tpl = read('src/index.html');
const inline = t => t.replace('/*ENGINE*/', () => read('engine/swdi-engine.js')).replace('/*PLANNER*/', () => read('engine/swdi-planner.js'))
  .replace('/*FIELDS*/', () => read('engine/swdi-fields.js')).replace('/*SCENARIOS*/', () => read('engine/swdi-scenarios.js'));
fs.mkdirSync(R('dist'), { recursive: true });
fs.writeFileSync(R('dist/Index.html'), inline(tpl).replace('/*DEMO*/null', 'null'));
fs.writeFileSync(R('dist/Code.js'), read('src/Code.js').replace('__SHEET_ID__', sheetId));
fs.copyFileSync(R('src/appsscript.json'), R('dist/appsscript.json'));
const demo = { live: false, user: '', testers: ['Tester 1', 'Tester 2'], runs: [], scores: [],
  config: { food_threshold: 2053, poverty_threshold: 2647, level_tolerance: 0.01, weighted_tolerance: 0.0006 } };
fs.mkdirSync(R('preview'), { recursive: true });
fs.writeFileSync(R('preview/index.html'), inline(tpl).replace('/*DEMO*/null', () => JSON.stringify(demo)));
console.log('built dist/ (sheet ' + sheetId + ') and preview/index.html');
