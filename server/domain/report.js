import { randomUUID } from 'node:crypto';
import { crawlDomain } from './discovery.js';
import { analyzeDomain } from './analysis.js';
import { classifyDomainAI } from './ai.js';
import { compareDomains, planContent, footprintTable } from './planning.js';
export async function buildDomainReport(input,emit=()=>{},signal,dependencies={}) {
  const crawl=dependencies.crawl||crawlDomain,ai=dependencies.ai||classifyDomainAI;
  emit('Discovering target domain');
  const crawled=await crawl(input.targetUrl,input.crawlLimit,emit,signal);
  if(!crawled.pages.length)throw new Error(`Target domain could not be analyzed: ${crawled.failures[0]?.error || crawled.stopped}`);
  emit('Analyzing site architecture and internal links');
  const target=analyzeDomain(crawled,input.keywords);
  target.ai=await ai(target,input.keywords,emit,signal);
  const competitors=[];
  for(const url of input.competitorUrls) {
    signal?.throwIfAborted(); emit(`Starting competitor domain: ${new URL(url).hostname}`);
    try {
      const result=await crawl(url,input.crawlLimit,emit,signal);
      if(!result.pages.length){competitors.push({url,error:result.failures[0]?.error||result.stopped,crawl:result});continue;}
      const analysis=analyzeDomain(result,input.keywords,target.localRelevant);
      analysis.ai=await ai(analysis,input.keywords,emit,signal);competitors.push({url,analysis});
    } catch(error) {if(signal?.aborted)throw error;competitors.push({url,error:error.message});}
  }
  emit('Comparing content footprints and planning opportunities');
  const comparison=compareDomains(target,competitors,input.keywords);const opportunities=planContent(target,comparison,input.keywords);
  const summary={strengths:target.score.categories.filter(c=>c.score>=75).map(c=>`${c.name}: ${c.score}/100 within this sample.`),weaknesses:target.issues.slice(0,5).map(i=>i.issue),nextMove:target.issues[0]?.fix || opportunities[0]?.why || 'Review the sampled content against real customer needs.'};
  const actionPlan={'Fix First':target.issues.filter(i=>['Critical','High Impact'].includes(i.priority)).map(i=>({id:i.id,text:i.issue,detail:i.fix})),Next:[...target.issues.filter(i=>i.priority==='Medium Impact').map(i=>({id:i.id,text:i.issue,detail:i.fix})),...opportunities.slice(0,3).map(o=>({id:o.id,text:`Validate content opportunity: ${o.title}`,detail:`${o.why} Support: ${o.supportUrl}`}))],Ongoing:[{id:'domain-monitor',text:'Re-crawl after meaningful changes',detail:'Use the same crawl limit and compare the sample, not indexed-page counts.'},{id:'domain-monthly',text:'Review the next six content opportunities monthly',detail:'Confirm service relevance and existing coverage, create original useful content, then measure results with actual analytics.'}]};
  return {id:randomUUID(),schemaVersion:1,mode:'domain',date:new Date().toISOString(),input,target,competitors,comparison,opportunities,summary,actionPlan,table:footprintTable(target,competitors),integrations:[],warnings:[
    'All metrics describe this bounded static-HTML crawl. Pages discovered during this analysis are not indexed pages or the full site size.',
    `${input.crawlLimit} HTML URL requests per domain, including redirects and errors. At most six sitemap documents, 5,000 discovered candidates, 24 MB decoded responses and three minutes of crawl work per domain.`,
    'No backlink authority, domain authority, actual rankings or indexed-page counts are measured.',
    'Orphan-like pages and click depths use observed links only. Uncrawled or JavaScript-rendered pages may change conclusions.',
    'Topic groups and usefulness are inferred. AI is optional and labeled; deterministic scores do not change when AI is enabled.',
    ...(target.stopped?[target.stopped]:[]),...target.warnings,...competitors.filter(c=>c.error).map(c=>`${c.url}: ${c.error}`)
  ]};
}
