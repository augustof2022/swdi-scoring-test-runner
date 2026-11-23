function planningRoster_(roster) {
  return roster.map(r => ({'Run ID': r['Run ID'], 'Member #': r['Member #'], Age: r.Age, 'Member status': r['Member status']}));
}

// The engine compares monthly per-capita income, so thresholds saved as annual are divided by 12.
function monthlyThresholds_(r) {
  const annual = String(r['Threshold period'] || '').toLowerCase() === 'annual';
  const m = v => v === '' || v == null || !annual || !isFinite(Number(v)) ? v : Number(v) / 12;
  return {food: m(r['Food threshold']), poverty: m(r['Poverty threshold'])};
}

// Reduce the Runs, Scores, Roster and Entries tables to the inputs needed for the next preview.
function planningRecords_(runs, scores, roster, entries, variables) {
  const allowed = new Set(variables), records = new Map(), members = new Map();
  runs.forEach(r => {
    const id = String(r['Run ID']);
    records.set(id, {id, savedAt: r['Updated at'] || r['Created at'] || '', env: r.Environment || '', thresholds: monthlyThresholds_(r), household: null, scores: []});
    members.set(id, new Map());
  });
  roster.forEach(row => {
    const id = String(row['Run ID']), r = records.get(id);
    if (!r || row.Age === '' || row.Age == null) return;
    const status = row['Member status'];
    const m = {no: Number(row['Member #']), age: Number(row.Age), status: ({Active:1, Deceased:2, 'Moved Out':3})[status] || Number(status) || 1};
    members.get(id).set(m.no, m);
  });
  entries.forEach(row => {
    const id = String(row['Run ID']), r = records.get(id), key = row.Variable;
    if (!r || !allowed.has(key) || !members.get(id).size || row.Value == null || row.Value === '') return;
    if (!r.household) r.household = {hh: {}, members: Array.from(members.get(id).values())};
    const no = Number(row['Member #']), target = no ? members.get(id).get(no) : r.household.hh;
    if (target) target[key] = row.Value;
  });
  scores.forEach(s => {
    const r = records.get(String(s['Run ID']));
    if (!r) return;
    const verdicts = {'SWDI App': s['SWDI App verdict'] || '', '4Ps Forward': s['4Ps Forward verdict'] || ''};
    if (!Object.values(verdicts).some(Boolean) && s['Final verdict']) verdicts['Recorded platform'] = s['Final verdict'];
    if (allowed.size && !r.household && !Object.values(verdicts).some(Boolean)) return;
    r.scores.push({code: s.Code, level: s['Expected level (target)'], branches: String(s['Scenarios exercised'] || '').split('|').filter(Boolean),
      verdicts});
  });
  for (const r of records.values()) if (!r.household && members.get(r.id).size) r.roster = Array.from(members.get(r.id).values());
  return Array.from(records.values());
}
