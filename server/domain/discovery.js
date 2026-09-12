import * as cheerio from 'cheerio';
import { setTimeout as delay } from 'node:timers/promises';
import { normalizeUrl, requestPublic, robotsPolicy, crawlPage } from '../crawler.js';
import { parsePage } from '../parser.js';

export function domainOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter a target domain.');
  const raw = value.trim();
  return new URL(normalizeUrl(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)).origin + '/';
}
export const domainKey = value => new URL(value).hostname.replace(/^www\./i,'').toLowerCase();
export function candidateUrl(value, base) {
  try {
    const u = new URL(normalizeUrl(new URL(value,base).href));
    if (domainKey(u.href) !== domainKey(base)) return null;
    for (const k of [...u.searchParams.keys()]) if (/^(utm_.+|gclid|fbclid|msclkid|ref|mc_cid|mc_eid)$/i.test(k)) u.searchParams.delete(k);
    if (u.search || /\.(pdf|jpe?g|png|gif|svg|webp|ico|mp4|mp3|zip|xml|gz|css|js|woff2?|docx?|xlsx?)$/i.test(u.pathname)) return null;
    if (/\/(wp-admin|wp-login\.php|login|logout|signin|sign-in|cart|checkout|account|my-account|tag|tags|author|attachment|feed|search|page\/\d+)(\/|$)/i.test(u.pathname)) return null;
    return u.href;
  } catch { return null; }
}
export const urlKey = url => { const u = new URL(url); return `${u.hostname.replace(/^www\./i,'')}${u.pathname.replace(/\/+$/,'') || '/'}`; };
export function parseSitemap(xml, base) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Sitemap with a DTD or entities is not supported.');
  const $ = cheerio.load(xml,{xmlMode:true});
  const root = $.root().children().first()[0]?.name?.split(':').pop();
  if (!['urlset','sitemapindex'].includes(root)) throw new Error('Resource is not a sitemap XML document.');
  const locs = $('*').filter((_,e)=>e.name?.split(':').pop()==='loc').map((_,e)=>$(e).text().trim()).get().slice(0,5000);
  return { isIndex: root === 'sitemapindex', urls: locs.map(v=>{try{return normalizeUrl(new URL(v,base).href);}catch{return null;}}).filter(Boolean) };
}
function priority(url, navigation = false) {
  const path = new URL(url).pathname;
  return (navigation ? 30 : 0) + (/service|solution|location|area|contact|about|project|case-stud/i.test(path) ? 20 : 0) - (/category|archive|privacy|terms|cookie/i.test(path) ? 35 : 0) - path.split('/').filter(Boolean).length;
}
export function validateDomainInput(input) {
  const targetUrl = domainOrigin(input.targetDomain || input.targetUrl);
  const raw = input.competitorDomains || input.competitorUrls || [];
  if (!Array.isArray(raw) || raw.length > 5 || raw.some(x=>typeof x!=='string')) throw new Error('Enter up to five competitor domains.');
  const seen = new Set([domainKey(targetUrl)]); const competitorUrls = [];
  for (const value of raw.filter(v=>v.trim())) {const origin=domainOrigin(value); if(!seen.has(domainKey(origin))) {competitorUrls.push(origin);seen.add(domainKey(origin));}}
  const list = Array.isArray(input.keywords) ? input.keywords : typeof input.keywords === 'string' ? input.keywords.split(/[\n,]+/) : [];
  if (list.some(k=>typeof k!=='string')) throw new Error('Keywords or topics must be text.');
  const keywords = [...new Set(list.map(k=>k.trim()).filter(Boolean))];
  if (keywords.length>20 || keywords.some(k=>k.length>160)) throw new Error('Use up to 20 topics, each no longer than 160 characters.');
  const crawlLimit = Number(input.crawlLimit ?? 25);
  if (![10,25,50].includes(crawlLimit)) throw new Error('Choose a crawl limit of 10, 25 or 50 pages per domain.');
  return { mode:'domain', targetUrl, keywords, competitorUrls, crawlLimit, duplicatesRemoved:raw.filter(v=>v.trim()).length-competitorUrls.length };
}

