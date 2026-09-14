import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderReport} from '../public/render.js';
import {buildPrintableHtml} from '../public/export.js';
import * as cheerio from 'cheerio';
const page=JSON.parse(await readFile('artifacts/searchapi-live-report.json','utf8'));
const domain=JSON.parse(await readFile('artifacts/domain-live-report.json','utf8'));domain.rankings=page.rankings;
for(const report of [page,domain]){
 const $=cheerio.load(renderReport(report));assert.equal($('[role="tab"]').length,report.mode==='domain'?11:9);assert.ok($('[data-rank-competitor]').length);
 const printed=cheerio.load(buildPrintableHtml(report,[]));assert.equal(printed('.ranking-summary').length,1);assert.equal(printed('[data-rank-competitor]').length,0);assert.equal(printed('.rank-discovery').length,0);
 console.log(`${report.mode||'page'}: conditional tab and compact export verified`);
}
const origin='http://127.0.0.1:3000';const {exportToken}=await(await fetch(`${origin}/api/health`)).json();
const exported=await fetch(`${origin}/api/export`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({format:'html',token:exportToken,payload:JSON.stringify({report:page,checked:[]})})});assert.equal(exported.status,200);const html=await exported.text();assert.match(html,/Google Rankings/);assert.ok(!html.includes('Add to next comparison'));console.log('Live HTML export contains compact ranking summary');
