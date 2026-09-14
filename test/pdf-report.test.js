import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPdfReport} from '../public/pdf-report.js';
import {readFile} from 'node:fs/promises';
import {buildReport} from '../server/report.js';
test('PDF report includes two device pages and On-Page Checks without fabricated scores',async()=>{
 const html=await readFile(new URL('fixtures/service-good.html',import.meta.url),'utf8');
 const r=await buildReport({targetUrl:'https://example.com/',keywords:['landscaping services'],competitorUrls:[]},()=>{},undefined,{crawl:async()=>({html,finalUrl:'https://example.com/',requestedUrl:'https://example.com/',status:200,headers:{},redirects:[],bytes:html.length}),ai:async()=>({status:'disabled',insights:[],drafts:[]})});
 const output=buildPdfReport(r);assert.match(output,/On-Page Checks/);assert.equal((output.match(/class="pdf-page pdf-speed"/g)||[]).length,2);assert.equal((output.match(/PageSpeed was not assessed/g)||[]).length,2);assert.ok(!output.includes('psi-arc'));
});
