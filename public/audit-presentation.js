import {esc} from './html.js';
const normalize=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function placement(text,keyword){
 const hay=` ${normalize(text)} `,needle=normalize(keyword);
 if(!needle)return 'unknown';
 if(hay.includes(` ${needle} `))return 'pass';
 const words=needle.split(' ').filter(w=>!['a','an','the','of','for','and','or','to','in','at','by','with','near','me'].includes(w));
 return words.some(w=>hay.includes(` ${w} `))?'review':'fail';
}
const states={pass:['✓','Found'],review:['!','Review'],fail:['×','Not found'],unknown:['—','Not assessed']};
export function statusMark(status,label){const [symbol,text]=states[status]||states.unknown;return `<span class="audit-status audit-${status}" title="${esc(label||text)}"><b aria-hidden="true">${symbol}</b><span>${esc(label||text)}</span></span>`;}
export function keywordPlacement(page,keywords){
 const columns=[['Title',page.title],['Meta description',page.description],['H1',page.h1.join(' ')],['H2 / H3',[...page.h2,...page.h3].join(' ')],['Opening copy',page.intro],['Body',page.body]];
 return `<section class="card placement-card"><h2>Keyword Placement at a Glance</h2><p class="caption">Where your chosen keywords appear in the retrieved page.</p><div class="audit-legend">${statusMark('pass','Phrase found')}${statusMark('review','Some words found')}${statusMark('fail','Phrase not found')}</div><div class="table-wrap"><table class="placement-table"><thead><tr><th scope="col">Target keyword</th>${columns.map(([name])=>`<th scope="col">${name}</th>`).join('')}</tr></thead><tbody>${keywords.map(k=>`<tr><th scope="row">${esc(k.keyword||k)}</th>${columns.map(([name,text])=>`<td>${statusMark(placement(text,k.keyword||k))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="caption">Checks ignore case, accents and punctuation. “Review” means some words appear, not necessarily together or with the same meaning. A red cross is a placement observation, not an SEO failure. Natural alternatives can work; do not repeat every keyword in every section.</p></section>`;
}
export function pageCheckRows(p){
 const missing=p.images.filter(i=>i.alt===null).length;
 const rows=[
 ['Title tag',!p.title?'fail':p.title.length<30||p.title.length>65?'review':'pass',!p.title?'No title tag was found. Add a clear title describing this page.':`You have a title tag with ${p.title.length} characters. It should explain the page clearly; length alone does not determine quality.`,p.title],
 ['Meta description',!p.description?'fail':p.description.length<70||p.description.length>170?'review':'pass',!p.description?'No meta description was found. Write a short summary that gives people a reason to visit.':`You have a meta description with ${p.description.length} characters. Review whether it describes the page naturally and encourages a useful click.`,p.description],
 ['Main heading (H1)',!p.h1.length?'fail':p.h1.length>1?'review':'pass',p.h1.length===1?'Your page has one main heading. It should make the subject clear.':`We found ${p.h1.length} main headings. Review the page outline so visitors can identify its main subject.`,p.h1.join(' | ')],
 ['Heading structure',p.hierarchyIssues.length?'review':p.headings.length?'pass':'review',p.hierarchyIssues.length?'Some heading levels are skipped. Check that subheadings follow a logical order.':'No skipped heading levels were detected. Use subheadings where they help readers scan the page.',''],
 ['Image descriptions',!p.images.length?'unknown':missing?'review':'pass',!p.images.length?'No images were found in the retrieved HTML.':`${missing} of ${p.images.length} images lack an alt attribute. Describe meaningful images; empty alt text can be right for decorative images.`,''],
 ['Canonical URL',p.canonical?'pass':'review',p.canonical?'A preferred URL is declared. Confirm it points to the version you want search engines to use.':'No canonical URL was found. Review whether a preferred URL should be declared; absence alone does not prove a problem.',p.canonical],
 ['Indexing directive',p.robots.some(r=>/\bnoindex\b|\bnone\b/i.test(r))?'review':'pass',p.robots.some(r=>/\bnoindex\b|\bnone\b/i.test(r))?'The page asks search engines not to index it. Check whether this is intentional.':'No noindex directive was detected. This does not confirm that Google has indexed the page.',p.robots.join('; ')],
 ['HTTPS',p.https?'pass':'review',p.https?'The retrieved page uses an encrypted HTTPS connection.':'The retrieved page does not use HTTPS. Review secure access.',''],
 ['Structured data',p.schemaErrors.length?'review':p.schemaTypes.length?'pass':'unknown',p.schemaErrors.length?'Some structured data could not be parsed. Review the errors in Technical.':p.schemaTypes.length?'Structured data was detected. Presence does not prove validity or rich-result eligibility.':'No recognized structured data was detected. Add it only when relevant to the page.',p.schemaTypes.join(', ')]
 ];
 return `<div class="audit-rows">${rows.map(([title,status,description,value])=>`<article class="audit-row"><div><h3>${title}</h3><p>${esc(description)}</p>${value?`<p class="audit-observed">${esc(value)}</p>`:''}</div>${statusMark(status,status==='pass'?'Pass':status==='fail'?'Missing':status==='unknown'?'Not assessed':'Review')}</article>`).join('')}</div><p class="caption">Presence and structure checks, not a ranking prediction. Business/site name: ${esc(p.businessName||'Not detected')}. Approximate words: ${p.wordCount}. More words are not automatically better.</p>`;
}
