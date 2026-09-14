import {fileURLToPath} from 'node:url';
import express from 'express';
import {rateLimit} from 'express-rate-limit';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateInput,buildReport} from './report.js';
import {collectIntegrations} from './integrations/index.js';
import {withPageSpeedActions} from '../public/pagespeed-actions.js';
import {buildPdfReport} from '../public/pdf-report.js';
import {renderPdf} from './pdf.js';
export function publicInput(body){
 const input=validateInput({targetUrl:body?.targetUrl,keywords:body?.keywords,competitorUrls:[]});
 if(input.keywords.length>3)throw new Error('Choose up to three search phrases for this review.');
 return input;
}
export function createPublicRouter(){
 const router=express.Router(),reports=new Map();let active=false,day='',used=0;
 const limit=Number(process.env.PUBLIC_DAILY_SCAN_LIMIT)||20;
 const prune=()=>{for(const [id,r]of reports)if(r.expires<Date.now())reports.delete(id);};
 const asset=name=>new URL(`../public/${name}`,import.meta.url);
 const sendAsset=name=>async(_req,res,next)=>{try{res.sendFile(fileURLToPath(asset(name)));}catch(e){next(e);}};
 router.get(['/audit','/audit/'],sendAsset('audit.html'));
 for(const file of ['styles.css','visitor.js','visitor.css','audit-presentation.js','html.js','pagespeed-overview.js','pagespeed-presentation.js','recommendation-examples.js','pagespeed-actions.js'])router.get(`/audit-assets/${file}`,sendAsset(file));
 router.get('/audit-assets/logo.png',sendAsset('assets/lighthouse-logo-white.png'));
 router.get('/public-api/config',(_req,res)=>res.set('Cache-Control','no-store').json({pageSpeed:!!process.env.PAGESPEED_API_KEY,bookingUrl:process.env.PUBLIC_BOOKING_URL||'https://lighthousedigitalhq.com/contact/'}));
 router.use('/public-api',express.json({limit:'8kb'}),(req,res,next)=>{
  if(req.method==='POST'){let same=false;try{same=!!req.headers.origin&&new URL(req.headers.origin).host===req.headers.host;}catch{}if(!same)return res.status(403).json({error:'Please submit your scan from the audit page.'});}next();
 });
 router.post('/public-api/analyze',rateLimit({windowMs:86400000,limit:3,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'You have reached the daily limit of three scans. Please try again tomorrow.'}}),async(req,res)=>{
  let input;try{input=publicInput(req.body);}catch(e){return res.status(400).json({error:e.message});}
  const today=new Date().toISOString().slice(0,10);if(day!==today){day=today;used=0;}
  if(used>=limit)return res.status(429).json({error:'Today’s scan allowance has been reached. Please try again tomorrow.'});
  if(active)return res.status(429).json({error:'Another review is running. Please try again in a few minutes.'});
  used++;active=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),300000);
  res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  res.set({'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});res.flushHeaders();
  const send=event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
  try{
   let report=await buildReport(input,message=>send({type:'progress',message}),controller.signal,{ai:async()=>({status:'disabled',note:'Evidence-based page review',insights:[],drafts:[]})});
   if(process.env.PAGESPEED_API_KEY)report.integrations=await collectIntegrations({report,signal:controller.signal,emit:message=>send({type:'progress',message})});
   report=withPageSpeedActions(report);prune();while(reports.size>=20)reports.delete(reports.keys().next().value);
   const id=randomBytes(24).toString('hex');reports.set(id,{report,expires:Date.now()+30*60000});send({type:'report',report,id});
  }catch(e){send({type:'error',error:controller.signal.aborted?'The review was cancelled or timed out. Please try again.':e.message});}
  finally{clearTimeout(timer);active=false;res.end();}
 });
 router.post('/public-api/reports/:id/pdf',rateLimit({windowMs:60000,limit:4,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
  prune();const item=reports.get(req.params.id);if(!item)return res.status(404).json({error:'This report has expired. Run a new review to generate a PDF.'});
  try{if(!item.pdf){const css=await readFile(asset('styles.css'),'utf8'),logo='data:image/png;base64,'+(await readFile(asset('assets/lighthouse-logo-white.png'))).toString('base64');item.pdf=await renderPdf(buildPdfReport(item.report,[],css,logo));}res.json({url:`/public-api/reports/${req.params.id}/pdf`});}catch{res.status(503).json({error:'PDF generation is temporarily unavailable. Your results are still visible below.'});}
 });
 router.get('/public-api/reports/:id/pdf',(req,res)=>{prune();const item=reports.get(req.params.id);if(!item?.pdf)return res.status(404).send('PDF expired or unavailable.');res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="lighthouse-website-review.pdf"','Cache-Control':'no-store'}).send(item.pdf);});
 return router;
}
