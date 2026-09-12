import { tokens, normalize, matchKeyword } from '../keywords.js';
import { domainKey } from './discovery.js';
const effective = p => p.aiClassification || p.classification;
const ignored=new Set(['servic','company','home','welcome','our','about','best','page','contact']);
const topicalTokens=text=>tokens(text).filter(t=>!ignored.has(t));
const similarity=(a,b)=>{const wanted=topicalTokens(a),present=new Set(topicalTokens(b));return wanted.length?wanted.filter(t=>present.has(t)).length/wanted.length:0;};
export function compareDomains(target,competitors,keywords) {
  const valid=competitors.filter(c=>c.analysis?.pages.length);
  const targetTopics=target.pages.map(p=>({url:p.url,...effective(p)}));
  const businessText=target.pages.filter(p=>p.classification.categories.includes('Core services')||p.depth===0).map(p=>`${p.title} ${p.h1.join(' ')} ${p.body.slice(0,3000)}`).join(' ');
  const gaps=[];const seen=new Map();
  for(const competitor of valid) for(const page of competitor.analysis.pages) {
    const topic=effective(page); if(!page.usefulCandidate || topic.categories.every(c=>c==='General pages'))continue;
    if(targetTopics.some(t=>similarity(topic.topic,t.topic)>=.7))continue;
    const score=Math.max(similarity(topic.topic,businessText),...keywords.map(k=>similarity(topic.topic,k)),0);
    const local=topic.categories.includes('Local/service-area content');
    const knownLocation=!page.locations.length || page.locations.some(l=>normalize(businessText).includes(normalize(l)));
    const relevant=score>=.45 && (!local || (target.localRelevant && knownLocation));
    const key=normalize(topic.topic);const existing=seen.get(key);
    const source={url:page.url,quote:topic.evidence||page.h1[0]||page.title,domain:competitor.analysis.url};
    if(existing){if(!existing.evidence.some(e=>e.domain===source.domain))existing.evidence.push(source);continue;}
    const support=target.pages.filter(p=>p.classification.categories.includes('Core services')).sort((a,b)=>similarity(topic.topic,b.classification.topic)-similarity(topic.topic,a.classification.topic))[0];
    const gap={topic:topic.topic,categories:topic.categories,evidence:[source],relevance:relevant?'Plausibly relevant':'Business relevance unconfirmed',relevant,score:Math.round(score*100),supportUrl:support?.url||target.pages[0]?.url,usefulness:relevant?'The topic overlaps the target’s retrieved offering or supplied focus. Confirm the service and customer need, then add original coverage or improve an existing section. Competitor presence is not proof of demand.':'No sufficient match to the target’s retrieved offering was found. Do not add this service or location without business confirmation.',status:'Not matched to a target topic in this crawl; uncrawled pages or different wording may cover it.'};
    gaps.push(gap);seen.set(key,gap);
  }
  gaps.sort((a,b)=>Number(b.relevant)-Number(a.relevant)||b.evidence.length-a.evidence.length||b.score-a.score);
  const mean=valid.length?Math.round(valid.reduce((n,c)=>n+c.analysis.score.overall,0)/valid.length):null;
  const delta=mean===null?null:target.score.overall-mean;
  const position=delta===null?'Not assessed':delta>=10?'Ahead':delta>=-9?'Competitive':delta>=-24?'Moderate Gap':'Significant Gap';
  const differences=target.score.categories.map(c=>({name:c.name,delta:valid.length?Math.round(c.score-valid.reduce((n,v)=>n+(v.analysis.score.categories.find(x=>x.name===c.name)?.score ?? c.score),0)/valid.length):0}));
  const strengths=differences.filter(d=>d.delta>10).map(d=>d.name),weaknesses=differences.filter(d=>d.delta< -10).map(d=>d.name);
  return {position,mean,delta,gaps:gaps.slice(0,40),successfulCount:valid.length,explanation:mean===null?'No successfully crawled competitor domain is available.':`The target’s sample score is ${target.score.overall}, against a competitor mean of ${mean}. ${strengths.length?`Stronger relative areas: ${strengths.join(', ')}. `:''}${weaknesses.length?`Weaker relative areas: ${weaknesses.join(', ')}. `:''}${gaps.filter(g=>g.relevant).length} plausibly relevant topic gaps need review. All sites use the same requested limit, but coverage and failures differ; this is not a whole-web or ranking comparison.`,differences};
}
export function planContent(target,comparison,keywords) {
  if(!target.pages.length)return [];
  const services=target.pages.filter(p=>p.classification.categories.includes('Core services'));
  const bases=services.length?services:target.pages.filter(p=>p.depth===0).slice(0,1);
  const opportunities=[];
  function add(value) {
    const key=normalize(value.title);if(opportunities.some(o=>normalize(o.title)===key))return;
    const existing=target.pages.find(p=>similarity(value.title,effective(p).topic)>=.85);
    opportunities.push({...value,id:`content-${opportunities.length+1}`,implementation:existing?`Expand or refresh the existing page: ${existing.url}`:'Confirm the gap across the full site before creating a new page.',existingUrl:existing?.url||null});
  }
  for(const gap of comparison.gaps.filter(g=>g.relevant).slice(0,4)) {
    const support=target.pages.find(p=>p.url===gap.supportUrl)||bases[0];
    add({title:`${gap.topic}: a practical customer guide`,topic:gap.topic,intent:gap.categories.includes('Local/service-area content')?'Local / commercial investigation':'Commercial investigation',pageType:gap.categories.includes('Core services')?'Service page or supporting guide':'Supporting resource',supportUrl:support.url,priority:'High Impact',valueScore:Math.min(95,60+gap.score*.2+gap.evidence.length*4),why:`${gap.evidence.length} competitor domain(s) contain this topic and it overlaps the target offering. ${gap.usefulness}`,evidence:gap.evidence,basis:'Competitor-derived editorial proposal'});
  }
  const patterns=services.length?[
    ['What to consider before choosing {topic}','Commercial investigation','Buying guide','Help customers make a decision and direct them to the real service page.'],
    ['How {topic} works: process and expectations','Informational / commercial investigation','Process guide','Explain the actual process and connect useful detail to the existing service.'],
    ['Common questions about {topic}','Informational / commercial investigation','FAQ resource','Answer questions customers actually ask; avoid duplicating answers already on the service page.'],
    ['Planning a {topic} project: scope and cost factors','Commercial investigation','Planning guide','Explain verified scope and cost drivers without inventing prices or demand.'],
    ['{topic}: a real project explained','Commercial investigation','Case study','Only publish when a genuine project, permissions and evidence are available.'],
    ['Getting started with {topic}: a preparation checklist','Informational','Supporting resource','Help customers prepare for the actual service and link to its existing conversion path.']
  ]:[
    ['A practical guide to {topic}','Informational','Resource guide','Clarify the subject already present on the homepage.'],
    ['Common questions about {topic}','Informational','FAQ resource','Use actual reader questions and source-supported answers.'],
    ['How to use {topic}: a worked example','Informational','Tutorial','Create an accurate example grounded in the website’s real subject.'],
    ['Understanding the options within {topic}','Informational / commercial investigation','Comparison resource','Compare only genuine alternatives relevant to the retrieved topic.'],
    ['Getting started with {topic}','Informational','Introductory resource','Provide a clearer entry point and support the existing topic page.'],
    ['{topic}: common mistakes and how to avoid them','Informational','Supporting resource','Document real mistakes with evidence; confirm that this need is not already covered.']
  ];
  for(let i=0;opportunities.length<6&&i<12;i++) {
    const base=bases[i%bases.length],pattern=patterns[i%patterns.length];
    const focus=keywords.find(k=>matchKeyword(base.body,k).coverage>=.7) || effective(base).topic;
    add({title:pattern[0].replace('{topic}',focus),topic:focus,intent:pattern[1],pageType:pattern[2],supportUrl:base.url,priority:'Medium Impact',valueScore:70-i,why:pattern[3],evidence:[{url:base.url,quote:effective(base).evidence||base.title}],basis:'Editorial proposal based on a retrieved subject; demand unverified'});
  }
  if(target.localRelevant && opportunities.length && bases[0]) {
    const base=bases[0];const location=target.pages.flatMap(p=>p.locations)[0];
    if(location && !opportunities.some(o=>o.intent.startsWith('Local'))) opportunities[5]={...opportunities[5],title:`${effective(base).topic} in ${location}: local planning questions`,topic:`${effective(base).topic} ${location}`,intent:'Local / commercial investigation',pageType:'Local supporting guide',why:'Use the location declared on the target site. Add useful local specifics only for actual service coverage; avoid near-identical city pages.',evidence:[{url:base.url,quote:effective(base).evidence||base.title},{url:target.pages.find(p=>p.locations.includes(location)).url,quote:`Declared addressLocality: ${location}`}],basis:'Target-declared location and retrieved service; verify business coverage'};
  }
  return opportunities.slice(0,6);
}
export function footprintTable(target,competitors) {
  const factors=[['Pages discovered during this analysis',s=>s.stats.discovered],['HTML URL requests / limit',s=>`${s.stats.htmlRequests}/${s.limit}`],['Pages successfully crawled',s=>s.stats.crawled],['Useful page candidates retrieved',s=>s.stats.usefulPages],['Service page candidates',s=>s.stats.services],['Location page candidates',s=>s.stats.locations],['Blog/resource page candidates',s=>s.stats.blogs],['Distinct topic labels (not quality)',s=>new Set(s.pages.map(p=>normalize(effective(p).topic))).size],['Pages with supporting detail',s=>s.pages.filter(p=>p.h2.length&&p.wordCount>=150).length],['Pages with declared dates',s=>s.stats.datedPages],['FAQ signals',s=>s.stats.faqPages],['Trust/review wording',s=>s.stats.trustPages],['Case study candidates',s=>s.stats.caseStudies],['Blog-to-service content links',s=>s.stats.blogToService],['Location-to-service links',s=>s.stats.locationToService],['Average internal links',s=>s.stats.averageInternalLinks],['Domain Competitive Score',s=>s.score.overall],['Crawl coverage note',s=>s.stopped||'Discovery frontier exhausted; not proof of complete site coverage']];
  return factors.map(([factor,get])=>({factor,target:get(target),competitors:competitors.map(c=>c.analysis?.pages.length?get(c.analysis):'Unavailable')}));
}
