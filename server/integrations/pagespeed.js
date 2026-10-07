import {normalizeUrl, resolvePublic} from '../crawler.js';

const categories = ['performance','accessibility','best-practices','seo'];
const measurements = ['first-contentful-paint','largest-contentful-paint','speed-index','total-blocking-time','cumulative-layout-shift'];
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function parsePageSpeed(data, url, strategy) {
  const result = data?.lighthouseResult;
  if (!result || result.runtimeError) throw new Error('Google could not complete the Lighthouse run for this page.');
  return {
    url, strategy, source:'Google PageSpeed Insights / Lighthouse', kind:'lab',
    collectedAt:new Date().toISOString(), testedAt:result.fetchTime || null,
    finalUrl:result.finalDisplayedUrl || result.finalUrl || url, version:result.lighthouseVersion || null,
    scores:categories.map(id=>({id, value:finite(result.categories?.[id]?.score)?Math.round(result.categories[id].score*100):null, units:'/100'})),
    measurements:measurements.map(id=>{const a=result.audits?.[id];return {id,label:a?.title||id,value:finite(a?.numericValue)?a.numericValue:null,units:a?.numericUnit||null,display:finite(a?.numericValue)?a.displayValue||String(a.numericValue):'Unavailable'};}),
    diagnostics:Object.values(result.audits||{}).filter(a=>finite(a.score)&&a.score<0.9&&!measurements.includes(a.id)&&!['manual','notApplicable','informative'].includes(a.scoreDisplayMode)).sort((a,b)=>a.score-b.score).slice(0,12).map(a=>({id:a.id,title:a.title,description:a.description||'',display:a.displayValue||''})),
    warnings:Array.isArray(result.runWarnings)?result.runWarnings:[],
    fieldDataNote:'Real-user Core Web Vitals are not collected by this integration. CrUX requires a separate integration; lab TBT is not real-user INP.'
  };
}

export function selectPageSpeedUrls(report) {
  if(report.mode!=='domain') return [report.target.page.url];
  if(report.publicLite) return report.target.pages[0]?.url ? [report.target.pages[0].url] : [];
  // A small target-only sample: homepage plus one commercial/service page, if retrieved.
  const pages=report.target.pages;
  return [...new Set([pages[0]?.url,pages.find(p=>p.classification?.categories?.includes('Core services')&&p.url!==pages[0]?.url)?.url].filter(Boolean))].slice(0,2);
}

export function createPageSpeedProvider({fetchImpl=fetch,validate=resolvePublic,key=()=>process.env.PAGESPEED_API_KEY}={}) {
  // Store only compact successful runs; never retain a request URL containing the key.
  const cache=new Map();
  return {id:'pagespeed',isConfigured:()=>!!key(),async collect({report,signal,emit=()=>{}}) {
    const runs=[];
    for(const value of selectPageSpeedUrls(report)) for(const strategy of ['mobile','desktop']) {
      signal?.throwIfAborted();
      const url=normalizeUrl(value),cacheKey=`${strategy}:${url}`;
      emit(`PageSpeed Insights: ${strategy} · ${new URL(url).hostname}${new URL(url).pathname}`);
      const cached=cache.get(cacheKey);
      if(cached&&cached.until>Date.now()){runs.push({...cached.run,cached:true});continue;}
      try {
        await validate(url);
        const endpoint=new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
        endpoint.searchParams.set('url',url);endpoint.searchParams.set('strategy',strategy);endpoint.searchParams.set('key',key());
        endpoint.searchParams.set('locale','en');categories.forEach(c=>endpoint.searchParams.append('category',c));
        // Keep only the Lighthouse branch; parsing discards screenshots and audit tables.
        endpoint.searchParams.set('fields','lighthouseResult');
        const timeout=AbortSignal.timeout(90000);
        const response=await fetchImpl(endpoint,{signal:signal?AbortSignal.any([signal,timeout]):timeout,redirect:'error'});
        if(!response.ok){
          await response.body?.cancel();
          const message=response.status===429?'Google quota exceeded. Wait or review the project’s PageSpeed quota.':[400,401,403].includes(response.status)?'Google rejected this request. Check the API key, PageSpeed API enablement and key restrictions.':`Google PageSpeed is unavailable (HTTP ${response.status}).`;
          runs.push({url,strategy,error:message});
          if([400,401,403,429].includes(response.status))return runs; // Avoid repeating a configuration/quota failure.
          continue;
        }
        const run=parsePageSpeed(await response.json(),url,strategy);
        if(cache.size>=40)cache.delete(cache.keys().next().value);
        cache.set(cacheKey,{until:Date.now()+15*60000,run});runs.push(run);
      }catch(error){signal?.throwIfAborted();runs.push({url,strategy,error:error.name==='TimeoutError'?'Google PageSpeed exceeded the 90-second time limit.':'PageSpeed could not complete this run. The SEO report is still available.'});}
    }
    return runs;
  }};
}

export const shouldRunPageSpeed = (requested, configured) => !!configured && requested !== false;
