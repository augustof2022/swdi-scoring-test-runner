/* SWDI Scoring Test Capture — injected into the active 4Ps Forward Assessment Review tab.
   READ-ONLY: it may open accordion sections and switch member tabs to read them (then switches back);
   it never edits a field, never clicks Approve / Return for Correction, and never calls a server.
   scanPage() is adapted from the SWDI CMS Assistant reviewer extension (page-actions.js). */
(function () {
'use strict';
if (self.SWDICapture) return;

function currentColumn() {
  const h = [...document.querySelectorAll('.o_swdi_review h5')].find(x => /^\s*Current\b/i.test(x.textContent || ''));
  return h?.closest('.col-md-6') || document.querySelector('.o_swdi_review') || document;
}
const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const num = s => { const v = parseFloat(String(s ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const CODE_MAP = { A: 'A', B: 'B', C: 'C', D1: 'D', D2: 'E', E1: 'F', E2: 'G', E3: 'H', E4: 'I', E5: 'J', E6: 'K', F1: 'L', F2: 'M', F3: 'N',
  G1: 'O', G2: 'P', G3: 'Q', G4: 'R', G5: 'S', H1: 'T', H2: 'U', H3: 'V', I1: 'W', I2: 'X', I3: 'Y' };

function readHeader(root) {
  const card = root.querySelector('h6.card-title')?.closest('.card');
  const info = {};
  for (const div of card?.querySelectorAll('.row > div') || []) {
    const t = txt(div), i = t.indexOf(':');
    if (i > 0) info[t.slice(0, i).trim().toLowerCase()] = t.slice(i + 1).trim();
  }
  return { hhid: txt(root.querySelector('h6.card-title')), period: txt(root.querySelector('h5')).replace(/^Current:\s*/i, ''),
    cml: info['c/ml'] || '', date: info.date || '', origin: info.origin || '', status: info.status || '' };
}

function readScoreCard(root) {
  const card = [...root.querySelectorAll('.card')].find(c => /^SWDI Score$/i.test(txt(c.querySelector(':scope > .card-header'))));
  if (!card) return null;
  const badges = [...card.querySelectorAll('.badge')].map(b => ({ t: txt(b), title: b.getAttribute('title') || '' }));
  const lv = badges.map(b => b.t.match(/Level\s*([1-3])/i)).find(Boolean);
  const pb = badges.find(b => /Partial/i.test(b.t));
  const pm = pb && pb.t.match(/(\d+)\s*of\s*(\d+)/);
  const esm = txt(card).match(/ES:\s*([\d.]+)\s*\|\s*SA:\s*([\d.]+)/i);
  const rows = [], indicators = {};
  for (const tr of card.querySelectorAll('tbody tr')) {
    const td = tr.querySelectorAll('td'); if (td.length < 3) continue;
    const code = txt(td[0].querySelector('span')), name = txt(td[0]).replace(code, '').trim();
    const sm = txt(td[2]).match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
    const letter = CODE_MAP[code] || null, level = sm ? num(sm[1]) : null;
    rows.push({ code, letter, name, dimension: txt(td[1]), level, max: sm ? Number(sm[2]) : null });
    if (letter) indicators[letter] = level;
  }
  return { total: num(txt(card.querySelector('.fs-4'))), lowb: lv ? Number(lv[1]) : null,
    partial: pm ? { n: Number(pm[1]), of: Number(pm[2]), note: pb.title } : null,
    es_rescaled: esm ? num(esm[1]) : null, sa_rescaled: esm ? num(esm[2]) : null, indicators, rows };
}

function readTabs(root) {
  return [...root.querySelectorAll('.swdi-member-tabs button.nav-link')].map((b, i) => {
    const spans = [...b.querySelectorAll(':scope > span')];
    const name = txt(spans.find(s => !s.classList.contains('badge'))) || `Member ${i + 1}`;
    const ageBadge = spans.map(s => txt(s).match(/^(\d{1,3})\s*y$/i)).find(Boolean);
    return { memberIndex: i + 1, name, tabAge: ageBadge ? Number(ageBadge[1]) : null,
      badges: spans.filter(s => s.classList.contains('badge')).map(txt) };
  });
}

async function scanPage(options = {}) {
  // Only the Current assessment column; the Previous column can hold an older assessment with the same layout.
  const ROOT = currentColumn();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (predicate, timeoutMs = 2600) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await pause(90);
    }
    return predicate() || null;
  };
  const isCollapsed = button => Boolean(button?.querySelector('.fa-caret-right')) ||
    button?.getAttribute('aria-expanded') === 'false';
  if ([...document.querySelectorAll('.modal-content')].some(el =>
    /Return for Correction/i.test(el.querySelector('.modal-title')?.textContent || ''))) {
    return { ok:false, error:'Close the Return for Correction dialog before scanning.' };
  }

  // A normal OpenSPP Odoo form is not necessarily the Two Panel Assessment
  // Review. Do not silently treat unrelated tables as SWDI questionnaire data.
  const hasReviewStructure=Boolean(ROOT.querySelector('.swdi-member-tabs') ||
    ROOT.querySelector('.swdi-accordion-section'));
  if(!hasReviewStructure){
    return {ok:false,error:'You are not in Two Panel Assessment Review. Open the SWDI assessment in Two Panel Assessment Review (where household and member questions appear), then click Scan assessment.'};
  }
  const memberTabs = ROOT.querySelector('.swdi-member-tabs');
  const memberBody = memberTabs?.closest('.card-body') || null;
  const currentTabButtons = () => [...(ROOT.querySelector('.swdi-member-tabs')?.querySelectorAll('button.nav-link') || [])];
  const tabButtons = currentTabButtons();
  const originalMember = tabButtons.findIndex(button => button.classList.contains('active'));
  const memberTotal = tabButtons.length;
  const fields = [];
  const repeated = [];
  const scopedCodes = new Set();
  const emptySections = [];
  const noDataSections = [];
  const sectionStates = [];
  const unopenedSections = [];
  const incompleteMembers = [];
  const memberMetadata = [];
  const codePattern = /^(?:[a-z][a-z0-9_]*|member\(#\))$/i;
  let expandedSections = 0;
  let inspectedRows = 0;
  let memberScanned = 0;
  let totalSections = 0;

  function collectFields(container, scope, memberIndex = 0, memberLabel = '') {
    for (const td of container.querySelectorAll('td[title]')) {
      const code = td.getAttribute('title')?.trim();
      if (!codePattern.test(code || '')) continue;
      const sibling = td.nextElementSibling;
      if (!sibling || sibling.tagName !== 'TD' || td.parentElement !== sibling.parentElement) continue;
      inspectedRows++;
      const identity = `${scope}:${memberIndex}:${code}`;
      if (scopedCodes.has(identity)) {
        repeated.push(identity);
        continue;
      }
      scopedCodes.add(identity);
      const input = sibling.querySelector('input:not([type="hidden"]),textarea,select');
      let value = input ? input.value : sibling.textContent;
      if (input?.type === 'checkbox') value = input.checked ? 'Yes' : 'No';
      const section = td.closest('.swdi-accordion-section');
      fields.push({
        code, label:td.textContent.trim().replace(/\s+/g, ' '), value:String(value ?? '').trim(),
        section:section?.querySelector('button .fw-bold,button span')?.textContent.trim() || 'Assessment details',
        scope, memberIndex, memberLabel
      });
    }
  }

  // Only trusted member-status UI indicators and named demographic status
  // fields are used. 'New' is an unrelated Odoo badge, never an exclusion.
  function parseMemberStatus(value) {
    const text = String(value || '').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
    if (/^(?:member status\s*:?\s*)?(?:moved out|move out|movedout|transferred out)$/.test(text)) return 'moved-out';
    if (/^(?:member status\s*:?\s*)?(?:deceased|dead)$/.test(text)) return 'deceased';
    if (/^(?:member status\s*:?\s*)?(?:unlocated|not located|unable to locate)$/.test(text)) return 'unlocated';
    if (/^(?:member status\s*:?\s*)?(?:active|present)$/.test(text)) return 'active';
    return null;
  }
  function tabStatus(button) {
    const holder=button.closest('li');
    const candidates = [
      ['tab item status',holder?.getAttribute('data-member-status')||holder?.getAttribute('data-status')],
      ['data-member-status',button.getAttribute('data-member-status')],
      ['data-status',button.getAttribute('data-status')],
      ['aria-label',button.getAttribute('aria-label')],
      ['title',button.getAttribute('title')],
      ...[...button.querySelectorAll('.badge,.swdi-member-badge,.member-status,.status-badge,[data-member-status],[data-status]')]
        .map(el=>['status badge',el.getAttribute('data-member-status')||el.getAttribute('data-status')||el.textContent])
    ];
    // Parenthesized suffix in tab name is also an explicit status marker.
    const labelText = button.textContent.trim();
    const suffix = labelText.match(/(?:^|\s)[(\[]\s*(moved\s*out|deceased|unlocated|not\s*located|active)\s*[)\]]\s*$/i);
    if(suffix) candidates.push(['status label',suffix[1]]);
    for(const [source,raw] of candidates){
      const status=parseMemberStatus(raw);
      if(status) return {status,source};
    }
    return {status:null,source:null};
  }
  function demographics(container) {
    const demography = [...container.querySelectorAll('.swdi-accordion-section')].find(section=>
      /\bDEMOGRAPHY\b/i.test(section.querySelector(':scope > button')?.textContent || ''));
    const cells = [...(demography?.querySelectorAll('td[title]') || [])];
    const evidence = cells.filter(td=>td.nextElementSibling?.tagName==='TD' &&
      td.nextElementSibling.textContent.trim() && /^[a-z][a-z0-9_]*$/i.test(td.getAttribute('title')||''));
    // Empty or collapsed demographics must not be interpreted as deceased,
    // moved-out, or even as definitely active.
    return {available:evidence.length>0,count:evidence.length};
  }
  function demographicMemberStatus(container) {
    for(const td of container.querySelectorAll('td[title]')) {
      const code=(td.getAttribute('title')||'').toLowerCase().replace(/[_-]/g,'');
      const label=(td.textContent||'').trim().toLowerCase();
      if(!['memberstatus','memberstate','memstatus','statusmember'].includes(code) &&
         !/^(?:household )?member status\s*:?$/.test(label)) continue;
      const status=parseMemberStatus(td.nextElementSibling?.textContent);
      if(status) return {status,source:'member status field'};
    }
    return {status:null,source:null};
  }
  function discardMemberEvidence(index) {
    // Remove all extracted member fields (including demographics), section
    // coverage, and inferred rows from an excluded member. Household stays.
    for(const list of [fields,sectionStates,noDataSections]) {
      for(let i=list.length-1;i>=0;i--) if(Number(list[i].memberIndex)===index)list.splice(i,1);
    }
  }

  function ageForMember(memberIndex) {
    const memberFields = fields.filter(f => f.scope === 'member' && f.memberIndex === memberIndex);
    const direct = memberFields.find(f => f.code === 'age')?.value;
    const exact = /^\d{1,3}$/.test(String(direct || '').trim()) ? Number(direct) : null;
    if (exact !== null && exact >= 0 && exact <= 125) return exact;
    // If age isn't in the rendered DOM, calculate only when both dates are
    // present; do NOT substitute today's age for age at interview.
    const birth = memberFields.find(f => f.code === 'birth_date')?.value?.trim();
    const interview = fields.find(f => f.scope === 'household' && f.code === 'interview_date')?.value?.trim();
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(birth || '') || !datePattern.test(interview || '')) return null;
    const birthDate = new Date(birth + 'T00:00:00Z');
    const asOf = new Date(interview + 'T00:00:00Z');
    if (!Number.isFinite(birthDate.getTime()) || !Number.isFinite(asOf.getTime()) ||
        birthDate.toISOString().slice(0,10) !== birth || asOf.toISOString().slice(0,10) !== interview ||
        birthDate > asOf) return null;
    let years = asOf.getUTCFullYear() - birthDate.getUTCFullYear();
    if ((asOf.getUTCMonth() < birthDate.getUTCMonth()) ||
        (asOf.getUTCMonth() === birthDate.getUTCMonth() && asOf.getUTCDate() < birthDate.getUTCDate())) years--;
    return years >= 0 && years <= 125 ? years : null;
  }

  function examineMissingMemberSections(memberIndex, memberLabel) {
    const age = ageForMember(memberIndex);
    const memberFields = fields.filter(f => f.scope === 'member' && f.memberIndex === memberIndex);
    for (const f of memberFields) f.ageAtInterview = age;
    for (const section of memberBody.querySelectorAll('.swdi-accordion-section')) {
      const button = section.querySelector(':scope > button') || section.querySelector('button');
      if (!button || isCollapsed(button)) continue;
      const title = (button.querySelector('.fw-bold')?.textContent || button.textContent || '')
        .trim().replace(/\s+/g, ' ');
      const noQuestionCells = !section.querySelector('td[title]');
      const hasExplicitEmptyMessage = /no data captured for this section/i.test(section.textContent || '');
      if (!noQuestionCells) continue;
      const isMembership = /MEMBERSHIP TO ORGANIZATION|ASSOCIATION OR SUPPORT GROUP/i.test(title);
      const eligible = isMembership ? (age === null ? null : age >= 15) : null;
      const findingAvailable = isMembership && eligible === true && hasExplicitEmptyMessage &&
        !scopedCodes.has(`member:${memberIndex}:orgmem`);
      const item = { memberIndex, memberLabel, section:title, ageAtInterview:age,
        explicitNoData:hasExplicitEmptyMessage, eligibility:isMembership ? (eligible===null?'unknown':eligible?'eligible':'not-applicable') : 'not-assessed',
        inferredCode:findingAvailable?'orgmem':null };
      noDataSections.push(item);
      if (findingAvailable) {
        const code='orgmem';
        scopedCodes.add(`member:${memberIndex}:${code}`);
        // This synthetic row is explicitly inferred from the inventory and
        // the empty-section message, not extracted as a question from Odoo.
        fields.push({code, label:'Is member(#) member of an organization, association or support group?',
          value:'', section:title, scope:'member', memberIndex, memberLabel,
          inferred:true, inferenceSource:'No data captured for this section', ageAtInterview:age});
      }
    }
  }

  function recordSection(section, scope, memberIndex = 0, memberLabel = '') {
    const button = section.querySelector(':scope > button') || section.querySelector('button');
    const title = (button?.querySelector('.fw-bold')?.textContent || button?.textContent || 'Unnamed section')
      .trim().replace(/\s+/g, ' ');
    sectionStates.push({section:title,scope,memberIndex,memberLabel,
      questionCount:section.querySelectorAll('td[title]').length,
      collapsed:isCollapsed(button),
      explicitNoData:/no data captured for this section/i.test(section.textContent || '')});
  }

  async function expandSections(container, memberIndex = 0, memberLabel = '') {
    const currentSections = [...container.querySelectorAll('.swdi-accordion-section')];
    totalSections += currentSections.length;
    for (const section of currentSections) {
      const button = section.querySelector(':scope > button') || section.querySelector('button');
      if (!button) continue;
      if (options.expand && isCollapsed(button)) {
        const count = section.querySelectorAll('td[title]').length;
        button.click();
        expandedSections++;
        await waitFor(() => !isCollapsed(button) || section.querySelectorAll('td[title]').length > count, 1900);
        await pause(110);
      }
      if (isCollapsed(button)) unopenedSections.push(button.textContent.trim());
      if (!section.querySelector('td[title]')) emptySections.push(button.textContent.trim() || 'Unnamed section');
      recordSection(section, 'member', memberIndex, memberLabel);
    }
  }

  try {
    // Household questions are outside the independently rendered member card.
    // Collect once; avoid counting any currently rendered member's fields as household.
    const householdSections = [...ROOT.querySelectorAll('.swdi-accordion-section')]
      .filter(section => !memberBody || !memberBody.contains(section));
    for (const section of householdSections) {
      const button = section.querySelector(':scope > button') || section.querySelector('button');
      if (!button) continue;
      totalSections++;
      if (options.expand && isCollapsed(button)) {
        const prior = section.querySelectorAll('td[title]').length;
        button.click(); expandedSections++;
        await waitFor(() => !isCollapsed(button) || section.querySelectorAll('td[title]').length > prior, 1900);
        await pause(100);
      }
      if (isCollapsed(button)) unopenedSections.push(button.textContent.trim());
      if (!section.querySelector('td[title]')) emptySections.push(button.textContent.trim() || 'Unnamed section');
      recordSection(section, 'household');
    }
    // Include identity fields that may not be inside an accordion.
    const pageOutside = {querySelectorAll:selector => [...ROOT.querySelectorAll(selector)]
      .filter(node => !memberBody || !memberBody.contains(node))};
    collectFields(pageOutside, 'household');

    if (memberBody && memberTotal && options.scanMembers !== false) {
      for (let index = 0; index < memberTotal; index++) {
        const button = currentTabButtons()[index];
        if (!button) { incompleteMembers.push(index + 1); continue; }
        // Original tab text is only used in extension memory; never saved.
        const memberLabel = (button.querySelector(':scope > span:not(.badge)')?.textContent ||
          button.childNodes[0]?.textContent || '').trim().replace(/\s+/g, ' ') || `Member ${index + 1}`;
        const badge = tabStatus(button);
        if (['moved-out','deceased','unlocated'].includes(badge.status)) {
          memberMetadata.push({memberIndex:index+1,memberLabel,status:badge.status,
            statusSource:badge.source,demographyAvailable:false,ageAtInterview:null,
            excluded:true,verified:true});
          continue;
        }
        if (button.disabled && !button.classList.contains('active')) {
          memberMetadata.push({memberIndex:index+1,memberLabel,status:'unverified',
            statusSource:'tab disabled; status unavailable',demographyAvailable:false,
            ageAtInterview:null,excluded:false,verified:false});
          incompleteMembers.push(index+1);
          continue;
        }
        const previousSection = memberBody.querySelector('.swdi-accordion-section');
        if (!button.classList.contains('active')) {
          button.click();
          const activated = await waitFor(() => currentTabButtons()[index]?.classList.contains('active'), 2200);
          if (!activated) { incompleteMembers.push(index + 1); continue; }
          // The tab button may become active before OWL mounts the new
          // member's accordion. Wait for replacement of the old section node.
          await waitFor(() => Boolean(memberBody.querySelector('.swdi-accordion-section')) &&
            (memberBody.querySelector('.swdi-accordion-section') !== previousSection ||
             !previousSection?.isConnected), 1250);
          await pause(150);
        }
        await expandSections(memberBody, index + 1, memberLabel);
        const prior = fields.length;
        collectFields(memberBody, 'member', index + 1, memberLabel);
        // Member-specific status field takes precedence over incidental tab
        // decorations; we intentionally retain household-level answers.
        const statusField = demographicMemberStatus(memberBody);
        const resolved = statusField.status ? statusField : badge;
        const demo = demographics(memberBody);
        const knownAge=demo.available?ageForMember(index+1):null;
        if (['moved-out','deceased','unlocated'].includes(resolved.status)) {
          discardMemberEvidence(index+1);
          memberMetadata.push({memberIndex:index+1,memberLabel,status:resolved.status,
            statusSource:resolved.source,demographyAvailable:demo.available,
            ageAtInterview:null,excluded:true,verified:true});
          continue;
        }
        // A member requires both demographic evidence AND a usable age as of
        // interview before age-filtered completeness checks are reliable.
        const assessable=demo.available&&knownAge!==null;
        const status = assessable ? 'active' : 'unverified';
        const statusSource = assessable
          ? (resolved.status==='active' ? resolved.source : 'Demography + age evidence (inferred assessable)')
          : demo.available ? 'Demography present but age cannot be verified'
          : resolved.status==='active' ? 'Active label, but Demography did not load' : 'No usable Demography evidence';
        const metadata={memberIndex:index+1,memberLabel,status,statusSource,
          demographyAvailable:demo.available,demographyFieldCount:demo.count,
          ageAtInterview:knownAge,
          excluded:false,verified:assessable};
        memberMetadata.push(metadata);
        if (assessable) {
          // Do not infer missing answers for tabs without reliable age evidence.
          examineMissingMemberSections(index + 1, memberLabel);
          memberScanned++;
        } else {
          incompleteMembers.push(index+1);
        }
      }
    } else if (memberBody) {
      // Explicitly report partial member coverage if the reviewer opts out.
      const index = originalMember >= 0 ? originalMember : 0;
      const label=(currentTabButtons()[index]?.querySelector(':scope > span:not(.badge)')?.textContent||`Member ${index+1}`).trim();
      const marker=tabStatus(currentTabButtons()[index]);
      if(['moved-out','deceased','unlocated'].includes(marker.status)) {
        memberMetadata.push({memberIndex:index+1,memberLabel:label,status:marker.status,statusSource:marker.source,
          demographyAvailable:false,ageAtInterview:null,excluded:true,verified:true});
      } else {
        await expandSections(memberBody,index+1,label);
        collectFields(memberBody,'member',index+1,label);
        const resolved=demographicMemberStatus(memberBody);
        const demo=demographics(memberBody);
        const knownAge=demo.available?ageForMember(index+1):null;
        const assessable=demo.available&&knownAge!==null;
        const finalStatus=resolved.status||marker.status;
        if(['moved-out','deceased','unlocated'].includes(finalStatus)){
          discardMemberEvidence(index+1);
          memberMetadata.push({memberIndex:index+1,memberLabel:label,status:finalStatus,statusSource:resolved.source||marker.source,
            demographyAvailable:demo.available,ageAtInterview:null,excluded:true,verified:true});
        } else {
          if(assessable)examineMissingMemberSections(index+1,label);
          memberMetadata.push({memberIndex:index+1,memberLabel:label,status:assessable?'active':'unverified',
            statusSource:assessable?'Demography + age evidence (inferred assessable)':demo.available?'Demography present but age cannot be verified':'No usable Demography evidence',
            demographyAvailable:demo.available,ageAtInterview:knownAge,
            excluded:false,verified:assessable});
          memberScanned=assessable?1:0;
        }
      }
    }
  } finally {
    // The extension may expand accordions, but restores the original member tab.
    if (memberTotal && originalMember >= 0 && !currentTabButtons()[originalMember]?.classList.contains('active')) {
      currentTabButtons()[originalMember]?.click();
      await waitFor(() => currentTabButtons()[originalMember]?.classList.contains('active'), 2000);
    }
  }
  return {
    ok:true, fields, fieldCount:fields.filter(f => !f.inferred).length,
    inferredCount:fields.filter(f => f.inferred).length, inspectedRows,
    duplicates:repeated, totalSections, expandedSections,
    unopenedSections, sectionsWithNoFields:emptySections, noDataSections, sectionStates,
    memberTotal, memberScanned, incompleteMembers, members:memberMetadata,
    memberExcluded:memberMetadata.filter(m=>m.excluded).length,
    memberUnverified:memberMetadata.filter(m=>m.status==='unverified').length,
    pageTitle:document.title
  };
}
async function run(options = {}) {
  const root = currentColumn();
  if (!document.querySelector('.o_swdi_review')) return { ok: false, error: 'This tab is not an SWDI Assessment Review. Open the household in 4Ps Forward → SWDI Assessment → Assessment Review.' };
  const header = readHeader(root), score = readScoreCard(root), tabs = readTabs(root);
  if (!header.hhid) return { ok: false, error: 'Could not find the household ID on this page.' };
  const cap = { kind: 'swdi-4psf-capture', v: 1, capturedAt: new Date().toISOString(),
    env: /loadtest/i.test(location.hostname) ? 'Preprod load test' : /preprod/i.test(location.hostname) ? 'Preprod' : location.hostname,
    url: location.href, hhid: header.hhid, period: header.period, cml: header.cml, interviewDate: header.date, origin: header.origin, status: header.status,
    score, members: tabs.map(t => ({ memberIndex: t.memberIndex, name: t.name, age: t.tabAge, status: 'active', excluded: false })), answers: [], scan: null };
  if (options.answers !== false) {
    const scan = await scanPage({ expand: true, scanMembers: true });
    if (!scan.ok) return { ok: false, error: scan.error };
    const meta = {}; (scan.members || []).forEach(m => { meta[m.memberIndex] = m; });
    cap.members = tabs.map(t => {
      const m = meta[t.memberIndex] || {};
      return { memberIndex: t.memberIndex, name: t.name, age: m.ageAtInterview ?? t.tabAge, ageSource: m.ageAtInterview !== null && m.ageAtInterview !== undefined ? 'age at interview' : 'tab badge',
        status: m.status || 'active', excluded: !!m.excluded };
    });
    cap.answers = scan.fields.filter(f => !f.inferred).map(f => ({ scope: f.scope, memberIndex: f.memberIndex || 0, code: f.code, value: f.value }));
    cap.scan = { fieldCount: scan.fieldCount, sections: scan.totalSections, unopenedSections: scan.unopenedSections, incompleteMembers: scan.incompleteMembers };
  }
  return { ok: true, capture: cap };
}

self.SWDICapture = { run, readHeader, readScoreCard, readTabs, currentColumn };
})();
