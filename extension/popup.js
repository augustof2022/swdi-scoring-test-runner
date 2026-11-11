'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HOSTS = [/^https:\/\/4ps-dp-preprod\.dswd\.gov\.ph\//, /^https:\/\/4ps-dp-preprod-loadtest\.dswd\.gov\.ph\//];
let tab = null, current = null;

function note(html, cls) { const w = $('where'); w.className = 'note' + (cls ? ' ' + cls : ''); w.innerHTML = html; }

function render(cap) {
  current = cap;
  const r = $('result');
  if (!cap) { r.hidden = true; return; }
  const sc = cap.score || {}, ind = sc.indicators || {};
  const rows = Object.keys(SWDIFPF.CODE_MAP).map(code => {
    const L = SWDIFPF.CODE_MAP[code], row = (sc.rows || []).find(x => x.code === code);
    const v = ind[L];
    return `<tr><td>${code}</td><td>${esc(row ? row.name : '')}</td><td style="text-align:right">${v === undefined || v === null ? '<span class="pill warn">not computed</span>' : v.toFixed(2)}</td></tr>`;
  }).join('');
  const members = (cap.members || []).map(m => `${esc(m.name)} (${m.age ?? '?'})${m.excluded ? ' — ' + esc(m.status) : ''}`).join('<br>');
  const scan = cap.scan;
  r.hidden = false;
  r.innerHTML = `<div class="kv"><b>Household ID</b><span>${esc(cap.hhid)}</span><b>Environment</b><span>${esc(cap.env)}</span>
      <b>Period</b><span>${esc(cap.period)}</span><b>Status</b><span>${esc(cap.status)}</span></div>
    <div style="margin-top:8px"><span class="big">${sc.total ?? '—'}</span> <span class="pill">Level ${sc.lowb ?? '?'}</span>
      ${sc.partial ? `<span class="pill warn">Partial — ${sc.partial.n} of ${sc.partial.of}</span>` : ''}
      <div class="small">ES ${sc.es_rescaled ?? '—'} · SA ${sc.sa_rescaled ?? '—'} (re-scaled, as shown)</div></div>
    <details><summary>${Object.keys(ind).length} of 25 indicators</summary><table>${rows}</table></details>
    <details><summary>${(cap.members || []).length} members · ${(cap.answers || []).length} answers</summary><div class="small">${members || 'No member tabs found.'}</div></details>
    ${scan && (scan.unopenedSections.length || scan.incompleteMembers.length) ? `<div class="note warn" style="margin:8px 0 0">Some parts could not be read (${scan.unopenedSections.length} closed sections, members ${scan.incompleteMembers.join(', ') || '—'}). Capture again after the page finishes loading.</div>` : ''}
    <div class="small" style="margin-top:6px">Captured ${new Date(cap.capturedAt).toLocaleString()}</div>
    <div class="row"><button id="send" class="pri" style="margin:0;width:auto">Send to Test Runner</button><button id="copy">Copy JSON</button></div>`;
  $('send').onclick = send;
  $('copy').onclick = async () => { await navigator.clipboard.writeText(JSON.stringify(cap)); $('status').textContent = 'Copied. In the Test Runner use “Import from 4Ps Forward” and paste.'; };
}

async function send() {
  const url = $('url').value.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { $('settings').open = true; $('url').focus(); $('status').textContent = 'Paste the Test Runner web app URL in Settings first.'; return; }
  // The capture travels in the #hash: it stays in this browser and is not sent to any server by the URL itself.
  await chrome.tabs.create({ url: url.replace(/#.*$/, '') + '#cap=' + SWDIFPF.encode(current) });
}

async function init() {
  const st = await chrome.storage.sync.get('runnerUrl');
  $('url').value = st.runnerUrl || '';
  $('url').onchange = () => chrome.storage.sync.set({ runnerUrl: $('url').value.trim() });
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ok = tab && HOSTS.some(h => h.test(tab.url || ''));
  if (ok) note(`Ready: ${/loadtest/.test(tab.url) ? 'Preprod load test' : 'Preprod'}. Open the household's <b>Assessment Review</b>, then capture.`);
  else { note('Open an SWDI <b>Assessment Review</b> in 4Ps Forward (preprod or preprod load test) in this tab.', 'warn'); $('go').disabled = true; }
  const s = await chrome.storage.session.get(['last', 'busy', 'error']);
  if (s.busy) { $('go').disabled = true; $('status').textContent = 'Capturing…'; }
  if (s.error) $('status').textContent = s.error;
  render(s.last || null);
  chrome.storage.session.onChanged.addListener(ch => {
    if (ch.last) render(ch.last.newValue);
    if (ch.busy && !ch.busy.newValue) $('go').disabled = !ok;
  });
  $('go').onclick = async () => {
    $('go').disabled = true; $('status').textContent = 'Capturing… keep this tab open.';
    const res = await chrome.runtime.sendMessage({ type: 'capture', tabId: tab.id, url: tab.url, answers: $('answers').checked });
    $('go').disabled = false;
    $('status').textContent = res.ok ? 'Captured. Check the values, then send.' : res.error;
    if (res.ok) render(res.capture);
  };
}
init();
