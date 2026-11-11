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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/Code.js'), 'utf8'), ctx);
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
