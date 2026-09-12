import test from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import {candidateUrl,urlKey,domainOrigin,validateDomainInput,parseSitemap,crawlDomain} from '../server/domain/discovery.js';
import {analyzeDomain} from '../server/domain/analysis.js';
import {buildDomainReport} from '../server/domain/report.js';
import {validateClassifications,classifyDomainAI} from '../server/domain/ai.js';
import {compareDomains,planContent} from '../server/domain/planning.js';
import {renderReport,renderHistory} from '../public/render.js';
import {buildPrintableHtml,recommendationText} from '../public/export.js';

const paragraph='We provide renovation services for homeowners. Our process begins with a consultation and a written scope. We explain the design and installation options before work starts. Customers can ask questions about materials, access and maintenance. Project examples explain actual decisions and the work involved. ';
function html(title,links=[],{description='Plan your renovation with practical guidance, a clear scope and useful project examples.',schema='',h1=title,body='',navigation=[]}={}) {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"><meta name="viewport" content="width=device-width"><link rel="canonical" href="${links.canonical||''}">${schema?`<script type="application/ld+json">${schema}</script>`:''}</head><body><nav>${navigation.map(l=>`<a href="${l}">Explore ${l}</a>`).join('')}</nav><main><h1>${h1}</h1><p>${body||paragraph.repeat(4)}</p><h2>Process and project details</h2><h3>Frequently asked questions</h3>${links.map(l=>`<a href="${l}">Renovation service details</a>`).join('')}</main></body></html>`;
}
function network(origin='https://renovation.example') {
  const pages={
    '/':html('Renovation Services',['/contact/'],{navigation:['/services/renovation/','/blog/permits/','/locations/toronto/','/broken/','/services/renovation/?utm_source=menu','/cart/','/tag/news/','/manual.pdf','https://outside.example/']}),
    '/services/renovation/':html('Renovation Services',['/contact/']),
    '/blog/permits/':html('Renovation Permit Guide',['/services/renovation/'],{schema:'{"@type":"BlogPosting","datePublished":"2025-04-01"}'}),
    '/locations/toronto/':html('Renovation Services in Toronto',['/services/renovation/'],{schema:'{"@type":"LocalBusiness","name":"Renovation Co","address":{"@type":"PostalAddress","addressLocality":"Toronto","streetAddress":"1 Example Street"}}'}),
    '/contact/':html('Contact the renovation team',[]),
    '/sitemap-only/':html('Basement Renovation Services',[]),
    '/private/':html('Private page',[])
  };
  const calls=[];
  const request=async url=>{
    calls.push(url);const path=new URL(url).pathname;
    if(path==='/robots.txt')return response(200,`User-agent: *\nDisallow: /private/\nSitemap: ${origin}/sitemap.xml`,'text/plain');
    if(path==='/sitemap.xml')return response(200,`<sitemapindex><sitemap><loc>${origin}/pages.xml</loc></sitemap></sitemapindex>`,'application/xml');
    if(path==='/pages.xml')return response(200,`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/sitemap-only/','/private/','/services/renovation/','/services/renovation/?utm_source=sitemap'].map(p=>`<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`,'application/xml');
    return response(pages[path]?200:404,pages[path]||'Not found','text/html');
  };return {request,calls,pages};
}
function response(status,text,type='text/html',headers={}){return {status,headers:{'content-type':type,...headers},buffer:Buffer.from(text),bytes:Buffer.byteLength(text),decodedBytes:Buffer.byteLength(text),responseMs:1};}

test('domain inputs preserve Page Analysis contract and normalize equivalent hosts',()=>{
  const input=validateDomainInput({targetDomain:'example.com/service/',competitorDomains:['https://www.example.com','other.example','https://other.example/path'],crawlLimit:25});
  assert.equal(input.targetUrl,'https://example.com/');assert.deepEqual(input.keywords,[]);assert.deepEqual(input.competitorUrls,['https://other.example/']);assert.equal(input.duplicatesRemoved,2);
  for(const crawlLimit of [0,11,100,'unlimited'])assert.throws(()=>validateDomainInput({targetDomain:'example.com',crawlLimit}));
  assert.throws(()=>domainOrigin('file:///etc/passwd'));assert.equal(domainOrigin('http://example.com/path'),'http://example.com/');
});
test('candidate discovery removes tracking, deduplicates trailing slashes and excludes traps',()=>{
  assert.equal(candidateUrl('/services/?utm_source=google#top','https://example.com/'),'https://example.com/services/');
  assert.equal(urlKey('http://www.example.com/services/'),urlKey('https://example.com/services'));
  for(const url of ['/cart/','/tag/news/','/account/','/manual.pdf','/a?id=1','https://sub.example.com/a','javascript:alert(1)'])assert.equal(candidateUrl(url,'https://example.com/'),null,url);
});
test('sitemap parser handles indexes, namespaces and rejects non-XML and entity declarations',()=>{
  assert.deepEqual(parseSitemap('<s:sitemapindex xmlns:s="x"><s:sitemap><s:loc>https://example.com/pages.xml</s:loc></s:sitemap></s:sitemapindex>','https://example.com/'),{isIndex:true,urls:['https://example.com/pages.xml']});
  assert.throws(()=>parseSitemap('<html>No sitemap</html>','https://example.com/'));
  assert.throws(()=>parseSitemap('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///a">]><urlset/>','https://example.com/'));
});
test('bounded crawl uses sitemap index, navigation, robots and cache without external traversal',async()=>{
  const net=network();const result=await crawlDomain('https://renovation.example/',10,()=>{},undefined,{request:net.request,paceMs:0});
  assert.ok(result.pages.some(p=>p.url.endsWith('/sitemap-only/')));assert.ok(result.sitemaps.some(s=>s.index));assert.ok(result.requestCount<=10);
  assert.equal(new Set(net.calls).size,net.calls.length,'one network request per exact URL');
  assert.ok(!net.calls.some(u=>u.includes('outside.example')||u.includes('/cart/')||u.includes('utm_source')||u.includes('/private/')));
  assert.ok(result.failures.some(f=>f.status===404));assert.ok(result.failures.some(f=>/disallowed/.test(f.error)));
});
test('request limit counts redirects and HTTP failures and never exceeds selected budget',async()=>{
  const calls=[];const request=async url=>{calls.push(url);const path=new URL(url).pathname;if(path==='/robots.txt'||path.endsWith('.xml'))return response(404,'');if(path==='/')return response(200,html('Renovation Services',Array.from({length:40},(_,i)=>`/service-${i}/`)));if(path==='/service-0/')return response(302,'','text/html',{location:'/redirected/'});return response(404,'');};
  const result=await crawlDomain('https://example.com/',10,()=>{},undefined,{request,paceMs:0});
  assert.equal(result.requestCount,10);assert.ok(result.discovered.length>10);assert.match(result.stopped,/limit/);assert.equal(calls.filter(u=>!u.endsWith('/robots.txt')&&!u.endsWith('.xml')).length,10);
});
test('external homepage redirect is not followed',async()=>{
  const calls=[];const result=await crawlDomain('https://example.com/',10,()=>{},undefined,{paceMs:0,request:async u=>{calls.push(u);return u.endsWith('/robots.txt')?response(404,''):response(302,'','text/html',{location:'https://outside.example/'});}});
  assert.equal(result.pages.length,0);assert.ok(!calls.some(u=>u.includes('outside')));assert.match(result.failures[0].error,/scope/);
});
test('domain graph detects referring sources, supporting relationships, duplicate metadata and orphan-like pages',async()=>{
  const net=network();const crawl=await crawlDomain('https://renovation.example/',10,()=>{},undefined,{request:net.request,paceMs:0});const site=analyzeDomain(crawl,['renovation services Toronto']);
  const service=site.pages.find(p=>p.url.endsWith('/services/renovation/'));assert.ok(service.inboundCount>=3);assert.equal(service.depth,1);
  assert.ok(site.blogToService.length);assert.ok(site.locationToService.length);assert.equal(site.pages.find(p=>p.url.endsWith('/sitemap-only/')).orphanLike,true);
  assert.equal(site.pages.find(p=>p.url.endsWith('/sitemap-only/')).depth,null);assert.ok(site.duplicateTitles.length);assert.ok(site.duplicateDescriptions.length);assert.ok(site.stats.locations>0);assert.ok(site.stats.blogs>0);
  assert.equal(site.score.categories.reduce((s,c)=>s+c.weight,0),100);assert.ok(site.localRelevant);assert.ok(site.score.overall>=0&&site.score.overall<=100);
  const nonlocal=analyzeDomain(crawl,[],false);assert.equal(nonlocal.score.categories.reduce((s,c)=>s+c.weight,0),100);assert.ok(!nonlocal.score.categories.some(c=>c.name==='Local SEO Coverage'));
  const filler=analyzeDomain({...crawl,pages:crawl.pages.map(p=>({...p,wordCount:p.wordCount+5000,body:p.body+' filler'.repeat(5000)}))},['renovation services Toronto']);assert.equal(filler.score.categories.find(c=>c.name==='Content Quality & Depth').score,site.score.categories.find(c=>c.name==='Content Quality & Depth').score);
});
test('domain AI rejects fabricated quotes and unrequested URLs',async()=>{
  const net=network();const crawl=await crawlDomain('https://renovation.example/',10,()=>{},undefined,{request:net.request,paceMs:0});const site=analyzeDomain(crawl,[]);const page=site.pages[0];
  const good={url:page.url,topic:'Renovation services',categories:['Core services'],quote:page.intro.slice(0,80)};
  assert.equal(validateClassifications({pages:[good,{...good,url:'https://evil.example/'},{...good,quote:'Never retrieved fabricated quote'}]},site.pages).length,1);
  const before=site.score.overall;
  const ai=await classifyDomainAI(site,[],()=>{},undefined,{apiKey:'test-only',model:'test-model',fetch:async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({pages:[good]})}]}]}))});
  assert.equal(ai.status,'partial');assert.equal(site.pages[0].aiClassification.topic,'Renovation services');assert.equal(site.score.overall,before);
});
test('full domain report isolates failed competitors and exports ten tabs and six sourced proposals',async()=>{
  const net=network();const input=validateDomainInput({targetDomain:'renovation.example',keywords:'renovation',competitorDomains:['failure.example'],crawlLimit:10});
  const r=await buildDomainReport(input,()=>{},undefined,{crawl:async(url,limit,emit,signal)=>url.includes('failure')?{pages:[],failures:[{error:'HTTP 403'}]}:crawlDomain(url,limit,emit,signal,{request:net.request,paceMs:0}),ai:async()=>({status:'disabled',classified:0,note:'Test fallback'})});
  assert.equal(r.mode,'domain');assert.match(r.competitors[0].error,/403/);assert.equal(r.opportunities.length,6);for(const o of r.opportunities)assert.ok(r.target.pages.some(p=>p.url===o.supportUrl));
  const $=cheerio.load(renderReport(r));assert.equal($('[role="tab"]').length,10);assert.ok($.text().includes('Pages discovered during this analysis'));assert.ok($.text().includes('Domain Competitive Score'));
  assert.ok(renderHistory([r]).includes('Domain Analysis'));assert.ok(buildPrintableHtml(r,[]).includes('Next 6 Content Opportunities'));assert.match(recommendationText(r),/Domain Competitive Score/);
});
test('unrelated competitor services are not promoted as relevant content opportunities',async()=>{
  const net=network();const crawl=await crawlDomain('https://renovation.example/',10,()=>{},undefined,{request:net.request,paceMs:0});const target=analyzeDomain(crawl,['renovation']);
  const alienPage={...crawl.pages[0],url:'https://other.example/services/pediatric-dentistry/',requestedUrl:'https://other.example/services/pediatric-dentistry/',title:'Pediatric Dentistry Services',h1:['Pediatric Dentistry Services'],body:'Pediatric dentistry for children. '.repeat(100),canonical:'',internalLinks:[]};
  const other=analyzeDomain({...crawl,url:'https://other.example/',pages:[alienPage]},[],target.localRelevant);const comparison=compareDomains(target,[{analysis:other}],['renovation']);
  assert.ok(comparison.gaps.every(g=>!g.relevant));assert.ok(!planContent(target,comparison,['renovation']).some(o=>/dentistry/i.test(o.title)));
});
