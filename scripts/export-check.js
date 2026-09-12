import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3000';
const report = JSON.parse(await readFile('artifacts/live-report.json','utf8'));
const {exportToken:token} = await (await fetch(`${origin}/api/health`)).json();
for (const format of ['html','json']) {
  const response = await fetch(`${origin}/api/export`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({format,token,payload:JSON.stringify({report,checked:['ongoing-review']})})});
  assert.equal(response.status,200); assert.match(response.headers.get('content-disposition'),/attachment; filename="lighthouse-seo-/);
  const content = await response.text();
  if(format==='json') { const value=JSON.parse(content); assert.equal(value.target.page.title,report.target.page.title); assert.deepEqual(value.checkedActions,['ongoing-review']); }
  else { const $=cheerio.load(content); assert.equal($('.tab-panel').length,8); assert.equal($('script').length,0); assert.equal($('details:not([open])').length,0); assert.equal($('#action-ongoing-review').attr('checked'),'checked'); assert.ok(content.includes('tab-panel[hidden]{display:block!important}')); }
  await writeFile(`artifacts/export-report.${format}`,content);
  console.log(`${format.toUpperCase()} attachment verified (${Buffer.byteLength(content)} bytes)`);
}
const rejected=await fetch(`${origin}/api/export`,{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({format:'html',payload:JSON.stringify({report,checked:[]})})});
assert.equal(rejected.status,403); console.log('Cross-origin export rejected');
