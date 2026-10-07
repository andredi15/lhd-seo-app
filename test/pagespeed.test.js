import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePageSpeed,selectPageSpeedUrls,createPageSpeedProvider} from '../server/integrations/pagespeed.js';
import {renderIntegrations} from '../public/integrations-render.js';
const data={lighthouseResult:{fetchTime:'2026-01-01T00:00:00Z',categories:{performance:{score:0.81},seo:{score:null}},audits:{'total-blocking-time':{title:'Total Blocking Time',numericValue:0,numericUnit:'millisecond',displayValue:'0 ms'}}}};
test('PageSpeed preserves unavailable metrics and zero, with distinct lab provenance',()=>{
  const run=parsePageSpeed(data,'https://example.com/','mobile');
  assert.equal(run.scores[0].value,81);assert.equal(run.scores[3].value,null);
  assert.equal(run.measurements.find(m=>m.id==='total-blocking-time').value,0);
  assert.equal(run.measurements[0].value,null);assert.equal(run.kind,'lab');
  assert.throws(()=>parsePageSpeed({lighthouseResult:{runtimeError:{code:'FAILED'}}},'https://example.com/','mobile'));
});
test('Domain PageSpeed samples no more than homepage and one service page',()=>{
  const report={mode:'domain',target:{pages:[{url:'https://example.com/'},...['a','b','c'].map(p=>({url:`https://example.com/${p}`,classification:{categories:['Core services']}}))]}};
  assert.deepEqual(selectPageSpeedUrls(report),['https://example.com/','https://example.com/a']);
  assert.deepEqual(selectPageSpeedUrls({...report,publicLite:true}),['https://example.com/']);
});
test('PageSpeed caches successful strategies and isolates quota/configuration errors',async()=>{
  let calls=0;
  const provider=createPageSpeedProvider({key:()=> 'test-secret',validate:async()=>{},fetchImpl:async url=>{calls++;assert.equal(url.hostname,'www.googleapis.com');return {ok:true,json:async()=>data};}});
  const context={report:{target:{page:{url:'https://example.com/'}}}};
  assert.equal((await provider.collect(context)).length,2);
  assert.ok((await provider.collect(context)).every(r=>r.cached));assert.equal(calls,2);
  const failed=createPageSpeedProvider({key:()=> 'test-secret',validate:async()=>{},fetchImpl:async()=>({ok:false,status:403})});
  const runs=await failed.collect(context);assert.equal(runs.length,1);assert.match(runs[0].error,/restrictions/);assert.ok(!JSON.stringify(runs).includes('test-secret'));
});
test('PageSpeed rendering escapes upstream text and shows absent data without invented scores',()=>{
  const run=parsePageSpeed(data,'https://example.com/','mobile');run.warnings=['<script>bad</script>'];
  const markup=renderIntegrations({integrations:[{provider:'pagespeed',metrics:[run]}]});
  assert.match(markup,/81\/100/);assert.match(markup,/Unavailable/);assert.ok(!markup.includes('<script>'));
});
import {metricRating,scoreRating} from '../public/pagespeed-presentation.js';
test('PageSpeed ratings handle threshold boundaries, device differences and unavailable values',()=>{
 for(const [value,rating] of [[0,'poor'],[49,'poor'],[50,'moderate'],[89,'moderate'],[90,'good'],[100,'good'],[null,'unknown'],[NaN,'unknown']])assert.equal(scoreRating(value),rating);
 const metric=(id,value,units='millisecond',device='mobile')=>metricRating({id,value,units},device).status;
 assert.equal(metric('largest-contentful-paint',2500),'good');assert.equal(metric('largest-contentful-paint',4000),'moderate');assert.equal(metric('largest-contentful-paint',8400),'poor');
 assert.equal(metric('total-blocking-time',200),'good');assert.equal(metric('total-blocking-time',200,'millisecond','desktop'),'moderate');
 assert.equal(metric('speed-index',2400),'good');assert.equal(metric('speed-index',2400,'millisecond','desktop'),'poor');
 assert.equal(metric('cumulative-layout-shift',0.1,'unitless'),'good');assert.equal(metric('cumulative-layout-shift',0.25,'unitless'),'moderate');assert.equal(metric('cumulative-layout-shift',0.26,'unitless'),'poor');
 assert.equal(metric('largest-contentful-paint',null),'unknown');assert.equal(metric('largest-contentful-paint',8.4,'second'),'unknown');
});
