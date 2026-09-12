import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import * as cheerio from 'cheerio';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const target=process.env.TEST_DOMAIN||'https://www.iana.org/';
const response=await fetch(`${origin}/api/analyze/domain`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetDomain:target,keywords:[],competitorDomains:['https://example.com/','https://does-not-exist.invalid/'],crawlLimit:10})});
assert.equal(response.status,200);const reader=response.body.getReader();const decoder=new TextDecoder();let pending='',report;
function consume(line){if(!line.trim())return;const event=JSON.parse(line);if(event.type==='progress')console.log(event.message);if(event.type==='error')throw new Error(event.error);if(event.type==='report')report=event.report;}
while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let index;while((index=pending.indexOf('\n'))>=0){consume(pending.slice(0,index));pending=pending.slice(index+1);}}
if(pending.trim())consume(pending);assert.ok(report);assert.equal(report.mode,'domain');assert.ok(report.target.pages.length>0);assert.ok(report.target.requestCount<=10);assert.equal(report.opportunities.length,6);assert.ok(report.competitors[1].error);
assert.equal(report.target.score.categories.reduce((n,c)=>n+c.weight,0),100);assert.ok(report.target.stats.discovered>=report.target.stats.crawled);
for(const page of report.target.pages)assert.equal(new URL(page.url).hostname.replace(/^www\./,''),new URL(target).hostname.replace(/^www\./,''));
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/domain-live-report.json',JSON.stringify(report,null,2));
const {exportToken:token}=await(await fetch(`${origin}/api/health`)).json();
for(const format of ['html','json']) {
  const exported=await fetch(`${origin}/api/export`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,format,payload:JSON.stringify({report,checked:['domain-monthly']})})});assert.equal(exported.status,200);const text=await exported.text();
  if(format==='html'){const $=cheerio.load(text);assert.equal($('.tab-panel').length,10);assert.equal($('script').length,0);assert.ok($.text().includes('Next 6 Content Opportunities'));}else assert.equal(JSON.parse(text).mode,'domain');
  await writeFile(`artifacts/domain-export.${format}`,text);
}
console.log(JSON.stringify({ok:true,target:report.target.url,discovered:report.target.stats.discovered,crawled:report.target.stats.crawled,requests:report.target.requestCount,score:report.target.score.overall,ai:report.target.ai.status,competitors:report.competitors.map(c=>({url:c.url,pages:c.analysis?.pages.length,error:c.error})),exports:'HTML and JSON verified'},null,2));
