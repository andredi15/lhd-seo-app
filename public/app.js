import {withPageSpeedActions} from './pagespeed-actions.js';
import { renderReport, renderHistory, renderSideBySide } from './render.js';
import { getHistory, saveReport, deleteReport, getChecked, setChecked } from './storage.js';
import { recommendationText, exportHtml, previewPdf, setExportToken } from './export.js';

const $ = selector => document.querySelector(selector);
let currentReport = null; let controller = null; let toastTimer;
let mode='page'; const formDrafts={page:null,domain:null};
function formValues(){return {targetUrl:$('#target-url').value,keywords:$('#keywords').value,competitorUrls:[...document.querySelectorAll('#competitor-inputs input')].map(i=>i.value),crawlLimit:$('#crawl-limit').value,rankSettings:$('#include-rankings').checked?{location:$('#rank-location').value,country:$('#rank-country').value,language:$('#rank-language').value,device:$('#rank-device').value}:null};}
function fillValues(value){$('#target-url').value=value.targetUrl||'';$('#keywords').value=value.keywords||'';$('#crawl-limit').value=String(value.crawlLimit||25);$('#competitor-inputs').replaceChildren();(value.competitorUrls?.length?value.competitorUrls:['']).forEach(competitorField);
 const rs=value.rankSettings;$('#include-rankings').checked=!!rs&&!$('#include-rankings').disabled;$('#ranking-settings').hidden=!$('#include-rankings').checked;
 $('#rank-location').value=rs?.location||'';$('#rank-country').value=rs?.country||'ca';$('#rank-language').value=rs?.language||'en';$('#rank-device').value=rs?.device||'mobile';rankingBudget();}

