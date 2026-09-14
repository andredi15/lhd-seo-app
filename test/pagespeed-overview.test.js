import test from 'node:test';
import assert from 'node:assert/strict';
import {pageSpeedOverview} from '../public/pagespeed-overview.js';
import {shouldRunPageSpeed} from '../server/integrations/pagespeed.js';
const url='https://example.com/';
const run=(strategy,value,extra={})=>({url,strategy,scores:[{id:'performance',value},{id:'accessibility',value:99}],...extra});
const report=runs=>({target:{page:{url}},integrations:[{provider:'pagespeed',metrics:runs}]});
test('Overview shows only mobile and desktop performance with correct zero and absent states',()=>{
 const html=pageSpeedOverview(report([run('mobile',0),run('desktop',90)]));assert.match(html,/Mobile Performance/);assert.match(html,/Desktop Performance/);assert.match(html,/0\/100, Poor/);assert.ok(!html.includes('Accessibility'));
 assert.equal(pageSpeedOverview(report([])),'');assert.equal(pageSpeedOverview(report([run('mobile',null),run('desktop',30,{error:'failed'})])),'');
 const one=pageSpeedOverview(report([run('mobile',65)]));assert.ok(!one.includes('Desktop Performance'));
});
test('Domain overview selects the first sampled page without averaging another page',()=>{
 const domain={mode:'domain',target:{url,pages:[{url}]},integrations:[{provider:'pagespeed',metrics:[run('mobile',60),run('desktop',80),run('mobile',1,{url:url+'service/'})]}]};
 const html=pageSpeedOverview(domain);assert.match(html,/60\/100/);assert.ok(!html.includes('1/100'));assert.match(html,/not a site-wide score/);
});
test('PageSpeed defaults on when configured, accepts explicit opt out, never runs without a key',()=>{
 assert.equal(shouldRunPageSpeed(undefined,true),true);assert.equal(shouldRunPageSpeed(true,true),true);assert.equal(shouldRunPageSpeed(false,true),false);assert.equal(shouldRunPageSpeed(true,false),false);
});
