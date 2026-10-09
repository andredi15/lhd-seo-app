import {fileURLToPath} from 'node:url';
import express from 'express';
import {rateLimit} from 'express-rate-limit';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateDomainInput} from './domain/discovery.js';
import {buildDomainReport} from './domain/report.js';
import {collectIntegrations} from './integrations/index.js';
import {withPageSpeedActions} from '../public/pagespeed-actions.js';
import {buildPdfReport} from '../public/pdf-report.js';
import {renderPdf} from './pdf.js';
import {createReportEmailProvider,validateReportEmail} from './integrations/report-email.js';
export function publicInput(body){
 const input=validateDomainInput({targetDomain:body?.targetUrl,keywords:body?.keywords,competitorDomains:[],crawlLimit:10});
 if(input.keywords.length>3)throw new Error('Choose up to three services, topics or locations for this review.');
 return input;
}
export function publicLiteReport(report){
 const priorities=report.target.issues;
 const action=(issue)=>({id:issue.id,text:issue.issue,detail:issue.fix});
 return {...report,publicLite:true,summary:{
  strengths:report.summary.strengths.slice(0,3),
  weaknesses:report.summary.weaknesses.slice(0,3),
  nextMove:priorities[0]?.fix||'Use the retrieved site sample to choose one useful improvement, then re-check it after publishing.'
 },actionPlan:{
  'Fix First':priorities.filter(i=>['Critical','High Impact'].includes(i.priority)).slice(0,3).map(action),
  Next:priorities.filter(i=>i.priority==='Medium Impact').slice(0,4).map(action),
  Ongoing:[{id:'public-domain-recheck',text:'Re-check the website after meaningful changes',detail:'Use the same 10-page sample as a comparison point. Crawl results are not indexed-page counts.'}]
 }};
}
export function publicBrowserSummary(report){
 const home=report.target.pages[0],s=report.target.stats;
 const integrations=report.integrations.filter(i=>i.provider==='pagespeed').map(i=>({provider:i.provider,metrics:(i.metrics||[]).map(run=>({url:run.url,strategy:run.strategy,testedAt:run.testedAt,collectedAt:run.collectedAt,cached:run.cached,error:run.error,scores:(run.scores||[]).filter(score=>score.id==='performance')}))}));
 return {schemaVersion:report.schemaVersion,mode:report.mode,date:report.date,publicLite:true,input:{targetUrl:report.input.targetUrl},target:{url:report.target.url,score:{overall:report.target.score.overall},stats:{crawled:s.crawled,discovered:s.discovered,services:s.services,locations:s.locations,blogs:s.blogs,faqPages:s.faqPages,totalInternalLinks:s.totalInternalLinks,averageInternalLinks:s.averageInternalLinks},pages:[{url:home.url}]},summary:{nextMove:report.summary.nextMove},integrations};
}
export function createPublicRouter(options={}){
 const router=express.Router(),reports=new Map();let active=false,day='',used=0;
 const emailProvider=options.emailProvider||createReportEmailProvider();
 const limit=Number(process.env.PUBLIC_DAILY_SCAN_LIMIT)||20;
 const prune=()=>{for(const [id,r]of reports)if(r.expires<Date.now())reports.delete(id);};
 const asset=name=>new URL(`../public/${name}`,import.meta.url);
 const sendAsset=(name,cache='no-cache, must-revalidate')=>async(_req,res,next)=>{try{res.set('Cache-Control',cache).sendFile(fileURLToPath(asset(name)));}catch(e){next(e);}};
 if(process.env.PUBLIC_SITE_MODE==='true')router.get('/',(_req,res)=>res.redirect(302,'/audit'));
 router.get(['/audit','/audit/'],sendAsset('audit.html'));
 for(const file of ['styles.css','visitor.js','visitor.css','audit-presentation.js','html.js','pagespeed-overview.js','pagespeed-presentation.js','recommendation-examples.js','pagespeed-actions.js'])router.get(`/audit-assets/${file}`,sendAsset(file));
 router.get('/audit-assets/logo.png',sendAsset('assets/lighthouse-logo-white.png','public, max-age=86400'));
 router.get('/public-api/config',(_req,res)=>res.set({'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}).json({pageSpeed:!!process.env.PAGESPEED_API_KEY,emailDelivery:emailProvider.isConfigured(),bookingUrl:process.env.PUBLIC_BOOKING_URL||'https://lighthousedigitalhq.com/contact/'}));
 router.use('/public-api',express.json({limit:'8kb'}),(req,res,next)=>{
  if(req.method==='POST'){let same=false;try{same=!!req.headers.origin&&new URL(req.headers.origin).host===req.headers.host;}catch{}if(!same)return res.status(403).json({error:'Please submit your scan from the audit page.'});}next();
 });
 router.post('/public-api/analyze',rateLimit({windowMs:86400000,limit:3,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'You have reached the daily limit of three reviews. Please try again tomorrow.'}}),async(req,res)=>{
  let input,recipient;try{input=publicInput(req.body);recipient=emailProvider.isConfigured()?validateReportEmail(req.body?.email):null;}catch(e){return res.status(400).json({error:e.message});}
  const today=new Date().toISOString().slice(0,10);if(day!==today){day=today;used=0;}
  if(used>=limit)return res.status(429).json({error:'Today’s scan allowance has been reached. Please try again tomorrow.'});
  if(active)return res.status(429).json({error:'Another review is running. Please try again in a few minutes.'});
  used++;active=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),480000);
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  res.set({'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});res.flushHeaders();
  const send=event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
  try{
   let report=await buildDomainReport(input,message=>send({type:'progress',message}),controller.signal,{ai:async()=>({status:'disabled',classified:0,note:'Evidence-based website review'})});
   report=publicLiteReport(report);
   if(process.env.PAGESPEED_API_KEY)report.integrations=await collectIntegrations({report,signal:controller.signal,emit:message=>send({type:'progress',message})});
   report=withPageSpeedActions(report);
   if(emailProvider.isConfigured()){
    send({type:'progress',message:'Preparing your full PDF report'});
    const css=await readFile(asset('styles.css'),'utf8'),logo='data:image/png;base64,'+(await readFile(asset('assets/lighthouse-logo-white.png'))).toString('base64');
    const pdf=await renderPdf(buildPdfReport(report,[],css,logo));
    send({type:'progress',message:'Emailing your report'});await emailProvider.send({to:recipient,report,pdf});
    send({type:'report',report:publicBrowserSummary(report),delivery:{status:'sent'}});
   }else{
    prune();while(reports.size>=20)reports.delete(reports.keys().next().value);
    const id=randomBytes(24).toString('hex');reports.set(id,{report,expires:Date.now()+30*60000});send({type:'report',report,id});
   }
  }catch(e){send({type:'error',error:controller.signal.aborted?'The review was cancelled or timed out. Please try again.':e.message});}
  finally{clearTimeout(timer);active=false;res.end();}
 });
 router.post('/public-api/reports/:id/pdf',rateLimit({windowMs:60000,limit:4,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
  if(emailProvider.isConfigured())return res.status(404).json({error:'Public PDF reports are delivered by email.'});
  prune();const item=reports.get(req.params.id);if(!item)return res.status(404).json({error:'This report has expired. Run a new review to generate a PDF.'});
  try{if(!item.pdf){const css=await readFile(asset('styles.css'),'utf8'),logo='data:image/png;base64,'+(await readFile(asset('assets/lighthouse-logo-white.png'))).toString('base64');item.pdf=await renderPdf(buildPdfReport(item.report,[],css,logo));}res.json({url:`/public-api/reports/${req.params.id}/pdf`});}catch{res.status(503).json({error:'PDF generation is temporarily unavailable. Your results are still visible below.'});}
 });
 router.get('/public-api/reports/:id/pdf',(req,res)=>{if(emailProvider.isConfigured())return res.status(404).send('Public PDF reports are delivered by email.');prune();const item=reports.get(req.params.id);if(!item?.pdf)return res.status(404).send('PDF expired or unavailable.');res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="lighthouse-website-review.pdf"','Cache-Control':'no-store'}).send(item.pdf);});
 return router;
}
