export function rankSettings(raw, keywords) {
 if(raw.includeRankings!==true)return null;
 if(!keywords.length)throw new Error('Enter at least one keyword to check rankings.');
 const s=raw.rankSettings||{};
 if(!['mobile','desktop'].includes(s.device)||!['ca','us','gb','au'].includes(s.country)||!['en','fr'].includes(s.language))throw new Error('Choose a supported ranking device, country and language.');
 if(typeof s.location!=='string'||s.location.trim().length>150)throw new Error('Search location must be text, up to 150 characters.');
 return {device:s.device,country:s.country,language:s.language,location:s.location.trim(),limit:100,keywords:keywords.slice(0,5)};
}
const host=value=>{try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}};
const pageKey=value=>{try{const u=new URL(value);return host(value)+(u.pathname.replace(/\/$/,'')||'/')+u.search;}catch{return '';}};
export function parseRankResults(data) {
 if(data?.error||!Array.isArray(data?.organic_results)||data.search_metadata?.status&&data.search_metadata.status!=='Success')throw new Error('Invalid ranking response');
 const seen=new Set();
 return data.organic_results.filter(r=>Number.isInteger(r.position)&&r.position>=1&&r.position<=100&&typeof r.link==='string'&&/^https?:\/\//i.test(r.link)).sort((a,b)=>a.position-b.position).filter(r=>{const k=pageKey(r.link);if(!k||seen.has(k))return false;seen.add(k);return true;}).slice(0,100).map(r=>({position:r.position,url:r.link.slice(0,2048),title:String(r.title||'').slice(0,500),snippet:String(r.snippet||'').slice(0,1000)}));
}
export function matchRankings(results,report) {
 const target=report.target.page?.url||report.target.url;
 const domain=host(target),matches=results.filter(r=>host(r.url)===domain);
 const exact=results.find(r=>[target,report.input.targetUrl].some(u=>pageKey(u)===pageKey(r.url)));
 return {targetPage:report.mode==='domain'?null:exact||null,bestDomain:matches[0]||null,competitors:report.input.competitorUrls.map(url=>({url,result:results.find(r=>host(r.url)===host(url))||null})),discovered:results.filter(r=>host(r.url)!==domain).slice(0,10)};
}
export function createSearchApiProvider({fetchImpl=fetch,key=()=>process.env.SEARCHAPI_API_KEY,now=()=>Date.now()}={}) {
 const cache=new Map();
 return {id:'searchapi',isConfigured:()=>!!key(),async collect({report,settings,signal,emit=()=>{}}) {
  const output={source:'SearchApi.io / Google organic results',settings,runs:[]};
  if(!key())return {...output,error:'SearchApi.io is not configured. Add SEARCHAPI_API_KEY on the server.'};
  let halted=false;
  for(const keyword of settings.keywords){
   signal?.throwIfAborted();
   if(halted){output.runs.push({keyword,error:'Not checked after an authentication or quota failure.'});continue;}
   emit(`Checking Google rankings: ${keyword}`);
   const cacheKey=JSON.stringify([keyword,settings.device,settings.country,settings.language,settings.location]);
   try{
    let run=cache.get(cacheKey);let cached=!!run&&run.expires>now();
    if(!cached){
     const url=new URL('https://www.searchapi.io/api/v1/search');
     Object.entries({engine:'google_rank_tracking',q:keyword,device:settings.device,gl:settings.country,hl:settings.language,num:'100',...(settings.location?{location:settings.location}:{})}).forEach(([k,v])=>url.searchParams.set(k,v));
     const timeout=AbortSignal.timeout(95000);
     const res=await fetchImpl(url,{headers:{Authorization:`Bearer ${key()}`},redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});
     if(!res.ok){await res.body?.cancel();halted=[401,403,429].includes(res.status);output.runs.push({keyword,error:res.status===429?'SearchApi quota or rate limit reached.':[401,403].includes(res.status)?'SearchApi rejected the API key or account permissions.':`Ranking check unavailable (HTTP ${res.status}).`});continue;}
     const data=await res.json();const results=parseRankResults(data);
     run={results,checkedAt:new Date(now()).toISOString(),locationUsed:String(data.search_parameters?.location_used||data.search_parameters?.location||settings.location||settings.country),expires:now()+3600000};
     if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(cacheKey,run);
    }
    output.runs.push({keyword,checkedAt:run.checkedAt,locationUsed:run.locationUsed,cached,returned:run.results.length,depth:Math.max(0,...run.results.map(r=>r.position)),...matchRankings(run.results,report)});
   }catch(error){signal?.throwIfAborted();output.runs.push({keyword,error:error.name==='TimeoutError'?'Ranking check timed out.':'Ranking check unavailable; no position was inferred.'});}
  }
  return output;
 }};
}
