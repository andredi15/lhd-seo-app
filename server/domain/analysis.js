import { normalize, tokens, matchKeyword, concepts, inferIntent } from '../keywords.js';
import { urlKey } from './discovery.js';
export const groups = ['Core services','Supporting subtopics','Local/service-area content','Informational content','FAQs','Case studies','Commercial pages','General pages'];
const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
const ratio = (n,d) => d ? Math.round(n/d*100) : 0;
export function classifyPage(page) {
  const subject = `${new URL(page.url).pathname} ${page.title} ${page.h1.join(' ')}`;
  const blog = /\/blog\b|\/resources?\b|\/guides?\b|\/articles?\b|how to|\bguide\b/i.test(subject) || page.schemaTypes.some(t=>/Article|BlogPosting/.test(t));
  const service = !blog && /service|solution|renovat|landscap|plumb|repair|installation|design|consulting|treatment/i.test(subject);
  const location = /\/(locations?|service-areas?|areas-we-serve|cities)\b/i.test(subject) || (service && (page.locations.some(p=>subject.toLowerCase().includes(p.toLowerCase())) || /\b(?:in|near)\s+[A-Z]/.test(page.h1.join(' '))));
  const categories = [];
  if(service) categories.push('Core services');
  if(location) categories.push('Local/service-area content');
  if(blog) categories.push('Informational content');
  if(/\bfaq|frequently asked|common questions/i.test(subject) || page.schemaTypes.includes('FAQPage')) categories.push('FAQs');
  if(/case stud|our projects|portfolio|project examples|success stor/i.test(subject)) categories.push('Case studies');
  if(!blog && (service || /pricing|products?|shop|book|contact|quote/i.test(subject))) categories.push('Commercial pages');
  if(!categories.length && new URL(page.url).pathname !== '/' && page.h2.length>1) categories.push('Supporting subtopics');
  if(!categories.length) categories.push('General pages');
  const label=(page.h1[0] || page.title || new URL(page.url).pathname).split(/\s[|–—]\s/)[0].trim();
  return {categories,topic:label,method:'Rule-based inference',evidence:page.h1[0]||page.title||page.intro.slice(0,150)};
}
function duplicates(pages,field) {
  const map=new Map(); for(const page of pages) {const key=normalize(page[field]);if(!key)continue;const row=map.get(key)||{value:page[field],urls:[]};row.urls.push(page.url);map.set(key,row);}
  return [...map.values()].filter(r=>r.urls.length>1);
}
export function analyzeDomain(crawl, keywords = [], localOverride) {
  const pages=crawl.pages.map(p=>({...p,classification:classifyPage(p),indexableSignal:!p.robots.some(r=>/\bnoindex\b|\bnone\b/i.test(r)),topics:concepts(p).filter(t=>t.present)}));
  const aliases = new Map(); for(const p of pages) {aliases.set(urlKey(p.url),p.url);aliases.set(urlKey(p.requestedUrl),p.url);for(const r of p.redirects) aliases.set(urlKey(r.from),p.url);}
  const edges=[];
  for(const page of pages) for(const l of page.internalLinks) {
    const to=aliases.get(urlKey(l.url)) || l.url;
    if(urlKey(to)===urlKey(page.url))continue;
    edges.push({from:page.url,to,anchor:l.anchor,inContent:l.inContent,inNavigation:l.inNavigation||false,nofollow:/\bnofollow\b/.test(l.rel)});
  }
  const depth=new Map(); if(pages[0])depth.set(pages[0].url,0);
  const queue=pages[0]?[pages[0].url]:[];
  while(queue.length){const from=queue.shift();for(const e of edges.filter(e=>e.from===from)){if(!pages.some(p=>p.url===e.to)||depth.has(e.to))continue;depth.set(e.to,depth.get(from)+1);queue.push(e.to);}}
  for(const page of pages) {
    const inbound=edges.filter(e=>e.to===page.url);page.inboundSources=[...new Set(inbound.map(e=>e.from))];page.inboundCount=page.inboundSources.length;page.depth=depth.get(page.url) ?? null;
    page.contentInbound=[...new Set(inbound.filter(e=>e.inContent).map(e=>e.from))];
    page.orphanLike=page.url!==pages[0]?.url && page.inboundCount===0 && crawl.discovered.some(d=>urlKey(d.url)===urlKey(page.url)&&d.sources.includes('Sitemap'));
    page.usefulCandidate=page.wordCount>=80 && page.indexableSignal && (!page.canonical||urlKey(page.canonical)===urlKey(page.url));
  }
  const services=pages.filter(p=>p.classification.categories.includes('Core services'));
  const blog=pages.filter(p=>p.classification.categories.includes('Informational content'));
  const locations=pages.filter(p=>p.classification.categories.includes('Local/service-area content'));
  const commercial=pages.filter(p=>p.classification.categories.includes('Commercial pages'));
  const linksToServices=edges.filter(e=>services.some(p=>p.url===e.to));
  const blogToService=linksToServices.filter(e=>blog.some(p=>p.url===e.from)&&e.inContent);
  const locationToService=linksToServices.filter(e=>locations.some(p=>p.url===e.from));
  const local=localOverride ?? (locations.length>0 || pages.some(p=>p.signals.localSchema) || (pages[0] && keywords.some(k=>inferIntent(k,pages[0]).local)) || false);
  const duplicateTitles=duplicates(pages,'title'),duplicateDescriptions=duplicates(pages,'description');
  const issues=[];
  const add=(id,priority,issue,why,fix,affected)=> {if(!affected.length)return;issues.push({id,priority,element:'Domain',issue,why,fix,evidence:affected.map(p=>typeof p==='string'?p:p.url).join('\n'),sourceUrl:crawl.url,affectedUrls:affected.map(p=>typeof p==='string'?p:p.url),basis:'Observed within the bounded crawl'});};
  add('domain-http','Critical','Review failed HTML requests','Failed URLs can interrupt navigation or prevent content retrieval; a blocked crawl is not proof of a broken page.','Check the listed HTTP responses and bot restrictions. Repair real broken destinations or update links, preserving intentional access restrictions.',crawl.failures.filter(f=>f.status>=400));
  add('domain-noindex','High Impact','Confirm indexability of intended landing pages','A noindex directive requests exclusion from search; it may be intentional.','Remove noindex only from pages intended for organic discovery after checking publishing intent.',pages.filter(p=>!p.indexableSignal));
  add('domain-title','High Impact','Add missing page titles','Without descriptive titles, page purpose is harder to communicate.','Write unique, accurate titles for the affected pages.',pages.filter(p=>!p.title));
  add('domain-dupe-title','High Impact','Differentiate duplicate page titles','Identical titles can obscure distinct services or locations.','Review whether pages need distinct titles or consolidation; do not differentiate identical content artificially.',duplicateTitles.flatMap(d=>d.urls));
  add('domain-support','High Impact','Strengthen links into important pages','Important service pages have fewer than two referring pages in this sample. Uncrawled links may exist.','Add relevant links from existing related resources, navigation or location pages. Use accurate anchors.',services.filter(p=>p.url!==pages[0]?.url&&p.inboundCount<2));
  add('domain-orphan','High Impact','Investigate sitemap-only pages with no observed inbound links','These are orphan-like within the sample, not confirmed site-wide orphans.','Verify wider site navigation, then link relevant pages into appropriate clusters.',pages.filter(p=>p.orphanLike));
  add('domain-deep','Medium Impact','Reduce unnecessary click depth','Important pages at four or more observed link steps may be hard to reach.','Connect important services to relevant higher-level pages without flattening useful hierarchy.',commercial.filter(p=>p.depth>=4));
  add('domain-thin','Medium Impact','Check whether these pages give visitors enough information','We found very little readable text on these pages. A short booking, contact or form page may be perfectly appropriate, so this is a prompt to review the page rather than a reason to make it longer.','Open each page as a visitor. If its purpose and next step are already clear, leave it concise. If they are not, add a brief explanation of what the page is for, who it helps, what to expect and what to do next.',pages.filter(p=>p.wordCount<150));
  add('domain-description','Medium Impact','Complete missing meta descriptions','Descriptions can clarify the page benefit in search snippets.','Describe the actual content and appropriate next step.',pages.filter(p=>!p.description));
  add('domain-dupe-description','Medium Impact','Review repeated meta descriptions','Repeated snippets may fail to explain different page purposes.','Use unique descriptions where the underlying content differs.',duplicateDescriptions.flatMap(d=>d.urls));
  add('domain-h1','Medium Impact','Review primary heading consistency','Missing or multiple H1s can make the main purpose less clear.','Use a descriptive primary heading and a logical subordinate outline.',pages.filter(p=>p.h1.length!==1));
  add('domain-canonical','Medium Impact','Review canonical declarations','Missing or different canonicals need context; they do not automatically prove a problem.','Confirm each preferred URL and consolidate only actual duplicates.',pages.filter(p=>!p.canonical||urlKey(p.canonical)!==urlKey(p.url)));
  add('domain-links','Medium Impact','Review pages without outgoing internal links','Relevant navigation helps visitors continue their journey.','Add useful links to real related pages, respecting the page’s purpose.',pages.filter(p=>!p.totalInternalLinks));
  if(local)add('domain-local','Medium Impact','Review local contact and service-area clarity','Visitors need verified contact information and a clear area served.','Add accurate service-area, contact or address details where they are missing; do not invent locations.',commercial.filter(p=>!p.signals.contact||(!p.signals.serviceArea&&!p.locations.length)));
  const stats={discovered:crawl.discovered.length,crawled:pages.length,htmlRequests:crawl.requestCount,failed:crawl.failures.length,usefulPages:pages.filter(p=>p.usefulCandidate).length,services:services.length,locations:locations.length,blogs:blog.length,faqPages:pages.filter(p=>p.signals.faq).length,caseStudies:pages.filter(p=>p.classification.categories.includes('Case studies')).length,trustPages:pages.filter(p=>p.signals.trust||p.signals.reviews).length,conversionPages:pages.filter(p=>p.signals.cta).length,thinPages:pages.filter(p=>p.wordCount<150).length,missingTitles:pages.filter(p=>!p.title).length,missingDescriptions:pages.filter(p=>!p.description).length,duplicateTitleGroups:duplicateTitles.length,duplicateDescriptionGroups:duplicateDescriptions.length,totalInternalLinks:pages.reduce((n,p)=>n+p.totalInternalLinks,0),averageInternalLinks:Math.round(mean(pages.map(p=>p.totalInternalLinks))*10)/10,descriptiveAnchors:ratio(edges.filter(e=>e.anchor.length>4&&!/^(click here|read more|learn more)$/i.test(e.anchor)).length,edges.length),blogToService:blogToService.length,locationToService:locationToService.length,orphanLike:pages.filter(p=>p.orphanLike).length,breadcrumbPages:pages.filter(p=>p.signals.breadcrumbs).length,datedPages:pages.filter(p=>p.freshness.length).length};
  const result={...crawl,pages,stats,localRelevant:local,edges,blogToService,locationToService,duplicateTitles,duplicateDescriptions,issues};
  result.score=scoreDomain(result,keywords); return result;
}
export function scoreDomain(site,keywords) {
  const p=site.pages,n=p.length;
  if(!n)return {overall:null,categories:[],label:'Domain Competitive Score',version:'domain-1.0',methodology:'Unavailable: no HTML pages retrieved.'};
  const avgChecks=checks=>Math.round(mean(checks)*100);
  const services=p.filter(p=>p.classification.categories.includes('Core services'));
  const supporting=p.filter(p=>p.classification.categories.some(c=>['Informational content','Supporting subtopics','FAQs','Case studies'].includes(c)));
  const topicCoverage=keywords.length ? mean(keywords.map(k=>Math.max(...p.map(p=>matchKeyword(`${p.title} ${p.h1.join(' ')} ${p.body}`,k).coverage)))) : mean(p.map(p=>p.h1.length===1&&p.h2.length>0?1:.4));
  const clusterSupport=services.length?mean(services.map(s=>site.edges.some(e=>e.to===s.url&&e.inContent&&supporting.some(p=>p.url===e.from))?1:0)):mean(p.map(p=>p.h2.length>0?1:0));
  const dupTitleUrls=new Set(site.duplicateTitles.flatMap(d=>d.urls));const dupDescUrls=new Set(site.duplicateDescriptions.flatMap(d=>d.urls));
  const local=site.localRelevant;
  const categories=[
    {name:'Topical Coverage',weight:local?25:30,score:Math.round(topicCoverage*70+clusterSupport*30),basis:'70% supplied-topic lexical coverage (or clear outlines if no topics); 30% observed supporting-content links to service pages (or outlines on non-service sites). More URLs alone earn no points.'},
    {name:'Site Architecture',weight:20,score:avgChecks(p.map(p=>((p.depth!==null&&p.depth<=3?1:0)+(!p.orphanLike?1:0)+(p.signals.breadcrumbs||p.depth===0||p.internalLinks.some(l=>l.inNavigation)?1:0))/3)),basis:'Equal checks per retrieved page: reachable within three observed clicks, no orphan-like flag, and breadcrumb/navigation or homepage context.'},
    {name:'Content Quality & Depth',weight:local?20:25,score:avgChecks(p.map(p=>((p.wordCount>=150?1:0)+(p.h2.length>0?1:0)+(p.classification.categories.includes('Core services')?(p.signals.trust||p.signals.faq||p.topics.length>=3?1:0):(p.h3.length>0||p.faqs.length>0||p.schemaTypes.length>0?1:0)))/3)),basis:'Equal proxies: sufficient extractable text for review, section headings, and supporting detail signals. No additional credit for word count beyond the diagnostic threshold; not a verified quality judgment.'},
    {name:'Internal Linking',weight:15,score:Math.round((site.stats.descriptiveAnchors*.5)+(mean(p.map(x=>(x.depth===0||x.inboundCount>=2)?100:x.inboundCount?50:0))*.5)),basis:'50% descriptive observed anchors; 50% referring-page support (homepage exempt, two sources earns full support credit).'},
    ...(local?[{name:'Local SEO Coverage',weight:10,score:avgChecks((services.length?services:p).map(p=>((p.signals.serviceArea||p.locations.length?1:0)+(p.signals.contact?1:0)+(p.signals.localSchema?1:0))/3)),basis:'Service-area/location wording, contact and local schema on service pages (or all pages when none identified). Does not reward creating extra city pages.'}]:[]),
    {name:'Technical Consistency',weight:10,score:Math.round(avgChecks(p.map(p=>((p.title?1:0)+(p.description?1:0)+(p.h1.length===1?1:0)+(p.indexableSignal?1:0)+(p.canonical&&urlKey(p.canonical)===urlKey(p.url)?1:0)+(!dupTitleUrls.has(p.url)&&!dupDescUrls.has(p.url)?1:0))/6))*(n/(n+site.failures.length))),basis:'Metadata, one H1, index directive, self-canonical and metadata uniqueness, multiplied by successful page-attempt share.'}
  ];
  return {overall:Math.round(categories.reduce((v,c)=>v+c.score*c.weight/100,0)),categories,label:'Domain Competitive Score',version:'domain-1.0',methodology:'Crawl-based diagnostic score for this sample. Separate from Page SEO Optimization Score; not domain authority, backlink strength, rankings or indexed-page count. Non-local weighting reallocates 5% each to topical coverage and content. AI classifications do not change deterministic scoring.'};
}
