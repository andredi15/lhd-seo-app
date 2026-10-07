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
const commonWords=new Set('a an the of for and or to in at by with near me my your our'.split(' '));
const phraseCount=(text,phrase)=>{const hay=` ${normalize(text)} `,needle=normalize(phrase);return needle?hay.split(` ${needle} `).length-1:0;};
export function domainKeywordCoverage(pages,keywords){
 if(!keywords?.length)return `<section class="topic-match"><h2>Does your website reflect what you offer?</h2><p>No services, topics or locations were entered, so we could not compare your website with your business focus. Add up to three on your next review if you would like this check.</p></section>`;
 const home=pages[0];
 const cards=keywords.map(value=>{
  const keyword=value.keyword||value,words=normalize(keyword).split(' ').filter(w=>w&&!commonWords.has(w));
  const rows=pages.map(p=>{const count=phraseCount(p.body,keyword),all=normalize(`${p.title} ${p.h1.join(' ')} ${p.h2.join(' ')} ${p.h3.join(' ')} ${p.body}`),matched=words.filter(w=>` ${all} `.includes(` ${w} `)).length;return {p,count,density:count*words.length/Math.max(1,p.wordCount)*100,related:words.length?matched/words.length:0};});
  const exactPages=rows.filter(r=>r.count>0),relatedPages=rows.filter(r=>r.related>=.6),total=exactPages.reduce((n,r)=>n+r.count,0),highest=rows.reduce((a,b)=>b.density>a.density?b:a,rows[0]);
  const title=placement(home.title,keyword),h1=placement(home.h1.join(' '),keyword),body=placement(home.body,keyword);
  const repetitive=highest.count>=8&&highest.density>3;
  const clear=!repetitive&&(title==='pass'||h1==='pass'||exactPages.length>=Math.min(2,pages.length));
  const partial=!repetitive&&!clear&&(exactPages.length||relatedPages.length);
  const status=repetitive?'review':clear?'pass':partial?'review':'fail',label=repetitive?'Check repetition':clear?'Clear match':partial?'Some matching language':'Not clearly found';
  const locations=[title==='pass'?'page title':'',h1==='pass'?'main heading':'',body==='pass'?'page text':''].filter(Boolean);
  const explanation=repetitive?`This wording appears often on one page. Read it aloud and replace unnecessary repetition with clear, natural language.`:clear?`Visitors can find a clear connection between this offering and the reviewed website.`:partial?`Some related wording appears, but the connection could be clearer on the most relevant service page.`:`We did not find this exact wording or a strong combination of its main words. A natural alternative may still be present, so review the relevant page before changing it.`;
  return `<article class="topic-match-card"><div class="topic-match-heading"><h3>${esc(keyword)}</h3>${statusMark(status,label)}</div><p>${esc(explanation)}</p><ul><li>${exactPages.length} of ${pages.length} reviewed pages use the exact wording.</li><li>${total} exact mention${total===1?'':'s'} across page text.</li><li>Homepage: ${locations.length?`found in ${esc(locations.join(', '))}`:'exact wording not found in the title, main heading or page text'}.</li><li>${total?`Highest use on one page: ${highest.density.toFixed(1)}% of its words.`:'No exact-phrase percentage is available.'}</li></ul>${highest?.count?`<p class="caption">Most frequent page: ${esc(highest.p.title||highest.p.h1[0]||highest.p.url)}</p>`:''}</article>`;
 }).join('');
 return `<section class="topic-match"><h2>Does your website reflect what you offer?</h2><p>We compared the services, topics or locations you entered with the words found across the reviewed pages. Percentages describe what we observed; there is no ideal keyword-density target, and repeating a phrase more often does not automatically improve SEO.</p><div class="topic-match-grid">${cards}</div></section>`;
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
