/**
 * SWDI Scoring Test Runner — Apps Script back end (standalone web app, deployed with clasp).
 * Data lives in the Google Sheet below; testers only use the web app.
 */
var SHEET_ID = '__SHEET_ID__';   // replaced at build time from config.json

var SCHEMA = {
  Runs: ['Run ID', 'Family ID (HHID)', 'Mode', 'Tester', 'Interview date', 'Food threshold', 'Poverty threshold', 'Status', 'Members', 'Expected total (target)', 'Expected LOWB',
    'Stata total', 'Stata LOWB', 'Rule conflicts', 'N/A indicators', 'SWDI App total', '4Ps Forward total', 'Checks passed', 'Checks not passed',
    'Scenarios exercised', 'Notes', 'Created at', 'Updated at'],
  Roster: ['Key', 'Run ID', 'Member #', 'Name', 'Age', 'Sex', 'Relationship', 'Member status'],
  Entries: ['Key', 'Run ID', 'Member #', 'Member', 'Section', 'Variable', 'Question', 'Value', 'Meaning', 'Suggested value', 'Target scenarios', 'Changed from suggestion'],
  Scores: ['Key', 'Run ID', 'Code', 'Indicator', 'Weight', 'Expected level (target)', 'Expected weighted', 'Stata level', 'Rule conflict',
    'How graded (target)', 'Member breakdown', 'Stata as written', 'SWDI App observed (level)', 'SWDI App verdict', '4Ps Forward observed (level)',
    '4Ps Forward verdict', 'Final verdict', 'Scenarios exercised', 'Notes', 'Updated at'],
  Log: ['Timestamp', 'Tester', 'Run ID', 'Action', 'Details']
};

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SWDI Scoring Test Runner')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Creates any missing tab or header row. Safe to run repeatedly (run it once from the editor or let getBootstrap call it). */
function setupSheet() {
  var ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
}

function sheet_(name) { var sh = ss_().getSheetByName(name); if (!sh) { setupSheet(); sh = ss_().getSheetByName(name); } return sh; }

function table_(name) {
  var sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues(), h = v.shift(), tz = ss_().getSpreadsheetTimeZone();
  return v.filter(function (r) { return r[0] !== '' && r[0] !== null; }).map(function (r) {
    var o = {};
    h.forEach(function (k, i) { o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], tz, 'yyyy-MM-dd HH:mm') : r[i]; });
    return o;
  });
}

function config_() {
  var cfg = {}, testers = [];
  var sh = ss_().getSheetByName('Config');
  if (sh) sh.getDataRange().getValues().forEach(function (r) {
    if (r[0] === 'tester') { if (r[1]) testers.push(String(r[1])); }
    else if (r[0]) cfg[r[0]] = r[1];
  });
  return { config: cfg, testers: testers };
}

function getBootstrap() {
  setupSheet();
  var c = config_(), user = '';
  try { user = Session.getActiveUser().getEmail(); } catch (e) {}
  return JSON.stringify({ live: true, user: user, config: c.config, testers: c.testers, runs: table_('Runs'), scores: table_('Scores') });
}

function getRun(runId) {
  var f = function (r) { return r['Run ID'] === runId; };
  return JSON.stringify({ roster: table_('Roster').filter(f), entries: table_('Entries').filter(f), scores: table_('Scores').filter(f) });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function nextRunId_() {
  var tz = ss_().getSpreadsheetTimeZone(), d = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  var ids = table_('Runs').map(function (r) { return String(r['Run ID']); }).filter(function (x) { return x.indexOf('RUN-' + d) === 0; });
  var n = ids.length + 1, id;
  do { id = 'RUN-' + d + '-' + ('0' + n).slice(-2); n++; } while (ids.indexOf(id) >= 0);
  return id;
}

function replaceRows_(name, runId, rows) {
  var sh = sheet_(name), hdr = SCHEMA[name], last = sh.getLastRow();
  if (last >= 2) {
    var ids = sh.getRange(2, 2, last - 1, 1).getValues().map(function (r) { return r[0]; });
    for (var i = ids.length - 1; i >= 0; i--) {
      if (ids[i] !== runId) continue;
      var end = i; while (i - 1 >= 0 && ids[i - 1] === runId) i--;
      sh.deleteRows(i + 2, end - i + 1);
    }
  }
  if (!rows.length) return;
  var values = rows.map(function (o) { return hdr.map(function (k) { var v = o[k]; return v === undefined || v === null ? '' : v; }); });
  sh.getRange(sh.getLastRow() + 1, 1, values.length, hdr.length).setValues(values);
}

/** payload: {run:{...Runs headers}, roster:[...], entries:[...], scores:[...]}; returns the run ID. */
function saveRun(payloadJson, tester) {
  var p = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
  return withLock_(function () {
    var run = p.run, isNew = !run['Run ID'];
    if (isNew) run['Run ID'] = nextRunId_();
    var id = run['Run ID'], now = new Date();
    var stamp = function (rows) { return rows.map(function (r) { r['Run ID'] = id; r.Key = id + '|' + r.Key.split('|').slice(1).join('|'); return r; }); };
    var sh = sheet_('Runs'), hdr = SCHEMA.Runs, last = sh.getLastRow(), rowIdx = -1;
    if (last >= 2) rowIdx = sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return r[0]; }).indexOf(id);
    run['Updated at'] = now; if (rowIdx < 0) run['Created at'] = now;
    if (rowIdx >= 0) { var old = sh.getRange(rowIdx + 2, 1, 1, hdr.length).getValues()[0]; run['Created at'] = old[hdr.indexOf('Created at')] || now; }
    var vals = [hdr.map(function (k) { var v = run[k]; return v === undefined || v === null ? '' : v; })];
    if (rowIdx >= 0) sh.getRange(rowIdx + 2, 1, 1, hdr.length).setValues(vals);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, hdr.length).setValues(vals);
    replaceRows_('Roster', id, stamp(p.roster || []));
    replaceRows_('Entries', id, stamp(p.entries || []));
    replaceRows_('Scores', id, stamp((p.scores || []).map(function (s) { s['Updated at'] = now; return s; })));
    log_(tester, id, isNew ? 'Created run' : 'Saved run', (p.entries || []).length + ' entries, ' + (p.scores || []).length + ' score rows');
    return id;
  });
}

function deleteRun(runId, tester) {
  return withLock_(function () {
    ['Roster', 'Entries', 'Scores'].forEach(function (n) { replaceRows_(n, runId, []); });
    var sh = sheet_('Runs'), last = sh.getLastRow();
    if (last >= 2) { var i = sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return r[0]; }).indexOf(runId); if (i >= 0) sh.deleteRow(i + 2); }
    log_(tester, runId, 'Deleted run', '');
    return true;
  });
}

function log_(tester, runId, action, details) {
  try { sheet_('Log').appendRow([new Date(), tester || '', runId || '', action, details || '']); } catch (e) {}
}
