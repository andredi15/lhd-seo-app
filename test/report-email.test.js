import test from 'node:test';
import assert from 'node:assert/strict';
import {createReportEmailProvider,validateReportEmail} from '../server/integrations/report-email.js';

test('report email validation accepts normal addresses and rejects missing or unsafe values',()=>{
 assert.equal(validateReportEmail(' person@example.com '),'person@example.com');
 for(const value of ['', 'person', 'person@example', 'a@example.com\r\nBcc:x@example.com'])assert.throws(()=>validateReportEmail(value),/valid email/);
});

test('Resend provider sends the generated PDF and a discreet follow-up copy',async()=>{
 let request;
 const provider=createReportEmailProvider({apiKey:'secret-key',from:'Lighthouse <reports@example.com>',replyTo:'hello@example.com',bcc:'owner@example.com',bookingUrl:'https://example.com/book',fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({id:'email_123'})};}});
 const report={id:'report-123',target:{url:'https://example.com/',score:{overall:77}},summary:{nextMove:'Clarify the main service.'}};
 const result=await provider.send({to:'person@example.com',report,pdf:Buffer.from('pdf bytes')});
 assert.equal(result.id,'email_123');assert.equal(request.url,'https://api.resend.com/emails');assert.equal(request.options.headers.Authorization,'Bearer secret-key');
 const body=JSON.parse(request.options.body);assert.deepEqual(body.to,['person@example.com']);assert.deepEqual(body.bcc,['owner@example.com']);assert.equal(body.reply_to,'hello@example.com');assert.equal(body.attachments[0].content,Buffer.from('pdf bytes').toString('base64'));assert.match(body.html,/Book a free call/);assert.match(body.html,/https:\/\/example.com\/book/);assert.match(body.text,/https:\/\/example.com\/book/);assert.ok(!request.options.body.includes('secret-key'));
});

test('BCC is omitted when it duplicates the audit recipient',async()=>{
 let payload;
 const provider=createReportEmailProvider({apiKey:'key',from:'reports@example.com',bcc:'PERSON@example.com',fetchImpl:async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({id:'email_456'})};}});
 await provider.send({to:'person@example.com',report:{id:'r',target:{url:'https://example.com',score:{overall:1}},summary:{nextMove:'Review'}},pdf:Buffer.from('x')});
 assert.equal(payload.bcc,undefined);
});

test('email delivery failures use a client-safe message',async()=>{
 const provider=createReportEmailProvider({apiKey:'key',from:'reports@example.com',fetchImpl:async()=>({ok:false,status:403,json:async()=>({message:'private upstream detail'})})});
 await assert.rejects(()=>provider.send({to:'person@example.com',report:{id:'r',target:{url:'https://example.com',score:{overall:1}},summary:{nextMove:'Review'}},pdf:Buffer.from('x')}),error=>/could not email/.test(error.message)&&!error.message.includes('private'));
});
