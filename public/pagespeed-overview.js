import {scoreGauge,scoreRating} from './pagespeed-presentation.js';
import {esc,safeUrl} from './html.js';
export function pageSpeedOverview(report){
 const runs=report.integrations?.find(i=>i.provider==='pagespeed')?.metrics||[];
 const url=report.target.page?.url||report.target.pages?.[0]?.url||report.target.url;
 // Domain overview uses the first sampled page only, never a site-wide average.
 const selected=['mobile','desktop'].map(strategy=>{
  const run=runs.find(r=>r.url===url&&r.strategy===strategy&&!r.error&&scoreRating(r.scores?.find(s=>s.id==='performance')?.value)!=='unknown');
  return run?{run,score:run.scores.find(s=>s.id==='performance')}:null;
 }).filter(Boolean);
 if(!selected.length)return '';
 return `<section class="card psi-overview"><h2>PageSpeed Performance</h2><p class="caption">${report.mode==='domain'?'First sampled page; not a site-wide score.':'Google Lighthouse lab results.'} Separate from the ${report.mode==='domain'?'Domain Competitive':'SEO Optimization'} Score.</p><div class="psi-gauges">${selected.map(({run,score})=>`<div>${scoreGauge(score,run.strategy==='mobile'?'Mobile Performance':'Desktop Performance')}<p class="caption psi-overview-date">Tested: ${esc(run.testedAt||run.collectedAt||'Date unavailable')}${run.cached?' · Cached':''}</p></div>`).join('')}</div><p class="caption break"><a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(url)}</a><br>90–100 Good · 50–89 Needs improvement · 0–49 Poor. Details are in Technical.</p></section>`;
}
