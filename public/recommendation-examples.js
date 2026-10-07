import {withPageSpeedActions} from './pagespeed-actions.js';
import {esc,safeUrl} from './html.js';
const normalize=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const present=(text,phrase)=>phrase&&(` ${normalize(text)} `).includes(` ${normalize(phrase)} `);
export function suggestedCopy(page,keyword='') {
 const body=page.body||'',headings=[...(page.h1||[]),...(page.h2||[])];
 const supported=present(body,keyword);
 const matchedHeading=headings.find(h=>present(h,keyword));
 const subject=matchedHeading||(supported?keyword.charAt(0).toUpperCase()+keyword.slice(1):headings.find(h=>! /^(welcome|home|services|bookings|contact)(\b|$)/i.test(h)))||page.title||'';
 const brand=page.businessName||'';
 const title=subject&&brand&&!present(subject,brand)&&subject.length+brand.length+3<=75?`${subject} | ${brand}`:subject;
 const sentences=body.split(/(?<=[.!?])\s+/).filter(s=>s.length>=35&&s.length<=240);
 const description=sentences.find(s=>present(s,keyword))||sentences[0]||page.description||'';
 return {title,description,h1:subject,note:'Example based on the retrieved page. Review the wording and business details before publishing.'};
}
function describe(issue,page) {
 if(issue.element==='Title'||/domain-(title|dupe-title)$/.test(issue.id))return page.title?`You have a title tag with ${page.title.length} characters (including spaces). It should clearly describe this page. Around 50–60 characters is a useful writing guide, not a requirement; Google may shorten or rewrite it.`:'We could not find a title tag in the retrieved page. Add a clear title so visitors can understand what this page is about in search results.';
 if(issue.element==='Meta description'||issue.id.includes('description'))return page.description?`You have a meta description with ${page.description.length} characters. Use this short summary to explain what visitors will find and why it is useful. Google may show different text.`:'We could not find a meta description in the retrieved page. Add a short summary that tells visitors what they will find and gives them a reason to click.';
 if(issue.element==='H1'||issue.id==='domain-h1')return page.h1.length?`We found ${page.h1.length} main heading${page.h1.length===1?'':'s'} (H1). Make the main subject easy to recognize, then use smaller headings for supporting sections.`:'We could not find a main heading (H1). Add a clear heading near the top so visitors immediately understand the page.';
 if(issue.id==='domain-thin')return `We found about ${page.wordCount} words on this page. Short pages are not automatically a problem: booking, contact and form pages can work well with very little text. Check whether a visitor can still understand the page and know what to do next.`;
 const simple={intro:'The opening text does not clearly introduce your target topic. Help visitors quickly understand what you offer and whether it is right for them.',thin:`We found about ${page.wordCount} words in the retrieved HTML. Check that all your visible content was captured, then add answers only where visitors need more information.`,'image-alt':'Some images are missing alternative text. This text helps people using screen readers understand useful images; decorative images can have empty alt text.','internal-links':'Your page could make related content easier to find. Add useful links with wording that explains where each link goes.',hierarchy:'Some heading levels are skipped. Arrange the headings in a clear order so the page is easier to navigate.',viewport:'We could not find a mobile viewport setting. This helps a page fit a phone screen instead of appearing as a shrunken desktop page.'};
 return simple[issue.id]||issue.why;
}
export function explainIssue(issue,page,keyword='') {
 const copy=suggestedCopy(page,keyword);let current=issue.evidence,suggested='',label='Suggested implementation',note=copy.note;
 if(issue.element==='Title'||/domain-(title|dupe-title)$/.test(issue.id)){current=page.title||'No title found';suggested=copy.title;label='Suggested title';}
 else if(issue.element==='Meta description'||issue.id.includes('description')){current=page.description||'No meta description found';suggested=copy.description;label='Suggested meta description';note='Example taken from retrieved page copy. Refine it into a concise summary without adding unsupported claims.';}
 else if(issue.element==='H1'||issue.id==='domain-h1'){current=page.h1.join('\n')||'No H1 found';suggested=copy.h1;label='Suggested H1';}
 else if(issue.id==='intro'){current=page.intro||'No opening text found';suggested=copy.description;label='Possible opening text';}
 else if(issue.id==='hierarchy'){current=page.headings.slice(0,8).map(h=>`H${h.level}: ${h.text}`).join('\n');suggested=page.headings.slice(0,8).map((h,i)=>`${i?'H2':'H1'}: ${h.text}`).join('\n');note='Example outline retaining your headings. Use H3 for sections that belong inside an H2 section.';}
 else if(issue.id==='viewport'){current=page.viewport||'No mobile viewport setting found';suggested='<meta name="viewport" content="width=device-width, initial-scale=1">';note='Add this in the HTML head, then check the layout on a phone.';}
 else if(issue.id==='image-alt'){current=page.images.filter(i=>i.alt===null).slice(0,2).map(i=>i.src).join('\n');suggested='For each informative image, describe what it actually shows. For a purely decorative image, use alt="".';note='The image subjects were not inspected, so no image description has been invented.';}
 else if(issue.id==='domain-thin'){
  const subject=page.h1[0]||page.title||'No clear page heading found';
  current=`About ${page.wordCount} words found. Main topic: ${subject}`;
  suggested='Check that the page clearly explains:\n• what this page is for\n• who should use it\n• what happens next\n• how to get help if needed';
  label='Questions to check on this page';
  note='This is a review guide, not replacement copy. Keep the page concise if these questions are already answered.';
 }
 else {suggested=issue.example||issue.fix;note='Implementation guidance; confirm it applies before changing the page.';}
 if(!suggested){suggested='Confirm the page’s subject and business details before drafting this text.';note='There is not enough retrieved copy for a reliable replacement.';}
 if(normalize(suggested)===normalize(current)){note='The source wording is shown as a starting point, not an improved replacement. Review this manually before editing.';label='Starting point for review';}
 return {...issue,why:describe(issue,page),comparison:{current,suggested,label,note,url:page.url,copyable:issue.id!=='domain-thin'}};
}
export function explainReport(report){
 report=withPageSpeedActions(report);
 if(report.mode==='domain')return {...report,target:{...report.target,issues:report.target.issues.map(i=>{const examples=(i.affectedUrls||[]).slice(0,3).map(url=>report.target.pages.find(p=>p.url===url)).filter(Boolean).map(p=>explainIssue(i,p,report.input.keywords[0]||''));return {...i,why:examples[0]?.why||i.why,examples:examples.map(e=>e.comparison)};})}};
 return {...report,target:{...report.target,issues:report.target.issues.map(i=>explainIssue(i,report.target.page,report.input.keywords[0]||''))}};
}
export function renderIssueExamples(issue){
 const items=issue.examples||[issue.comparison].filter(Boolean);
 return items.map(c=>`<div class="recommendation-example">${issue.examples?`<p class="caption"><a href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer">${esc(c.url)}</a></p>`:''}<div class="draft-content"><div><small>What we found</small><p>${esc(c.current)}</p></div><div><div class="draft-title"><small>${esc(c.label)}</small>${c.copyable===false?'':`<button class="copy-button" data-copy="${esc(c.suggested)}">Copy</button>`}</div><p>${esc(c.suggested)}</p></div></div><p class="caption">${esc(c.note)}</p></div>`).join('');
}
