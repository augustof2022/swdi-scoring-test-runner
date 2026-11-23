'use strict';
/* Runs src/Code.js against an in-memory fake of SpreadsheetApp to check saveRun / getRun / deleteRun. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm'), fs = require('fs'), path = require('path');

function fakeSpreadsheet() {
  const sheets = {};
  function mkSheet(name) {
    const data = [];
    const sh = {
      getName: () => name,
      getLastRow: () => { for (let i = data.length - 1; i >= 0; i--) if (data[i].some(v => v !== '' && v !== undefined)) return i + 1; return 0; },
      getLastColumn: () => Math.max(0, ...data.map(r => r.length)),
      getRange(r, c, nr = 1, nc = 1) {
        const rg = {
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((data[r - 1 + i] || [])[c - 1 + j] ?? ''))),
          setValues: vals => { vals.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); }); return rg; },
          setFontWeight: () => rg, setBackground: () => rg, setFontColor: () => rg
        };
        return rg;
      },
      getDataRange: () => sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()),
      deleteRows: (r, n) => { data.splice(r - 1, n); }, deleteRow: r => { data.splice(r - 1, 1); },
      appendRow: row => { data[sh.getLastRow()] = row; }, setFrozenRows: () => {}, _data: data
    };
    return sh;
  }
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSpreadsheetTimeZone: () => 'Asia/Manila', _sheets: sheets };
  ss.insertSheet('Config').getRange(1, 1, 4, 2).setValues([['key', 'value'], ['food_threshold', 2053], ['poverty_threshold', 2647], ['tester', 'Tester 1']]);
  return ss;
}
function load() {
  const ss = fakeSpreadsheet();
  const ctx = {
    SpreadsheetApp: { openById: () => ss }, Session: { getActiveUser: () => ({ getEmail: () => 'tester@dswd.gov.ph' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: (d, tz, f) => f === 'yyyyMMdd' ? '20261110' : d.toISOString() }, HtmlService: {}, JSON, Date
  };
  vm.createContext(ctx);
  const source = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const variables = require('../engine/swdi-coverage').variables;
  vm.runInContext(source('Code.js').replace('/*PLANNING_VARIABLES*/[]', JSON.stringify(variables)) + '\n' + source('planning-records.js'), ctx);
  return { ctx, ss };
}
const payload = (id, fam, n) => ({
  run: { 'Run ID': id, 'Family ID (HHID)': fam, Mode: 'Guided', Status: 'Entering in SWDI App' },
  roster: Array.from({ length: n }, (_, i) => ({ Key: 'x|' + (i + 1), 'Member #': i + 1, Name: 'M' + (i + 1), Age: 30 })),
  entries: [{ Key: 'x|0|roof', 'Member #': 0, Variable: 'roof', Value: 1 }, { Key: 'x|1|sickind', 'Member #': 1, Variable: 'sickind', Value: 2 }],
  scores: [{ Key: 'x|A', Code: 'A', 'Expected level (target)': 2, 'Final verdict': 'PASS', 'Scenarios exercised': '|A.L1.no_skill|' }]
});

test('saveRun assigns IDs, replaces a run\'s rows on re-save and deleteRun removes them', () => {
  const { ctx, ss } = load();
  const boot = JSON.parse(ctx.getBootstrap());
  assert.equal(boot.config.food_threshold, 2053); assert.deepEqual(boot.testers, ['Tester 1']);
  const id1 = JSON.parse(ctx.saveRun(JSON.stringify(payload('', 'FAM-1', 3)), 't')).id;
  const id2 = JSON.parse(ctx.saveRun(JSON.stringify(payload('', 'FAM-2', 2)), 't')).id;
  assert.equal(id1, 'RUN-20261110-01'); assert.equal(id2, 'RUN-20261110-02');
  ctx.saveRun(JSON.stringify(payload(id1, 'FAM-1b', 4)), 't');      // re-save with a bigger roster
  const r1 = JSON.parse(ctx.getRun(id1)), r2 = JSON.parse(ctx.getRun(id2));
  assert.equal(r1.roster.length, 4); assert.equal(r2.roster.length, 2);
  assert.equal(r1.entries.length, 2); assert.equal(r1.scores[0].Key, id1 + '|A');
  const runs = JSON.parse(ctx.getBootstrap()).runs;
  assert.equal(runs.length, 2); assert.equal(runs.find(r => r['Run ID'] === id1)['Family ID (HHID)'], 'FAM-1b');
  ctx.deleteRun(id1, 't');
  const after = JSON.parse(ctx.getBootstrap());
  assert.equal(after.runs.length, 1); assert.equal(after.scores.length, 1);
  assert.equal(JSON.parse(ctx.getRun(id2)).roster.length, 2);
  assert.ok(ss._sheets.Log._data.length >= 4);
});

