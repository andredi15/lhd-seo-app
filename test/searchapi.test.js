import test from 'node:test';
import assert from 'node:assert/strict';
import {rankSettings,parseRankResults,matchRankings,createSearchApiProvider} from '../server/integrations/searchapi.js';
import {renderRankings,rankingSummary} from '../public/rankings.js';
const settings={device:'mobile',country:'ca',language:'en',location:'Mississauga, Ontario, Canada',keywords:['landscaping'],limit:100};
const report={input:{targetUrl:'https://example.com/service/',competitorUrls:['https://competitor.com/']},target:{page:{url:'https://www.example.com/service/'}}};
const data={search_metadata:{status:'Success'},organic_results:[{position:1,link:'https://competitor.com/',title:'<script>bad</script>'},{position:3,link:'https://example.com/'},{position:8,link:'https://www.example.com/service/'},{position:9,link:'https://www.example.com/service/'},{position:2,link:'javascript:alert(1)'},{position:5,link:'https://fakeexample.com/'},{position:7,link:'https://blog.example.com/'}]};
test('rank settings opt in explicitly, require keywords, validate settings and cap requests at five',()=>{
 assert.equal(rankSettings({},[]),null);assert.throws(()=>rankSettings({includeRankings:true,rankSettings:settings},[]));
 assert.equal(rankSettings({includeRankings:true,rankSettings:settings},['1','2','3','4','5','6']).keywords.length,5);
 assert.throws(()=>rankSettings({includeRankings:true,rankSettings:{...settings,device:'invalid'}},['word']));
});
test('rank parser deduplicates URLs, filters unsafe links and matches page versus domain without substring matches',()=>{
 const results=parseRankResults(data);assert.equal(results.length,5);const match=matchRankings(results,report);
 assert.equal(match.targetPage.position,8);assert.equal(match.bestDomain.position,3);assert.equal(match.competitors[0].result.position,1);
 assert.equal(matchRankings(results,{...report,target:{page:{url:'https://missing.example/'}}}).bestDomain,null);
 assert.throws(()=>parseRankResults({error:'secret'}));assert.throws(()=>parseRankResults({}));assert.deepEqual(parseRankResults({organic_results:[]}),[]);
});
test('rank requests use header key, cache searches across target domains, isolate errors and halt on quota failure',async()=>{
 let calls=0;const provider=createSearchApiProvider({key:()=> 'fixture-secret',fetchImpl:async(url,opts)=>{calls++;assert.equal(opts.headers.Authorization,'Bearer fixture-secret');assert.ok(!url.href.includes('fixture-secret'));return {ok:true,json:async()=>data};}});
 const first=await provider.collect({report,settings});assert.equal(first.runs[0].targetPage.position,8);
 const second=await provider.collect({report:{...report,target:{page:{url:'https://competitor.com/'}}},settings});assert.equal(calls,1);assert.equal(second.runs[0].bestDomain.position,1);assert.equal(second.runs[0].cached,true);
 let failures=0;const failed=createSearchApiProvider({key:()=> 'x',fetchImpl:async()=>{failures++;return {ok:false,status:429};}});
 const output=await failed.collect({report,settings:{...settings,keywords:['one','two']}});assert.equal(failures,1);assert.equal(output.runs.length,2);assert.ok(output.runs.every(r=>r.error));
 const absent=await createSearchApiProvider({key:()=>''}).collect({report,settings});assert.match(absent.error,/not configured/);
});
test('ranking views escape upstream text; compact exports omit competitor discovery',async()=>{
 const provider=createSearchApiProvider({key:()=> 'x',fetchImpl:async()=>({ok:true,json:async()=>data})});const rankings=await provider.collect({report,settings});
 const html=renderRankings({...report,rankings});assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.match(html,/Add to next comparison/);
 const compact=rankingSummary({...report,rankings});assert.ok(!compact.includes('Add to next comparison'));assert.match(compact,/#8/);assert.match(compact,/#3/);
});