function setMode(next,restore=true) {
  if(controller&&next!==mode)return;
  if(restore&&next!==mode){formDrafts[mode]=formValues();mode=next;fillValues(formDrafts[next]||{});}else mode=next;
  const domain=mode==='domain';
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('.page-heading h1').textContent=domain?'Domain Analysis':'SEO Page Analyzer';$('.page-heading .eyebrow').textContent=domain?'DOMAIN INTELLIGENCE':'PAGE INTELLIGENCE';
  $('.page-heading .lead').textContent=domain?'Explore website health, topic coverage and internal linking across a bounded crawl, then plan your next content moves.':'Analyze how well a page is optimized for your target keywords and compare it against the competition.';
  $('#target-label').textContent=domain?'Target domain':'Target URL';$('#target-url').type=domain?'text':'url';$('#target-url').placeholder=domain?'example.com':'https://example.com/service-page/';
  $('#keywords-label').textContent=domain?'Target keywords or general topic (optional)':'Target Keywords';$('#keywords-required').hidden=domain;$('#keywords').required=!domain;
  $('#keywords').placeholder=domain?'e.g. home renovations, renovation services in Toronto':'Enter one keyword per line';
  $('#competitors-label').textContent=domain?'Competitor domains':'Competitor URLs';$('#domain-limit').hidden=!domain;$('#crawl-scope').hidden=domain;
  $('.summary-hint').textContent=domain?'A bounded crawl. A website content plan.':'One target page. A focused action plan.';
  $('.form-note strong').textContent=domain?'A focused website review':'A focused page review';$('.form-note p').textContent=domain?'Discover pages from navigation and sitemaps. Each domain has the same crawl limit; partial coverage is labeled.':'We retrieve the supplied pages and compare their content. Every finding stays connected to its source.';
  $('#empty-state h2').textContent=domain?'See how the website fits together.':'Start with the page that matters.';
  $('#empty-state>p').textContent=domain?'Understand content coverage, find structural weaknesses, and plan the next six content opportunities.':'Get a clear view of keyword targeting, content gaps, and what to fix first.';
  $('#analyze-button').innerHTML=`${domain?'Analyze Domain':'Analyze SEO'} <span aria-hidden="true">↗</span>`;labelCompetitors();
  if(restore){$('#input-details').open=true;$('#report').hidden=!currentReport||(currentReport.mode||'page')!==mode;$('#empty-state').hidden=!$('#report').hidden;$('#error').hidden=true;}
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000); }
function error(message) { $('#error').textContent = message; $('#error').hidden = false; }
function updateHistory() { const reports = getHistory(); $('#history-count').textContent = reports.length; $('#history-list').innerHTML = renderHistory(reports); }
function screen(name) {
  for (const key of ['analyzer','history','method']) { $(`#${key}-screen`).hidden = key !== name; const button = $(`#nav-${key}`); button.classList.toggle('selected', key === name); if (key === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
  if (name === 'history') updateHistory();
}
function competitorField(value = '') {
  if ($('#competitor-inputs').children.length >= 5) return;
  const row = document.createElement('div'); row.className = 'competitor-row';
  const input = document.createElement('input'); input.type = mode==='domain'?'text':'url'; input.placeholder = mode==='domain'?'competitor.com':'https://competitor.com/service/'; input.maxLength = 2048; input.value = value;
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove competitor');
  remove.addEventListener('click', () => { row.remove(); labelCompetitors(); $('#add-competitor').focus(); }); row.append(input, remove); $('#competitor-inputs').append(row); labelCompetitors();
}
function labelCompetitors() { document.querySelectorAll('#competitor-inputs input').forEach((input, i) => {input.type=mode==='domain'?'text':'url';input.placeholder=mode==='domain'?'competitor.com':'https://competitor.com/service/';input.setAttribute('aria-label', `Competitor ${mode==='domain'?'domain':'URL'} ${i + 1}`);}); $('#add-competitor').disabled = $('#competitor-inputs').children.length >= 5; }
function displayReport(report) {
  report=withPageSpeedActions(report);
  currentReport = report;
  setMode(report.mode||'page',false);
  $('#report').innerHTML = renderReport(report, getChecked(report.id)); $('#report').hidden = false; $('#empty-state').hidden = true; $('#input-details').open = false; screen('analyzer');
}
function populate(report) { setMode(report.mode||'page',false); fillValues({...report.input,keywords:report.input.keywords.join('\n')}); }
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Clipboard is unavailable. Use an HTML or JSON export instead.'); } }
$('#add-competitor').addEventListener('click', () => { competitorField(); $('#competitor-inputs').lastElementChild?.querySelector('input').focus(); });
$('#nav-analyzer').addEventListener('click', () => screen('analyzer'));
$('#nav-history').addEventListener('click', () => screen('history'));
$('#nav-method').addEventListener('click', () => screen('method'));
$('#cancel-analysis').addEventListener('click', () => controller?.abort());
$('#analyze-form').addEventListener('submit', async event => {
  event.preventDefault(); if (controller) return;
  const input = { mode,includeRankings:$('#include-rankings').checked,rankSettings:{location:$('#rank-location').value,country:$('#rank-country').value,language:$('#rank-language').value,device:$('#rank-device').value},includePageSpeed: $('#include-pagespeed').checked,targetUrl: $('#target-url').value.trim(), keywords: $('#keywords').value, competitorUrls: [...document.querySelectorAll('#competitor-inputs input')].map(i => i.value.trim()).filter(Boolean),...(mode==='domain'?{crawlLimit:Number($('#crawl-limit').value)}:{}) };
  controller = new AbortController();
  document.querySelectorAll('[data-mode]').forEach(b=>{b.disabled=true;});
  $('#analyze-button').disabled = true; $('#analyze-button').textContent = 'Analyzing…'; $('#analysis-progress').hidden = false; $('#progress-stages').replaceChildren(); $('#progress-current').textContent = 'Connecting to analyzer'; $('#error').hidden = true; $('#report').hidden = true; $('#empty-state').hidden = true;
  let received = false;
  try {
    const response = await fetch(mode==='domain'?'/api/analyze/domain':'/api/analyze', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(input), signal:controller.signal });
    if (!response.ok) { let message = `Request failed (HTTP ${response.status}).`; try { message = (await response.json()).error || message; } catch {} throw new Error(message); }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = '';
    function consume(line) {
      if (!line.trim()) return; const event = JSON.parse(line);
      if (event.type === 'error') throw new Error(event.error);
      if (event.type === 'progress') { $('#progress-current').textContent = event.message; const item = document.createElement('li'); item.textContent = event.message; $('#progress-stages').append(item); }
      if (event.type === 'report') { received = true; displayReport(event.report); const saved = saveReport(event.report); updateHistory(); if (!saved.saved) toast('Report ready. Browser storage is full or disabled; export this report to keep it.'); }
    }
    while (true) { const { value, done } = await reader.read(); if (done) break; pending += decoder.decode(value, { stream:true }); let index; while ((index = pending.indexOf('\n')) >= 0) { const line = pending.slice(0,index); pending = pending.slice(index + 1); consume(line); } }
    pending += decoder.decode(); if (pending.trim()) consume(pending);
    if (!received) throw new Error('The connection closed before a report arrived. Please try again.');
    $('#report').scrollIntoView({ behavior:'smooth', block:'start' });
  } catch (err) { error(err.name === 'AbortError' ? 'Analysis cancelled. You can start a new analysis when ready.' : err.message); if (currentReport) $('#report').hidden = false; else $('#empty-state').hidden = false; }
  finally { $('#include-pagespeed').checked=!$('#include-pagespeed').disabled; controller = null; document.querySelectorAll('[data-mode]').forEach(b=>{b.disabled=false;});$('#analyze-button').disabled = false; $('#analyze-button').innerHTML = `${mode==='domain'?'Analyze Domain':'Analyze SEO'} <span aria-hidden="true">↗</span>`; $('#analysis-progress').hidden = true; }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.tab !== undefined) {
    const index = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(b => { const selected = b.dataset.tab === index; b.setAttribute('aria-selected', String(selected)); b.tabIndex = selected ? 0 : -1; });
    document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.id !== `panel-${index}`; });
  }
  if (button.dataset.copy !== undefined) await copyText(button.dataset.copy);
  if (button.dataset.openReport) { const report = getHistory().find(r => r.id === button.dataset.openReport); if (report) { displayReport(report); populate(report); $('#report').scrollIntoView(); } }
  if (button.dataset.deleteReport) { try { deleteReport(button.dataset.deleteReport); updateHistory(); toast('Report removed from local history'); } catch { toast('Browser storage is unavailable.'); } }
  if (button.dataset.rankCompetitor) {
    const url=mode==='domain'?new URL(button.dataset.rankCompetitor).origin:button.dataset.rankCompetitor;
    const inputs=[...document.querySelectorAll('#competitor-inputs input')];
    if(inputs.some(i=>i.value===url)){toast('Already in your comparison inputs');return;}
    const blank=inputs.find(i=>!i.value.trim());
    if(blank)blank.value=url;else if(inputs.length<5)competitorField(url);else{toast('Remove a competitor first; the limit is five.');return;}
    $('#input-details').open=true;toast('Added for your next analysis');return;
  }
  if (!currentReport) return;
  const checked = [...document.querySelectorAll('[data-action-id]:checked')].map(i => i.dataset.actionId);
  try {
    if (button.id === 'copy-recommendations') await copyText(recommendationText(currentReport, checked));
    if (button.id === 'export-html') await exportHtml(currentReport, checked);
    if (button.id === 'export-pdf') {button.disabled=true;button.textContent='Preparing PDF…';try{await previewPdf(currentReport,checked);}finally{button.disabled=false;button.textContent='PDF Report';}}
  } catch (err) { toast(err.message || 'Export failed. Please try again.'); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'competitor-select' && currentReport) $('#side-by-side').innerHTML = renderSideBySide(currentReport, Number(event.target.value));
  if (event.target.dataset.actionId && currentReport) { const checked = [...document.querySelectorAll('[data-action-id]:checked')].map(i => i.dataset.actionId); try { setChecked(currentReport.id, checked); } catch { toast('Checklist updated, but browser storage is unavailable.'); } }
});
document.addEventListener('keydown', event => {
  if (!event.target.matches('[role=tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault(); const buttons = [...document.querySelectorAll('[role=tab]')]; const index = buttons.indexOf(event.target); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length; buttons[next].click(); buttons[next].focus();
});
fetch('/api/health').then(r => r.json()).then(data => { setExportToken(data.exportToken); $('#include-rankings').disabled=!data.searchApiConfigured; $('#rankings-status').textContent=data.searchApiConfigured?'Connected':'Requires server API key'; $('#include-pagespeed').disabled=!data.pageSpeedConfigured; $('#include-pagespeed').checked=!!data.pageSpeedConfigured; $('#pagespeed-status').textContent=data.pageSpeedConfigured?'Connected':'Requires server API key'; $('#engine-status').textContent = data.aiConfigured ? 'AI + rules ready' : 'Rules engine ready'; }).catch(() => { $('#engine-status').textContent = 'Engine unavailable'; });
competitorField(); updateHistory();

$('#include-rankings').addEventListener('change',()=>{$('#ranking-settings').hidden=!$('#include-rankings').checked;});
function rankingBudget(){const count=Math.min(5,new Set($('#keywords').value.split(/[\n,]+/).map(k=>k.trim().toLowerCase()).filter(Boolean)).size);$('#ranking-budget').textContent=`Manual check: up to ${count} SearchApi requests for the first ${count} keywords. Usage may be billable; identical checks are cached for one hour. No scheduled tracking.`;}
$('#keywords').addEventListener('input',rankingBudget);