test('multi-user: owner kept, last saver recorded, stale saves refused, old header row extended', () => {
  const { ctx, ss } = load();
  ctx.getBootstrap();
  // Simulate a sheet created by the earlier version (fewer Runs columns).
  const oldHdr = ctx.SCHEMA.Runs.slice(0, 23);
  ss._sheets.Runs._data.length = 0; ss._sheets.Runs._data.push(oldHdr.slice());
  ctx.setupSheet();
  assert.deepEqual(ss._sheets.Runs._data[0], ctx.SCHEMA.Runs);
  let who = 'ana@dswd.gov.ph';
  ctx.Session.getActiveUser = () => ({ getEmail: () => who });
  const a = JSON.parse(ctx.saveRun(JSON.stringify(payload('', 'FAM-9', 2)), 'Ana'));
  assert.equal(a.createdBy, 'ana@dswd.gov.ph'); assert.equal(a.revision, 1);
  who = 'ben@dswd.gov.ph';
  const p2 = payload(a.id, 'FAM-9', 2); p2.baseRevision = 1;
  const b = JSON.parse(ctx.saveRun(JSON.stringify(p2), 'Ben'));
  assert.equal(b.createdBy, 'ana@dswd.gov.ph'); assert.equal(b.savedBy, 'ben@dswd.gov.ph'); assert.equal(b.revision, 2);
  who = 'ana@dswd.gov.ph';
  const stale = payload(a.id, 'FAM-9', 2); stale.baseRevision = 1;
  assert.throws(() => ctx.saveRun(JSON.stringify(stale), 'Ana'), /saved by ben@dswd.gov.ph/);
  const run = JSON.parse(ctx.getBootstrap()).runs.find(r => r['Run ID'] === a.id);
  assert.equal(run['Created by'], 'ana@dswd.gov.ph'); assert.equal(run['Last saved by'], 'ben@dswd.gov.ph');
  // No Google identity (consumer accounts): fall back to the tester name typed in the app.
  who = '';
  const c = JSON.parse(ctx.saveRun(JSON.stringify(payload('', 'FAM-10', 1)), 'Carla'));
  assert.equal(c.createdBy, 'Carla');
});

test('planning reads existing scores and actual scoring inputs without changing a saved run or returning identities and free text', () => {
  const {ctx, ss} = load();
  ctx.getBootstrap();
  const input = payload('', 'PRIVATE-HOUSEHOLD', 2);
  input.run.Environment = 'Newlogic Preprod';
  input.roster[0].Name = 'Private name';
  input.roster[1]['Member status'] = 'Moved Out';
  input.entries[1]['Suggested value'] = 1;
  input.entries.push({Key:'x|1|jobind_specify', 'Member #':1, Variable:'jobind_specify', Value:'private free text'});
  ctx.saveRun(JSON.stringify(input),'example');
  const before = JSON.stringify(ss._sheets);
  const text = ctx.getPlanningHistory(), [r] = JSON.parse(text);
  assert.equal(JSON.stringify(ss._sheets),before);
  assert.doesNotMatch(text,/PRIVATE-HOUSEHOLD|Private name|private free text|@/);
  assert.equal(r.env,'Newlogic Preprod');
  assert.equal(r.household.hh.roof,1);
  assert.equal(r.household.members[0].sickind,2);
  assert.equal(r.household.members[1].status,3);
  assert.equal(r.scores[0].verdicts['Recorded platform'],'PASS');
});

