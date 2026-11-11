/* 4Ps Forward (OpenSPP) Assessment Review helpers, shared by the web app and the SWDI Test Capture extension.
   - CODE_MAP: 4Ps Forward indicator codes (D1, E4, …) → engine letters (A–Y).
   - parseScoreText: reads a copied SWDI Score card ("A Employable Skills Economic Sufficiency 2.00/ 3 …").
   - observedFromCapture: capture package → observed values for the Verify tab.
   - captureToRun: capture package → roster + household/member values for a Record-mode run.
   - encode/decode: capture package ⇄ URL-safe text (the extension opens the web app with it in the #hash). */
(function (root) {
  'use strict';
  var CODE_MAP = { A: 'A', B: 'B', C: 'C', D1: 'D', D2: 'E', E1: 'F', E2: 'G', E3: 'H', E4: 'I', E5: 'J', E6: 'K', F1: 'L', F2: 'M', F3: 'N',
    G1: 'O', G2: 'P', G3: 'Q', G4: 'R', G5: 'S', H1: 'T', H2: 'U', H3: 'V', I1: 'W', I2: 'X', I3: 'Y' };
  var LETTER_TO_FPF = {}; Object.keys(CODE_MAP).forEach(function (k) { LETTER_TO_FPF[CODE_MAP[k]] = k; });
  var DIMS = 'Economic Sufficiency|Health|Education|Living Situation|Role Performance|Family Risks';

  function n(x) { var v = parseFloat(String(x).replace(/,/g, '')); return isNaN(v) ? null : v; }

  /** Text copied from the SWDI Score card (or the whole Assessment Review page). */
  function parseScoreText(txt) {
    var t = String(txt || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
    var out = { indicators: {}, total: null, lowb: null, es_rescaled: null, sa_rescaled: null, partial: null };
    var re = new RegExp('(?:^|[\\s|])([A-I][1-6]?)\\s+([A-Za-z][^\\n|]*?)\\s*(?:\\t|\\s|\\|)*(' + DIMS + ')\\s*(?:\\t|\\s|\\|)*(\\d+(?:\\.\\d+)?)\\s*/\\s*3', 'g'), m;
    while ((m = re.exec(t))) { if (CODE_MAP[m[1]]) out.indicators[CODE_MAP[m[1]]] = n(m[4]); }
    var es = t.match(/ES:\s*(\d+(?:\.\d+)?)\s*\|?\s*SA:\s*(\d+(?:\.\d+)?)/i); if (es) { out.es_rescaled = n(es[1]); out.sa_rescaled = n(es[2]); }
    var p = t.match(/Partial\s*[—–-]\s*(\d+)\s*of\s*(\d+)/i); if (p) out.partial = { n: Number(p[1]), of: Number(p[2]) };
    var lv = t.match(/Level\s*([1-3])\b/); if (lv) out.lowb = Number(lv[1]);
    var tot = t.match(/SWDI Score\s*(\d+(?:\.\d+)?)/i); if (tot) out.total = n(tot[1]);
    return out;
  }

  /** Capture package → { values: {A..Y, TOTAL, LOWB, ES, SA}, missing: [letters not computed], partial } */
  function observedFromCapture(cap) {
    var sc = (cap && cap.score) || {}, vals = {}, missing = [];
    var ind = sc.indicators || {};
    Object.keys(CODE_MAP).forEach(function (k) {
      var L = CODE_MAP[k], v = ind[L];
      if (v === undefined || v === null || v === '') { if (Object.keys(ind).length) missing.push(L); } else vals[L] = v;
    });
    // A partial score leaves the missing indicators out of the table: record them as N/A (not computed).
    missing.forEach(function (L) { vals[L] = 'N/A'; });
    if (sc.total !== null && sc.total !== undefined) vals.TOTAL = sc.total;
    if (sc.lowb !== null && sc.lowb !== undefined) vals.LOWB = sc.lowb;
    if (sc.es_rescaled !== null && sc.es_rescaled !== undefined) vals.ES = sc.es_rescaled;   // re-scaled (raw / 0.3333)
    if (sc.sa_rescaled !== null && sc.sa_rescaled !== undefined) vals.SA = sc.sa_rescaled;   // re-scaled (raw / 0.6669)
    return { values: vals, missing: missing, partial: sc.partial || null };
  }

  function norm(s) { return String(s || '').toLowerCase().replace(/specify:?\s*_*/g, '').replace(/[^a-z0-9]+/g, ''); }
  function byLabel(list, label) {
    var want = norm(label); if (!want || !list) return null;
    var keys = Object.keys(list), hit = keys.filter(function (k) { return norm(list[k]) === want; })[0];
    if (hit === undefined) hit = keys.filter(function (k) { var a = norm(list[k]); return a.length > 3 && (a.indexOf(want) === 0 || want.indexOf(a) === 0); })[0];
    return hit === undefined ? null : Number(hit);
  }
  /** One displayed answer → the code the engine expects. Returns {ok, value} or {ok:false, reason}. */
  function mapValue(f, raw, LISTS) {
    var s = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!s || /^(—|-|n\/?a|none selected)$/i.test(s)) return { ok: true, value: '' };
    var yes = /^(yes|true|oo|ticked|checked)$/i.test(s), no = /^(no|false|hindi|not ticked|unchecked)$/i.test(s);
    if (f.t === 'num') { var v = n(s.replace(/[₱P]\s?/g, '')); return v === null ? { ok: false, reason: 'not a number' } : { ok: true, value: v }; }
    if (f.t === 'chk') { if (yes || s === '1') return { ok: true, value: 1 }; if (no || s === '0' || s === '2') return { ok: true, value: 2 }; var q = n(s); return q === null ? { ok: false, reason: 'expected Yes/No' } : { ok: true, value: q > 0 ? 1 : 2 }; }
    var list = f.t === 'yn' ? LISTS.yn : LISTS[f.list];
    function one(x) {
      x = String(x).trim();
      if (f.t === 'yn') { if (/^(yes|true|1)$/i.test(x)) return 1; if (/^(no|false|2|0)$/i.test(x)) return 2; }
      if (/^-?\d+$/.test(x)) return Number(x);
      var cm = x.match(/^(-?\d+)\s*[-–:.)]\s*\S/); if (cm) return Number(cm[1]);
      return byLabel(list, x);
    }
    if (f.t === 'multi') {
      var parts = s.split(/\s*[;,\n]\s*/).filter(Boolean), codes = parts.map(one);
      if (codes.some(function (c) { return c === null; })) {
        var whole = one(s); if (whole !== null) return { ok: true, value: String(whole) };   // a single label that contains a comma
        return { ok: false, reason: 'option not in the code list' };
      }
      return { ok: true, value: codes.sort(function (a, b) { return a - b; }).join(';') };
    }
    var c = one(s); return c === null ? { ok: false, reason: 'option not in the code list' } : { ok: true, value: c };
  }

  /** Capture package → {fam, date, roster[], values{hh,m}, unmapped[], counts} for a Record-mode run. */
  function captureToRun(cap, FIELDS, LISTS) {
    var byVar = {}; FIELDS.forEach(function (f) { byVar[f.s + ':' + f.v] = f; });
    // Moved-out / deceased members stay on the roster with their status (Stata income counts all captured members).
    var STATUS = { 'deceased': 2, 'moved-out': 3 };
    var members = (cap.members || []).filter(function (m) { return m.status !== 'unlocated'; });
    var roster = members.map(function (m, i) {
      var ans = function (code) { var a = (cap.answers || []).filter(function (x) { return x.scope === 'member' && x.memberIndex === m.memberIndex && x.code === code; })[0]; return a ? a.value : ''; };
      var sex = mapValue({ t: 'sel', list: 'sex' }, ans('sex'), LISTS), reln = mapValue({ t: 'sel', list: 'reln' }, ans('reln'), LISTS);
      return { no: i + 1, src: m.memberIndex, name: m.name || ('Member ' + (i + 1)), age: m.age === null || m.age === undefined ? '' : m.age,
        sex: sex.ok && sex.value !== '' ? sex.value : 1, reln: reln.ok && reln.value !== '' ? reln.value : (i === 0 ? 1 : 23), status: STATUS[m.status] || 1 };
    });
    var srcToNo = {}; roster.forEach(function (r) { srcToNo[r.src] = r.no; });
    var values = { hh: {}, m: {} }, unmapped = [], used = 0, skipped = 0;
    roster.forEach(function (r) { values.m[r.no] = {}; });
    (cap.answers || []).forEach(function (a) {
      var scope = a.scope === 'member' ? 'm' : 'hh', f = byVar[scope + ':' + a.code];
      if (!f || f.v === 'status') { skipped++; return; }
      if (scope === 'm' && !srcToNo[a.memberIndex]) { skipped++; return; }
      var r = mapValue(f, a.value, LISTS);
      if (!r.ok) { unmapped.push({ scope: scope, member: scope === 'm' ? srcToNo[a.memberIndex] : 0, code: a.code, value: a.value, reason: r.reason }); return; }
      if (r.value === '') return;
      (scope === 'hh' ? values.hh : values.m[srcToNo[a.memberIndex]])[f.v] = r.value; used++;
    });
    return { fam: cap.hhid || '', date: String(cap.interviewDate || '').slice(0, 10), env: cap.env || '', url: cap.url || '', roster: roster, values: values, unmapped: unmapped, counts: { used: used, skipped: skipped } };
  }

  function encode(obj) {
    var json = JSON.stringify(obj), b64;
    if (typeof Buffer !== 'undefined' && typeof btoa === 'undefined') b64 = Buffer.from(json, 'utf8').toString('base64');
    else b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    var b64 = String(str || '').replace(/^#?(cap=)?/, '').replace(/-/g, '+').replace(/_/g, '/'); while (b64.length % 4) b64 += '=';
    var json = typeof Buffer !== 'undefined' && typeof atob === 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b64)));
    var o = JSON.parse(json); if (!o || o.kind !== 'swdi-4psf-capture') throw new Error('Not a 4Ps Forward capture'); return o;
  }

  var api = { CODE_MAP: CODE_MAP, LETTER_TO_FPF: LETTER_TO_FPF, parseScoreText: parseScoreText, observedFromCapture: observedFromCapture, mapValue: mapValue, captureToRun: captureToRun, encode: encode, decode: decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SWDIFPF = api;
})(typeof self !== 'undefined' ? self : this);
