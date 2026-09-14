import test from 'node:test';
import assert from 'node:assert/strict';
import {placement,keywordPlacement,pageCheckRows} from '../public/audit-presentation.js';
import {withPageSpeedActions} from '../public/pagespeed-actions.js';
import {parsePage} from '../server/parser.js';
import {readFile} from 'node:fs/promises';
test('placement uses chosen phrases and distinguishes partial words from exact matches',()=>{
 assert.equal(placement('Landscape services in TORONTO','landscape services in toronto'),'pass');assert.equal(placement('Toronto garden design','landscape services in toronto'),'review');assert.equal(placement('Cartography','art'),'fail');assert.equal(placement('Café design','cafe design'),'pass');
 const html=keywordPlacement({title:'art',description:'',h1:['art'],h2:[],h3:[],intro:'',body:''},[{keyword:'art'},{keyword:'<script>'}]);assert.match(html,/Meta description/);assert.ok(!html.includes('<script>'));assert.match(html,/audit-fail/);
});
test('poor PageSpeed observations create bounded, repeatable actions without changing scores',()=>{
 const run={url:'https://example.com/',strategy:'mobile',testedAt:'2026-09-14',scores:[{id:'performance',value:40},{id:'accessibility',value:null}],measurements:[{id:'largest-contentful-paint',value:8400,units:'millisecond',display:'8.4 s'},{id:'total-blocking-time',value:800,units:'millisecond',display:'800 ms'}],diagnostics:[]};
 const base={target:{score:{overall:87}},actionPlan:{'Fix First':[{id:'existing',text:'Existing'}],Next:[],Ongoing:[]},integrations:[{provider:'pagespeed',metrics:[run,{...run,strategy:'desktop',error:'failed'}]}]};
 const result=withPageSpeedActions(base);assert.equal(result.actionPlan['Fix First'].length,2);assert.equal(base.actionPlan['Fix First'].length,1);assert.equal(result.target.score.overall,87);assert.match(result.actionPlan['Fix First'][1].detail,/8.4 s/);assert.match(result.actionPlan['Fix First'][1].detail,/long JavaScript/);assert.deepEqual(withPageSpeedActions(result),result);
 const moderate={...run,scores:[{id:'performance',value:50}],measurements:[{id:'largest-contentful-paint',value:4000,units:'millisecond'}]};assert.equal(withPageSpeedActions({...base,integrations:[{provider:'pagespeed',metrics:[moderate]}]}).actionPlan['Fix First'].length,1);
});
