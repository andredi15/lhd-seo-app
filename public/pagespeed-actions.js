import {scoreRating,metricRating} from './pagespeed-presentation.js';
// Shared by fresh reports, saved reports, the dashboard and exports. Never changes SEO scores.
export function withPageSpeedActions(report){
 if(!report.actionPlan)return report;
 const additions=[];
 for(const run of report.integrations?.find(i=>i.provider==='pagespeed')?.metrics||[]){
  if(run.error)continue;
  const poorScores=(run.scores||[]).filter(s=>scoreRating(s.value)==='poor');
  const poorMetrics=(run.measurements||[]).filter(m=>metricRating(m,run.strategy).status==='poor');
  if(!poorScores.length&&!poorMetrics.length)continue;
  const names={performance:'Performance',accessibility:'Accessibility','best-practices':'Best Practices',seo:'Lighthouse SEO'};
  const evidence=[...poorScores.map(s=>`${names[s.id]||s.id} ${s.value}/100`),...poorMetrics.map(m=>`${metricRating(m,run.strategy).spec.short} ${m.display||`${m.value} ${m.units}`}`)].join('; ');
  const fixes=[];
  if(poorMetrics.some(m=>m.id==='largest-contentful-paint'))fixes.push('Inspect the largest content element and its loading path; check image sizing, loading priority and server response before choosing a fix.');
  if(poorMetrics.some(m=>m.id==='total-blocking-time'))fixes.push('Inspect long JavaScript tasks and third-party scripts; defer work that is not needed for the initial view.');
  if(poorMetrics.some(m=>m.id==='cumulative-layout-shift'))fixes.push('Identify shifting elements; reserve space for images, embeds and late-loading content.');
  const diagnostics=(run.diagnostics||[]).slice(0,3).map(d=>d.title).filter(Boolean);
  additions.push({id:`psi-action-${encodeURIComponent(run.url)}-${run.strategy}`,text:`Address poor PageSpeed results (${run.strategy})`,detail:`${run.url} — ${evidence}. Source: Google PageSpeed Insights / Lighthouse, ${run.testedAt||run.collectedAt||'test date unavailable'}. ${fixes.join(' ')} Review the failing audits in Technical${diagnostics.length?`: ${diagnostics.join('; ')}`:''}, make targeted changes, then retest the same page and device. These are lab results, not a real-user Core Web Vitals verdict.`,source:'pagespeed'});
 }
 const plan=Object.fromEntries(Object.entries(report.actionPlan).map(([k,v])=>[k,v.filter(i=>i.source!=='pagespeed')]));
 plan['Fix First']=[...(plan['Fix First']||[]),...additions];
 return {...report,actionPlan:plan};
}
