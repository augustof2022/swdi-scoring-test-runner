/* Pushes dist/ to Apps Script with clasp and creates/updates one stable web-app deployment.
 * Needs ~/.clasprc.json (clasp login). SCRIPT_ID env var (or .clasp.json) selects the Apps Script project;
 * without it a new standalone project is created on the first run and its ID is printed. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const DESC = 'SWDI Test Runner';
const clasp = (...args) => execFileSync('npx', ['--no-install', 'clasp', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const json = s => { const i = Math.min(...['[', '{'].map(c => (s.indexOf(c) < 0 ? Infinity : s.indexOf(c)))); return JSON.parse(s.slice(i)); };
const build = () => execFileSync('node', ['scripts/build.js'], { cwd: root, stdio: 'inherit' });

build();
const claspFile = path.join(root, '.clasp.json');
let scriptId = process.env.SCRIPT_ID || (fs.existsSync(claspFile) ? JSON.parse(fs.readFileSync(claspFile, 'utf8')).scriptId : '');
if (!scriptId) {
  console.log('No SCRIPT_ID — creating a new standalone Apps Script project…');
  clasp('create-script', '--type', 'standalone', '--title', cfg.title, '--rootDir', 'dist');
  scriptId = JSON.parse(fs.readFileSync(claspFile, 'utf8')).scriptId;
  build();   // clasp create writes a default manifest into dist/; restore ours
  console.log(`::notice title=Apps Script project created::SCRIPT_ID=${scriptId} — save it as the repository variable SCRIPT_ID so later deploys update this project.`);
} else {
  fs.writeFileSync(claspFile, JSON.stringify({ scriptId, rootDir: 'dist' }));
}
console.log(clasp('push', '-f'));
const sha = (process.env.GITHUB_SHA || 'local').slice(0, 7);
let deployments = [];
try { deployments = json(clasp('--json', 'list-deployments')); } catch (e) { console.log('Could not list deployments:', e.message); }
const mine = deployments.find(d => (d.description || '').indexOf(DESC) === 0);
let id;
if (mine) { clasp('update-deployment', mine.deploymentId, '-d', `${DESC} ${sha}`); id = mine.deploymentId; }
else { id = json(clasp('--json', 'create-deployment', '-d', `${DESC} ${sha}`)).deploymentId; }
const url = `https://script.google.com/macros/s/${id}/exec`;
console.log(`::notice title=Web app deployed::${url}`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### SWDI Scoring Test Runner deployed\n\n- Web app: ${url}\n- Apps Script project: ${scriptId}\n- Data sheet: https://docs.google.com/spreadsheets/d/${cfg.sheetId}/edit\n`);
