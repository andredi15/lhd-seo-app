import {chromium} from 'playwright-core';
let busy=false;
export async function renderPdf(html){
 if(busy)throw new Error('A PDF is already being generated. Try again shortly.');busy=true;let browser,timer;
 try{
  browser=await chromium.launch({headless:true,timeout:20000,...(process.env.PDF_BROWSER_PATH?{executablePath:process.env.PDF_BROWSER_PATH}:{channel:'msedge'})});
  return await Promise.race([(async()=>{
   const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});await context.route('**/*',r=>r.abort());
   const page=await context.newPage();await page.setContent(html,{waitUntil:'load',timeout:15000});
   return await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('PDF generation timed out.')),60000);})]);
 }finally{clearTimeout(timer);await browser?.close().catch(()=>{});busy=false;}
}
