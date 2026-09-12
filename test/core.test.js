import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePage } from '../server/parser.js';
import { analyzePage, buildReport, validateInput } from '../server/report.js';
import { isPublicAddress, normalizeUrl, crawlPage } from '../server/crawler.js';
import { validateAI, analyzeAI } from '../server/ai.js';
import { matchKeyword } from '../server/keywords.js';
import { renderReport, esc, safeUrl } from '../public/render.js';
import { recommendationText, buildPrintableHtml } from '../public/export.js';

async function fixture(name, url = 'https://cedar.example/services/') {
  const html = await readFile(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8');
  return { html, requestedUrl:url, finalUrl:url, status:200, bytes:Buffer.byteLength(html), responseMs:55, headers:{}, fetchedAt:'2026-09-11T12:00:00.000Z', contentHash:'fixture', redirects:[], robotsNote:'Fixture; no network' };
}
test('parser extracts metadata, body, ordered headings, images, schema and links accurately', async () => {
  const page = parsePage(await fixture('service-good'));
  assert.equal(page.title, 'Landscaping Services | Cedar Garden');
  assert.match(page.description, /^Explore Cedar Garden/);
  assert.deepEqual(page.h1, ['Landscaping Services']);
  assert.equal(page.h2.length, 3); assert.equal(page.h3.length, 1);
  assert.ok(page.wordCount > 200); assert.equal(page.images.length, 2);
  assert.equal(page.images[0].alt, 'Raised planting beds with perennial flowers'); assert.equal(page.images[1].alt, '');
  assert.equal(page.externalLinks.length, 1); assert.ok(page.internalLinks.some(l => l.url === 'https://cedar.example/maintenance/'));
  assert.ok(page.schemaTypes.includes('Organization')); assert.equal(page.businessName, 'Cedar Garden');
  assert.equal(page.canonical, 'https://cedar.example/services/'); assert.ok(page.viewport); assert.ok(!page.body.includes('Home Landscaping'));
});
test('missing metadata remains missing and poor-page issues are detected', async () => {
  const missing = parsePage(await fixture('missing-metadata')); assert.equal(missing.title, ''); assert.equal(missing.description, '');
  const poor = analyzePage(parsePage(await fixture('service-poor')), ['landscaping services']);
  assert.equal(poor.page.images[0].alt, null); assert.ok(!poor.page.body.includes('tracking text'));
  for (const id of ['h1-multiple','hierarchy','image-alt','thin','description-missing']) assert.ok(poor.issues.some(i => i.id === id), id);
});
test('well-optimized content logically outperforms poor content and metadata removal reduces score', async () => {
  const goodPage = parsePage(await fixture('service-good'));
  const good = analyzePage(goodPage, ['landscaping services']); const poor = analyzePage(parsePage(await fixture('service-poor')), ['landscaping services']);
  assert.ok(good.score.overall > poor.score.overall + 20, `${good.score.overall} vs ${poor.score.overall}`);
  assert.ok(good.keywords[0].score > poor.keywords[0].score);
  const stripped = analyzePage({ ...goodPage, title:'', description:'', h1:[] }, ['landscaping services']);
  assert.ok(stripped.score.overall < good.score.overall);
});
test('weights total 100 and local score is relevant only for inferred local keywords', async () => {
  const local = analyzePage(parsePage(await fixture('local-service', 'https://cedar.example/mississauga/')), ['landscaping services mississauga']);
  const generic = analyzePage(parsePage(await fixture('service-good')), ['landscaping services']);
  assert.equal(local.score.categories.reduce((s,c) => s+c.weight,0), 100); assert.equal(generic.score.categories.reduce((s,c) => s+c.weight,0), 100);
  assert.ok(local.score.localRelevant); assert.ok(!generic.score.localRelevant); assert.equal(local.keywords[0].localScore,100);
  assert.ok(local.page.signals.map); assert.ok(local.page.signals.localSchema); assert.ok(local.page.signals.phone); assert.deepEqual(local.page.locations,['Mississauga']);
});
test('article matches informational intent better than service intent', async () => {
  const page = parsePage(await fixture('blog', 'https://cedar.example/blog/garden-guide/'));
  const informational = analyzePage(page, ['how to plan a garden']); const commercial = analyzePage(page, ['landscaping services mississauga']);
  assert.ok(informational.keywords[0].intent.labels.includes('Informational')); assert.ok(informational.keywords[0].intent.score > commercial.keywords[0].intent.score);
  assert.ok(informational.score.overall > commercial.score.overall); assert.deepEqual(page.freshness,['2025-04-02']);
  assert.equal(page.businessName,'', 'An article author must not be mislabeled as the business');
});
test('noindex caps score and extra filler words do not increase content score', async () => {
  const page = parsePage(await fixture('service-good'));
  const normal = analyzePage(page, ['landscaping services']); const blocked = analyzePage({ ...page,robots:['noindex, follow'] }, ['landscaping services']);
  assert.ok(blocked.score.overall <= 35); assert.ok(blocked.issues.some(i => i.id === 'indexing'));
  const filler = analyzePage({ ...page,body:page.body + ' Unrelated filler.'.repeat(1000),wordCount:page.wordCount+2000 }, ['landscaping services']);
  assert.equal(filler.score.categories[1].score,normal.score.categories[1].score);
});
test('boundary matching avoids substring matches and accents are normalized', () => {
  assert.equal(matchKeyword('We repair carpets', 'car').exact,false);
  assert.equal(matchKeyword('Café garden services', 'cafe garden services').exact,true);
});
test('unsafe URL schemes, credentials and ports are rejected; private IPv4/IPv6 are blocked', () => {
  for (const url of ['file:///etc/passwd','ftp://example.com','https://user:pass@example.com','https://example.com:3000']) assert.throws(() => normalizeUrl(url));
  for (const ip of ['127.0.0.1','10.0.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','fc00::1','::ffff:127.0.0.1','fe80::1','0.0.0.0','224.0.0.1']) assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('93.184.216.34'),true); assert.equal(normalizeUrl('https://example.com/#part'),'https://example.com/');
});
test('input deduplicates URLs and keywords, rejects empty and excessive entries', () => {
  const input = validateInput({ targetUrl:'https://example.com',keywords:'garden, garden\nlandscape',competitorUrls:['https://other.com','https://other.com/','https://example.com/'] });
  assert.deepEqual(input.keywords,['garden','landscape']); assert.deepEqual(input.competitorUrls,['https://other.com/']); assert.equal(input.duplicatesRemoved,2);
  for (const keywords of ['',',,,','???',Array(21).fill('').map((_,i)=>`keyword ${i}`)]) assert.throws(() => validateInput({ targetUrl:'https://example.com', keywords }));
});
test('a failed competitor does not break a report; gaps retain retrieved evidence', async () => {
  const target = await fixture('service-poor'); const comp = await fixture('local-service','https://competitor.example/');
  const progress = [];
  const report = await buildReport(validateInput({targetUrl:target.finalUrl,keywords:'landscaping services mississauga',competitorUrls:[comp.finalUrl,'https://failure.example/']}), m=>progress.push(m), undefined, {
    crawl:async url => { if (url.includes('failure')) throw new Error('Page returned HTTP 403'); return url === target.finalUrl ? target : comp; },
    ai:async () => ({status:'disabled',note:'Test rule-based mode',insights:[],drafts:[]})
  });
  assert.equal(report.competitors.length,2); assert.equal(report.comparison.successfulCount,1); assert.match(report.competitors[1].error,/403/); assert.ok(report.comparison.gaps.length);
  for (const gap of report.comparison.gaps) for (const e of gap.evidence) assert.ok(report.competitors[0].analysis.page.body.includes(e.quote) || report.competitors[0].analysis.page.headings.some(h=>h.text===e.quote));
  assert.ok(progress.includes('Building recommendations')); assert.equal(report.table[0].competitors[1],'Unavailable');
  const html = renderReport(report, ['thin']); assert.match(html,/role="tab"/); assert.match(html,/action-thin/); assert.ok(html.includes('checked'));
  assert.ok(recommendationText(report,['thin']).includes('[x] Check the limited extractable content'));
  const exported = buildPrintableHtml(report,['thin']);
  assert.ok(exported.includes('<details open')); assert.ok(exported.includes('tab-panel[hidden]{display:block!important}')); assert.ok(!exported.includes('<script'));
  assert.ok(report.target.issues.findIndex(i=>i.priority==='Low Impact') > report.target.issues.findIndex(i=>i.id==='gap-0'));
});
test('ambiguous queries do not generate unsupported commercial advice', async () => {
  const page = parsePage({html:'<title>Example Domain</title><h1>Example Domain</h1><p>This domain is used for documentation examples.</p>',finalUrl:'https://example.com/',status:200,headers:{}});
  const result = analyzePage(page,['example domain']);
  assert.equal(result.keywords[0].intent.confidence,'Low'); assert.ok(!result.issues.some(i=>['cta','trust'].includes(i.id)));
});
test('robots disallow, HTTP failures and redirect limits are respected', async () => {
  const response = (status,text='',headers={}) => ({status,buffer:Buffer.from(text),headers,bytes:text.length,responseMs:1});
  const seen = [];
  await assert.rejects(crawlPage('https://public.example/private', {request:async url=> {seen.push(url);return response(200,'User-agent: *\nDisallow: /private');}}),/disallowed/);
  assert.deepEqual(seen,['https://public.example/robots.txt']);
  await assert.rejects(crawlPage('https://public.example/', {request:async url=>url.endsWith('/robots.txt')?response(404):response(403)}),/HTTP 403/);
  await assert.rejects(crawlPage('https://public.example/', {request:async url=>url.endsWith('/robots.txt')?response(404):response(302,'',{location:'/again'})}),/Too many page redirects/);
  await assert.rejects(crawlPage('https://public.example/', {request:async ()=>response(503)}),/robots.txt permission/);
});
test('AI Responses request is structured, isolated from facts and gracefully handles service errors', async () => {
  const page = parsePage(await fixture('service-good')); const target = analyzePage(page,['landscaping services']);
  const report = {input:{keywords:['landscaping services']},target,competitors:[],comparison:{gaps:[]}};
  const before = JSON.stringify(target);
  const output = {insights:[{section:"What's Working",text:'The page describes garden design services.',sourceUrl:page.url,quote:page.intro.slice(0,90)}],drafts:[]};
  const result = await analyzeAI(report,undefined,{apiKey:'test-only',model:'test-model',fetch:async (url,options)=> {
    assert.equal(url,'https://api.openai.com/v1/responses'); const body=JSON.parse(options.body);
    assert.equal(body.store,false); assert.equal(body.text.format.type,'json_schema'); assert.equal(body.text.format.strict,true); assert.equal(body.tools,undefined);
    return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}));
  }});
  assert.equal(result.status,'complete'); assert.equal(JSON.stringify(target),before);
  const failed = await analyzeAI(report,undefined,{apiKey:'test-only',model:'test-model',fetch:async()=>new Response('',{status:429})});
  assert.equal(failed.status,'unavailable'); assert.match(failed.note,/429/);
});
test('AI rejects fabricated source quotes, outside sources and ranking promises', async () => {
  const page = parsePage(await fixture('service-good')); const good = { section:"What's Working",text:'The page describes its garden design process.',sourceUrl:page.url,quote:page.intro.slice(0,90) };
  const output = validateAI({insights:[good,{...good,quote:'A completely invented source quotation.'},{...good,sourceUrl:'https://evil.example/'},{...good,text:'This will guarantee higher rankings.'}],drafts:[{element:'SEO title',suggested:'Garden Design',sourceUrl:page.url,quote:good.quote}]},[page]);
  assert.equal(output.insights.length,1); assert.equal(output.discarded,3); assert.equal(output.drafts.length,1);
  assert.throws(()=>validateAI({insights:[{...good,quote:'invented'}],drafts:[]},[page]));
});
test('renderer escapes page HTML and unsafe links', () => {
  assert.equal(esc('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(safeUrl('javascript:alert(1)'),'#');
});
test('malformed JSON-LD is reported and hidden text excluded', () => {
  const page = parsePage({html:'<title>A &amp; B</title><script type="application/ld+json">{invalid</script><main><h1>Visible</h1><p hidden>Secret copy</p><p>Hello <strong>world</strong>.</p></main>',finalUrl:'https://example.com/',status:200,headers:{}});
  assert.equal(page.title,'A & B'); assert.equal(page.schemaErrors.length,1); assert.ok(!page.body.includes('Secret')); assert.ok(page.body.includes('Hello world.'));
});