/** One sequential, cached session per domain. Robots and sitemap fetches are separately bounded. */
export async function crawlDomain(origin, limit, emit = ()=>{}, signal, options = {}) {
  const requestImpl = options.request || requestPublic;
  const paceMs = options.paceMs ?? 500;
  const started = Date.now(); const deadlineMs = options.deadlineMs ?? 180000;
  const parentSignal=signal;
  signal=AbortSignal.any([...(parentSignal?[parentSignal]:[]),AbortSignal.timeout(deadlineMs)]);
  const cache = new Map(); const robotsCache = new Map(); const pageRequests = new Set(); const records = new Map(); const pages = []; const failures = []; const sitemapLog = []; const warnings = [];
  let decodedBytes = 0; let lastRequest = 0; let stopped = '';
  const request = async (url,config={}) => {
    url=normalizeUrl(url);
    if(cache.has(url)) return cache.get(url);
    if(Date.now()-started>deadlineMs || decodedBytes>=24000000) { const e=new Error('Domain time or 24 MB transfer budget reached.'); e.code='BUDGET'; throw e; }
    const promise=(async()=> {
      const wait=Math.max(0,paceMs-(Date.now()-lastRequest)); if(wait) await delay(wait,undefined,{signal});
      signal?.throwIfAborted(); lastRequest=Date.now();
      const remaining=24000000-decodedBytes;
      const res=await requestImpl(url,{...config,limit:Math.min(config.limit||3000000,remaining),signal}); decodedBytes += res.decodedBytes ?? res.buffer.length; return res;
    })(); cache.set(url,promise); return promise;
  };
  const discover = (raw,source,depth=null,nav=false) => {
    const url=candidateUrl(raw,origin); if(!url) return;
    const key=urlKey(url); const record=records.get(key);
    if(record) {if(!record.sources.includes(source)) record.sources.push(source); if(depth!==null && (record.discoveryDepth===null || depth<record.discoveryDepth)) record.discoveryDepth=depth; record.priority=Math.max(record.priority,priority(url,nav));return;}
    if(records.size>=5000) return;
    records.set(key,{url,key,sources:[source],discoveryDepth:depth,priority:priority(url,nav),attempted:false});
  };
  discover(origin,'Homepage',0,true);
  const beforePageRequest = url => {
    if(!cache.has(url) && !pageRequests.has(url)) {
      if(pageRequests.size>=limit) {const e=new Error('Configured HTML URL request limit reached (redirects included).');e.code='LIMIT';throw e;}
      pageRequests.add(url);
    }
  };
  async function visit(record) {
    record.attempted=true;
    emit(`Crawling ${new URL(origin).hostname}: ${pageRequests.size}/${limit} URL requests · ${pages.length} pages retrieved`);
    try {
      const result=await crawlPage(record.url,{signal,request,robotsCache,allowUrl:u=>domainKey(u)===domainKey(origin),beforePageRequest});
      const page=parsePage(result); const key=urlKey(page.url);
      record.finalUrl=page.url;
      for(const r of result.redirects) discover(r.to,'Redirect',record.discoveryDepth);
      if(pages.some(p=>urlKey(p.url)===key)) return;
      const final=records.get(key); if(final) final.attempted=true;
      // Parse full HTML once. Store bounded evidence and link inventories in the domain report.
      page.domainDepth=record.discoveryDepth;
      page.discoverySources=[...record.sources];
      const sameSiteLinks=[...page.internalLinks,...page.externalLinks.filter(l=>domainKey(l.url)===domainKey(origin))];
      sameSiteLinks.forEach(l=>discover(l.url, page.url, record.discoveryDepth===null?null:record.discoveryDepth+1,l.inNavigation));
      page.internalLinks=sameSiteLinks.slice(0,1000);
      page.linkInventoryTruncated=sameSiteLinks.length>1000;
      page.totalInternalLinks=sameSiteLinks.length;
      page.externalLinks=[]; page.schema=[]; page.images=[];
      page.textTruncated=page.textTruncated || page.body.length>8000; page.body=page.body.slice(0,8000);
      page.headings=page.headings.slice(0,100); page.h2=page.h2.slice(0,60);page.h3=page.h3.slice(0,60);page.faqs=page.faqs.slice(0,30);
      pages.push(page);
    } catch(error) {
      if(parentSignal?.aborted) throw error;
      if(signal.aborted) {stopped='Per-domain three-minute time budget reached; this is a partial crawl.';return;}
      if(['LIMIT','BUDGET'].includes(error.code)) {stopped=error.message;return;}
      failures.push({url:record.url,status:error.status ?? null,error:error.message,redirects:error.redirects || []});
      if(failures.length>=8 && !pages.length) stopped='Stopped after eight unsuccessful page attempts.';
    }
  }
  await visit(records.values().next().value);
  if(!pages.length) return {url:origin,pages,failures,discovered:[...records.values()],sitemaps:sitemapLog,requestCount:pageRequests.size,limit,stopped:stopped||'Homepage unavailable; domain discovery could not proceed.',warnings};

  emit(`Discovering sitemaps for ${new URL(origin).hostname}`);
  const finalOrigin=new URL(pages[0].url).origin;
  let declared=[];
  try { const policy=await (robotsCache.get(finalOrigin) || robotsPolicy(finalOrigin,signal,request)); declared=policy.sitemaps || []; } catch {}
  const sitemapQueue=[...new Set([...declared,`${finalOrigin}/sitemap.xml`,`${finalOrigin}/sitemap_index.xml`])];
  const sitemapSeen=new Set();
  while(sitemapQueue.length && sitemapSeen.size<6 && !stopped) {
    let url=sitemapQueue.shift(); if(sitemapSeen.has(url) || domainKey(url)!==domainKey(origin)) continue; sitemapSeen.add(url);
    try {
      for(let hop=0;hop<4;hop++) {
        const policy=await (robotsCache.get(new URL(url).origin) || robotsPolicy(new URL(url).origin,signal,request));
        if(policy.parser?.isAllowed(url,'LighthouseSEOSpecialist')===false) throw new Error('Sitemap is disallowed by robots.txt.');
        const wait=policy.parser?.getCrawlDelay('LighthouseSEOSpecialist')||0;
        if(wait>10) throw new Error('Sitemap crawl-delay exceeds ten seconds.');
        if(wait>0) await delay(wait*1000,undefined,{signal});
        const res=await request(url,{limit:2000000});
        if([301,302,303,307,308].includes(res.status) && res.headers.location) {url=normalizeUrl(new URL(res.headers.location,url).href);if(domainKey(url)!==domainKey(origin))throw new Error('Sitemap redirect outside domain scope.');continue;}
        if(res.status!==200) throw new Error(`HTTP ${res.status}`);
        const parsed=parseSitemap(res.buffer.toString('utf8'),url);
        if(parsed.isIndex) sitemapQueue.push(...parsed.urls.filter(u=>domainKey(u)===domainKey(origin)).slice(0,20));
        else parsed.urls.forEach(u=>discover(u,'Sitemap'));
        sitemapLog.push({url,status:'Retrieved',entries:parsed.urls.length,index:parsed.isIndex});break;
      }
    } catch(error) {if(parentSignal?.aborted) throw error; if(signal.aborted)stopped='Per-domain three-minute time budget reached; this is a partial crawl.';if(error.code==='BUDGET')stopped=error.message;sitemapLog.push({url,status:'Unavailable',error:error.message});}
  }
  while(pageRequests.size<limit && !stopped) {
    const next=[...records.values()].filter(r=>!r.attempted).sort((a,b)=>b.priority-a.priority || (a.discoveryDepth??99)-(b.discoveryDepth??99))[0];
    if(!next) break; await visit(next);
  }
  if(!stopped && pageRequests.size>=limit && [...records.values()].some(r=>!r.attempted)) stopped='Configured crawl limit reached; undiscovered and uncrawled pages may change findings.';
  if(records.size>=5000) warnings.push('Discovery inventory capped at 5,000 candidate URLs.');
  if(sitemapQueue.length) warnings.push('Sitemap discovery capped at six XML documents; large sitemap indexes may be only partly explored.');
  if(pages.some(p=>p.linkInventoryTruncated)) warnings.push('Link graph retains at most 1,000 links per page; some link support may be unobserved.');
  return {url:origin,pages,failures,discovered:[...records.values()].map(({priority,...r})=>r),sitemaps:sitemapLog,requestCount:pageRequests.size,limit,stopped,warnings,decodedBytes,elapsedMs:Date.now()-started};
}
