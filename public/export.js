import {explainReport} from './recommendation-examples.js';
import { esc, renderReport } from './render.js';
let exportToken = '';
export function setExportToken(token) { exportToken = token; }
export function recommendationText(report, checked = []) {
  report=explainReport(report);
  return [`LIGHTHOUSE SEO SPECIALIST`, report.input.targetUrl, `Analyzed: ${report.date}`, `${report.mode==='domain'?'Domain Competitive Score':'SEO Optimization Score'}: ${report.target.score.overall}/100 (not a Google ranking score)`, '', ...report.target.issues.map(i => `${i.priority.toUpperCase()} — ${i.issue}\nElement: ${i.element}\nEvidence: ${i.evidence}\nWhy: ${i.why}\nFix: ${i.fix}${(i.examples||[i.comparison].filter(Boolean)).map(c=>`\nCurrent: ${c.current}\n${c.label}: ${c.suggested}\nReview note: ${c.note}`).join('')}\nSource: ${i.sourceUrl}\n`), ...(report.opportunities||[]).map(o=>`CONTENT OPPORTUNITY: ${o.title}\nTopic: ${o.topic}\nIntent: ${o.intent}\nPage type: ${o.pageType}\nSupports: ${o.supportUrl}\nWhy: ${o.why}\n`), ...Object.entries(report.actionPlan).flatMap(([group, items]) => [group.toUpperCase(), ...items.map(i => `[${checked.includes(i.id) ? 'x' : ' '}] ${i.text}\n    ${i.detail}`), ''])].join('\n');
}
function downloadReport(report, checked, format) {
  if (!exportToken) throw new Error('Reload the application before exporting.');
  const form = document.createElement('form'); form.method = 'POST'; form.action = '/api/export'; form.hidden = true;
  for (const [name,value] of Object.entries({format,token:exportToken,payload:JSON.stringify({report,checked})})) { const input=document.createElement('input'); input.type='hidden'; input.name=name; input.value=value; form.append(input); }
  document.body.append(form); form.submit(); form.remove();
}
export function exportJson(report, checked) { downloadReport(report, checked, 'json'); }
export function exportHtml(report, checked) { downloadReport(report, checked, 'html'); }
export function buildPrintableHtml(report, checked, css = '') {
  const reportMarkup = renderReport(report, checked).replaceAll('<details', '<details open');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lighthouse SEO Report — ${esc(new URL(report.target.page?.url||report.target.url).hostname)}</title><style>${css}\n.report-actions,.tabs,.copy-button,.subheading select,.sr-only{display:none!important}.tab-panel[hidden]{display:block!important}.tab-panel{margin:30px 0}.print-only{display:block}.workspace{margin:0}main{max-width:1200px}body{background:#fff}</style></head><body><main><p class="eyebrow">LIGHTHOUSE DIGITAL · SEO SPECIALIST</p><div id="report">${reportMarkup}</div><p class="caption">Static export. All report sections are included. Checkbox state reflects the exported report; edits to this file do not sync to the app.</p></main></body></html>`;
}
export function printReport() {
  const details = [...document.querySelectorAll('#report details')]; const previous = details.map(d => d.open); details.forEach(d => { d.open = true; });
  const restore = () => details.forEach((d, i) => { d.open = previous[i]; });
  window.addEventListener('afterprint', restore, { once: true }); window.print();
}
