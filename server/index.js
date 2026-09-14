import {rankSettings,createSearchApiProvider} from './integrations/searchapi.js';
const searchApi=createSearchApiProvider();
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateInput, buildReport } from './report.js';
import { collectIntegrations } from './integrations/index.js';
import { readFile } from 'node:fs/promises';
import { buildPrintableHtml } from '../public/export.js';
import {validateDomainInput} from './domain/discovery.js';
import {buildDomainReport} from './domain/report.js';

const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.APP_PASSWORD) throw new Error('Set APP_PASSWORD before binding to a non-loopback HOST.');
const app = express();
const exportToken = randomBytes(24).toString('hex');
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], upgradeInsecureRequests: null } } }));
app.use((req, res, next) => {
  // Reject DNS rebinding against the local dashboard. Browser requests must use the configured host.
  const name = req.hostname.replace(/^\[|\]$/g, '');
  if (['127.0.0.1', 'localhost', '::1'].includes(host) && !['127.0.0.1', 'localhost', '::1'].includes(name)) return res.status(403).send('Host not allowed.');
  if (!process.env.APP_PASSWORD) return next();
  const expected = Buffer.from(`lighthouse:${process.env.APP_PASSWORD}`);
  const received = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) { res.set('WWW-Authenticate', 'Basic realm="Lighthouse SEO Specialist"'); return res.status(401).send('Authentication required.'); }
  next();
});
// Native attachment responses also work in embedded browsers that do not download blob URLs.
app.post('/api/export', rateLimit({windowMs:60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false}), express.urlencoded({extended:false,limit:'12mb',parameterLimit:5}), async (req,res) => {
  try {
    // A same-origin-readable token supports embedded browsers with opaque form origins.
    const token = Buffer.from(typeof req.body.token === 'string' ? req.body.token : '');
    const expectedToken = Buffer.from(exportToken);
    if (token.length !== expectedToken.length || !timingSafeEqual(token,expectedToken)) return res.status(403).send('Reload the application before exporting this report.');
    const { report, checked } = JSON.parse(req.body.payload || '{}');
    const validTarget=report?.mode==='domain'?Array.isArray(report.target?.pages)&&report.target.pages.length<=50:report?.target?.page&&Array.isArray(report.target?.keywords)&&report.target.keywords.length<=20;
    if (report?.schemaVersion !== 1 || !validTarget || !report.target?.score || !Array.isArray(report.competitors) || report.competitors.length > 5 || !Array.isArray(checked)) return res.status(400).send('Invalid report export.');
    const format = req.body.format;
    if (!['html','json'].includes(format)) return res.status(400).send('Unsupported export format.');
    const filename = `lighthouse-seo-${report.mode==='domain'?'domain-':''}${new URL(report.target.page?.url||report.target.url).hostname}-${new Date(report.date).toISOString().slice(0,10)}.${format}`;
    const content = format === 'json' ? JSON.stringify({...report,checkedActions:checked},null,2) : buildPrintableHtml(report,checked,await readFile(new URL('../public/styles.css',import.meta.url),'utf8'));
    res.set({'Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store','Content-Type':format==='json'?'application/json; charset=utf-8':'text/html; charset=utf-8'}).send(content);
  } catch { res.status(400).send('Could not export this report. Reopen it and try again.'); }
});
app.use(express.json({ limit: '20kb' }));
app.get('/api/health', (_req, res) => res.set('Cache-Control','no-store').json({ ok: true, aiConfigured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), pageSpeedConfigured: !!process.env.PAGESPEED_API_KEY, searchApiConfigured: searchApi.isConfigured(), exportToken }));
app.use('/api/analyze', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many analyses. Try again in a minute.' } }));
let active = 0;
app.post(['/api/analyze','/api/analyze/domain'], async (req, res) => {
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Cross-origin analysis requests are not allowed.' }); } catch { return res.status(403).json({ error: 'Invalid origin.' }); } }
  let input, rankingOptions;
  const domain=req.path==='/api/analyze/domain'||req.body?.mode==='domain';
  try { input = domain?validateDomainInput(req.body):validateInput(req.body); rankingOptions=rankSettings(req.body,input.keywords); } catch (error) { return res.status(400).json({ error: error.message }); }
  if (active >= 2) return res.status(429).json({ error: 'Two analyses are already running. Please try again shortly.' });
  active++;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), domain?1800000:600000);
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = event => { if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`); };
  try {
    const report = await (domain?buildDomainReport:buildReport)(input, message => send({ type: 'progress', message }), controller.signal);
    if (req.body.includePageSpeed === true) {
      report.input.includePageSpeed = true;
      report.integrations = await collectIntegrations({ report, signal: controller.signal, emit: message => send({type:'progress',message}) });
    }
    if(rankingOptions){ report.input.rankSettings=rankingOptions; report.rankings=await searchApi.collect({report,settings:rankingOptions,signal:controller.signal,emit:message=>send({type:'progress',message})}); }
    send({ type: 'report', report });
  } catch (error) { send({ type: 'error', error: controller.signal.aborted ? 'Analysis cancelled or time limit reached.' : error.message }); }
  finally { clearTimeout(deadline); active--; res.end(); }
});
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { index: 'index.html', dotfiles: 'deny' }));
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.type === 'entity.too.large' ? 'Request is too large.' : error instanceof SyntaxError ? 'Invalid JSON request.' : 'The request could not be completed.' }));
const server = app.listen(Number(process.env.PORT) || 3000, host, () => console.log(`Lighthouse SEO Specialist ready at http://${host}:${Number(process.env.PORT) || 3000}`));
server.requestTimeout = 1810000;