test('exportRecordPdf downloads a PDF or saves it in the Drive folder and records the link on the run', () => {
  const { ctx, ss } = load();
  ctx.getBootstrap();
  const made = [];
  const blob = name => ({ name, getAs: () => blob('pdf'), setName(n) { this.name = n; return this; }, getBytes: () => [37, 80, 68, 70] });
  ctx.Utilities.newBlob = (html, type, name) => { assert.match(html, /SWDI Scoring Test Record/); return blob(name); };
  ctx.Utilities.base64Encode = bytes => 'b64:' + bytes.length;
  const id = JSON.parse(ctx.saveRun(JSON.stringify(payload('', 'FAM-7', 1)), 't')).id;
  const html = '<h1>SWDI Scoring Test Record</h1>';
  const dl = JSON.parse(ctx.exportRecordPdf(html, 'SWDI test record ' + id + ' - HH FAM-7 - 2026-11-23 14:05', id, 'download', 't'));
  assert.equal(dl.name, 'SWDI test record ' + id + ' - HH FAM-7 - 2026-11-23 14 05.pdf');   // ':' is not allowed in file names
  assert.equal(dl.base64, 'b64:4');
  // No folder configured (placeholder not replaced in this test) → clear message.
  assert.throws(() => ctx.exportRecordPdf(html, 'x', id, 'drive', 't'), /drive_folder_id/);
  // The Config tab may hold the folder link; the ID is taken from it.
  const cfg = ss._sheets.Config; cfg.appendRow(['drive_folder_id', 'https://drive.google.com/drive/folders/14egoC7xgpQc5jG9ZBPXlEgonVbxSUIaf?usp=drive_link']);
  ctx.DriveApp = { getFolderById: fid => {
    assert.equal(fid, '14egoC7xgpQc5jG9ZBPXlEgonVbxSUIaf');
    return { getName: () => 'Records', getUrl: () => 'https://drive.google.com/drive/folders/' + fid,
      createFile: b => { made.push(b.name); return { getUrl: () => 'https://drive.google.com/file/d/F1/view', getId: () => 'F1' }; } };
  } };
  const up = JSON.parse(ctx.exportRecordPdf(html, 'SWDI test record ' + id, id, 'drive', 't'));
  assert.equal(up.url, 'https://drive.google.com/file/d/F1/view');
  assert.deepEqual(made, ['SWDI test record ' + id + '.pdf']);
  const run = JSON.parse(ctx.getBootstrap()).runs.find(r => r['Run ID'] === id);
  assert.equal(run['Exported record link'], up.url);
  // A folder the deploying account cannot open → tells the tester what to share.
  ctx.DriveApp = { getFolderById: () => { throw new Error('No item with the given ID'); } };
  ctx.Session.getEffectiveUser = () => ({ getEmail: () => 'owner@dswd.gov.ph' });
  assert.throws(() => ctx.exportRecordPdf(html, 'x', id, 'drive', 't'), /Share the folder as Editor .*owner@dswd\.gov\.ph/);
});

test('planning grades saved runs with monthly thresholds: annual values are divided by 12', () => {
  const { ctx } = load();
  const runs = [
    { 'Run ID': 'RUN-A', 'Food threshold': 24636, 'Poverty threshold': 31764, 'Threshold period': 'Annual' },
    { 'Run ID': 'RUN-M', 'Food threshold': 2053, 'Poverty threshold': 2647, 'Threshold period': 'Monthly' },
    { 'Run ID': 'RUN-OLD', 'Food threshold': 2053, 'Poverty threshold': 2647 },
    { 'Run ID': 'RUN-NONE', 'Food threshold': '', 'Poverty threshold': '', 'Threshold period': 'Annual' }
  ];
  const th = JSON.parse(JSON.stringify(Object.fromEntries(ctx.planningRecords_(runs, [], [], [], []).map(r => [r.id, r.thresholds]))));
  assert.deepEqual(th['RUN-A'], { food: 2053, poverty: 2647 });
  assert.deepEqual(th['RUN-M'], { food: 2053, poverty: 2647 });
  assert.deepEqual(th['RUN-OLD'], { food: 2053, poverty: 2647 });
  assert.deepEqual(th['RUN-NONE'], { food: '', poverty: '' });
});
