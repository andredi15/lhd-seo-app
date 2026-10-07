import test from 'node:test';
import assert from 'node:assert/strict';
import {publicBrowserSummary,publicInput,publicLiteReport} from '../server/public.js';
test('public reviews enforce a ten-page domain crawl and three optional topics without competitors',()=>{
 const input=publicInput({targetUrl:'https://example.com/service',keywords:'one,two',competitorUrls:['https://other.com'],crawlLimit:50,includeRankings:true});
 assert.equal(input.targetUrl,'https://example.com/');assert.equal(input.mode,'domain');assert.equal(input.crawlLimit,10);assert.deepEqual(input.competitorUrls,[]);assert.deepEqual(publicInput({targetUrl:'example.com'}).keywords,[]);
 assert.throws(()=>publicInput({targetUrl:'https://example.com',keywords:'one,two,three,four'}),/three/);assert.throws(()=>publicInput({targetUrl:'file:///etc/passwd'}));
});
test('emailed public reports expose only the requested browser summary',()=>{
 const report={schemaVersion:1,mode:'domain',date:'2026-10-07',input:{targetUrl:'https://example.com',keywords:['service'],competitorUrls:[]},target:{url:'https://example.com/',score:{overall:77},stats:{crawled:2},pages:[{url:'https://example.com/',body:'private full content'},{url:'https://example.com/service',body:'more private content'}],issues:[{issue:'Private detail'}]},summary:{nextMove:'Clarify the service',strengths:[]},integrations:[],actionPlan:{Next:[{text:'Private action'}]}};
 const summary=publicBrowserSummary(report);assert.equal(summary.target.pages.length,1);assert.equal(summary.target.pages[0].url,'https://example.com/');assert.equal(summary.summary.nextMove,'Clarify the service');assert.equal(summary.input.keywords,undefined);assert.ok(!JSON.stringify(summary).includes('private'));
});
test('public domain report keeps only a concise issue-led action plan',()=>{
 const issues=[{id:'a',priority:'Critical',issue:'Fix A',fix:'Do A'},{id:'b',priority:'High Impact',issue:'Fix B',fix:'Do B'},{id:'c',priority:'Medium Impact',issue:'Fix C',fix:'Do C'}];
 const report=publicLiteReport({summary:{strengths:['One','Two','Three','Four'],weaknesses:['A','B','C','D']},target:{issues}});
 assert.equal(report.publicLite,true);assert.deepEqual(report.actionPlan['Fix First'].map(i=>i.id),['a','b']);assert.deepEqual(report.actionPlan.Next.map(i=>i.id),['c']);assert.equal(report.summary.strengths.length,3);
});
