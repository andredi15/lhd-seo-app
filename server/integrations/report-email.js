const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function validateReportEmail(value){
 const email=String(value||'').trim();
 if(!email||email.length>254||/[\r\n]/.test(email)||!/^\S+@[^\s@]+\.[^\s@]{2,}$/.test(email))throw new Error('Enter a valid email address so we can send your report.');
 return email;
}

export function createReportEmailProvider({apiKey=process.env.RESEND_API_KEY,from=process.env.PUBLIC_REPORT_FROM_EMAIL,replyTo=process.env.PUBLIC_REPORT_REPLY_TO,bcc=process.env.PUBLIC_REPORT_BCC_EMAIL,bookingUrl=process.env.PUBLIC_REPORT_BOOKING_URL||'https://go.lighthousedigitalhq.com/widget/booking/akGkMgpqzmEW7O7LkuHW',fetchImpl=globalThis.fetch}={}){
 const isConfigured=()=>!!(apiKey&&from);
 return {isConfigured,async send({to,report,pdf}){
  if(!isConfigured())throw new Error('Report email delivery is not configured.');
  const recipient=validateReportEmail(to),host=new URL(report.target.url).hostname,score=report.target.score.overall;
  const subject=`Your Lighthouse website SEO report for ${host}`;
  const html=`<div style="font-family:Arial,sans-serif;color:#264653;line-height:1.6;max-width:620px"><h1 style="font-size:24px">Your website SEO report is ready</h1><p>We reviewed up to 10 pages from <strong>${escapeHtml(host)}</strong>.</p><p style="font-size:18px"><strong>Website SEO Health Score: ${score}/100</strong></p><p><strong>Recommended next move:</strong> ${escapeHtml(report.summary.nextMove)}</p><p>Your complete Lighthouse Digital report is attached as a PDF.</p><div style="margin:26px 0;padding:20px;background:#eaf5f2;border-radius:8px"><p style="margin:0 0 14px"><strong>Would you like to discuss the results?</strong><br>Book a free call with Lighthouse Digital and we can walk through the findings and the changes worth making first.</p><a href="${escapeHtml(bookingUrl)}" style="display:inline-block;background:#237f73;color:#fff;text-decoration:none;padding:11px 17px;border-radius:5px;font-weight:bold">Book a free call</a></div><p style="font-size:12px;color:#64777c">This report describes pages retrieved during the review. It is not a Google ranking, indexed-page count or guarantee.</p></div>`;
  const payload={from,to:[recipient],subject,html,text:`Your Lighthouse website SEO report for ${host} is ready.\n\nWebsite SEO Health Score: ${score}/100\n\nRecommended next move: ${report.summary.nextMove}\n\nYour complete report is attached as a PDF.\n\nWould you like to discuss the results? Book a free call with Lighthouse Digital and we can walk through the findings and the changes worth making first:\n${bookingUrl}`,attachments:[{filename:`lighthouse-seo-report-${host}.pdf`,content:pdf.toString('base64')}]};
  if(replyTo)payload.reply_to=replyTo;
  if(bcc){
   let copy;try{copy=validateReportEmail(bcc);}catch{throw new Error('Report email delivery is not configured correctly.');}
   if(copy.toLowerCase()!==recipient.toLowerCase())payload.bcc=[copy];
  }
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`public-audit/${report.id}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('We completed the review but could not email the report. Please check the address and try again.');
  const data=await response.json();
  if(!data?.id)throw new Error('We completed the review but could not confirm email delivery. Please try again.');
  return {id:data.id};
 }};
}
