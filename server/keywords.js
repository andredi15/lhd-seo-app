export const normalize = text => String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stop = new Set('a an the of for and or to in at by with near me my your our'.split(' '));
const stem = word => word.length > 5 ? word.replace(/(?:ing|ers|er|es|s)$/, '') : word.replace(/s$/, '');
export const tokens = text => [...new Set(normalize(text).split(' ').filter(w => w && !stop.has(w)).map(stem))];
export function matchKeyword(text, keyword) {
  const exact = (` ${normalize(text)} `).includes(` ${normalize(keyword)} `);
  const wanted = tokens(keyword); const present = new Set(tokens(text));
  const coverage = wanted.length ? wanted.filter(w => present.has(w)).length / wanted.length : 0;
  return { exact, coverage, score: exact ? 100 : Math.round(coverage * 85), label: exact ? 'Exact phrase' : coverage >= .8 ? 'Close lexical variation' : coverage >= .4 ? 'Partial topic terms' : 'Not detected' };
}
const knownPlaces = ['mississauga','toronto','brampton','oakville','burlington','hamilton','ottawa','vancouver','calgary','edmonton','montreal','winnipeg','kitchener','waterloo','london','new york','los angeles','chicago','sydney','melbourne','perth','brisbane','manchester','birmingham','leeds','dallas','austin','seattle','boston','miami'];
export function inferIntent(keyword, page) {
  const k = normalize(keyword);
  const places = [...new Set([...knownPlaces, ...(page.locations || []).map(normalize)])].filter(p => (` ${k} `).includes(` ${p} `));
  const namedArea = /\b(?:in|near|around)\s+(.+)/i.exec(keyword)?.[1];
  if (namedArea && normalize(namedArea) !== 'me') places.push(normalize(namedArea));
  const local = places.length > 0 || /\bnear me\b/.test(k);
  const informational = /\b(how|what|why|guide|tips|ideas|tutorial|learn)\b/.test(k);
  const commercial = /\b(best|compare|vs|reviews|cost|price|pricing|top)\b/.test(k);
  const transactional = /\b(service|services|company|contractor|hire|buy|book|repair|installation|landscap\w*|plumb\w*|dentist|lawyer|agency|clean\w*)\b/.test(k);
  const brand = normalize(page.businessName);
  const navigational = !!brand && brand.length > 3 && k.includes(brand);
  const labels = [];
  if (informational) labels.push('Informational');
  if (commercial) labels.push('Commercial investigation');
  if (transactional && !informational) labels.push('Transactional');
  if (local) labels.push('Local');
  if (navigational) labels.push('Navigational');
  const ambiguous = !labels.length;
  if (ambiguous) labels.push('Informational');
  const isBlog = /\/blog\/|\/article\//i.test(page.url) || page.schemaTypes.some(t => /Article|BlogPosting/.test(t)) || /\bguide|how to\b/i.test(page.h1.join(' '));
  const isHome = new URL(page.url).pathname === '/';
  const type = isBlog ? 'Article / guide' : page.signals.services ? 'Service / commercial page' : isHome ? 'Homepage' : 'General content page';
  let score = 55; let explanation = 'Intent is inferred from query wording; live search results were not consulted.';
  if (informational) { score = isBlog ? 95 : page.h2.length > 1 ? 70 : 45; explanation += ' Question or learning language suggests an explanatory answer.'; }
  else if (transactional || commercial) {
    score = Math.min(95, 35 + (page.signals.services ? 25 : 0) + (page.signals.cta ? 20 : 0) + (page.signals.trust ? 15 : 0));
    if (isBlog) score = Math.min(score, 45);
    explanation += ' Service, buying, or evaluation terms suggest a commercial decision.';
    if (isBlog) explanation += ' The detected article format may under-serve this commercial query.';
    if (isHome && !navigational) explanation += ' Check whether a dedicated page would answer the query more directly than this homepage.';
  }
  if (local) explanation += ' Geographic wording suggests a business serving that area.';
  if (ambiguous) explanation += ' The wording is ambiguous; informational intent is a tentative fallback, and no commercial intent is assumed.';
  return { labels, local, places: [...new Set(places)], pageType: type, score, explanation, confidence: ambiguous ? 'Low' : 'Moderate', method: 'Heuristic inference, not a SERP classification' };
}

export const conceptDefinitions = [
  ['Services and scope', /\bservices?|what we (do|offer)|installation|repair|maintenance/ig, 'Missing Services or Subtopics'],
  ['Pricing and estimates', /\bpricing|costs?|estimates?|quotes?|fees?\b/ig, 'Missing Topics'],
  ['Process and timelines', /\bprocess|steps?|timelines?|how it works|consultation/ig, 'Missing Topics'],
  ['Project examples', /\bcase stud\w*|portfolio|project examples?|our projects|before and after/ig, 'Trust Gaps'],
  ['Reviews and testimonials', /\btestimonials?|customer reviews?|client reviews?/ig, 'Trust Gaps'],
  ['Qualifications and guarantees', /\bcertif\w*|licensed|insured|guarantee\w*|accredit\w*/ig, 'Trust Gaps'],
  ['Service areas', /\bservice areas?|areas we serve|serving|located in|based in/ig, 'Local Relevance Gaps'],
  ['Customer questions', /\bfrequently asked|faq\b|common questions/ig, 'Missing Questions'],
  ['Benefits and suitability', /\bbenefits?|ideal for|suited to|why choose|advantages?/ig, 'Missing Topics']
];

export function concepts(page) {
  return conceptDefinitions.map(([name, regex, group]) => {
    const matches = [...page.body.matchAll(new RegExp(regex.source, regex.flags))];
    const first = matches[0];
    return { name, group, count: matches.length, present: matches.length > 0, evidence: first ? page.body.slice(Math.max(0, first.index - 55), first.index + 160) : '', url: page.url, confidence: 'Lexical signal; usefulness and depth need editorial review.' };
  });
}

export function analyzeKeywords(page, keywords) {
  return keywords.map(keyword => {
    const intent = inferIntent(keyword, page);
    const title = matchKeyword(page.title, keyword), h1 = matchKeyword(page.h1.join(' '), keyword), headings = matchKeyword([...page.h2, ...page.h3].join(' '), keyword), intro = matchKeyword(page.intro, keyword), body = matchKeyword(page.body, keyword);
    const anchors = page.internalLinks.filter(l => matchKeyword(l.anchor, keyword).coverage >= .5 && l.anchor.length > 3);
    const localMatches = intent.places.filter(p => (` ${normalize(page.body)} `).includes(` ${p} `));
    const localScore = intent.local ? Math.round((localMatches.length || (intent.places.length === 0 && page.signals.serviceArea) ? 40 : 0) + (page.signals.serviceArea ? 20 : 0) + (page.signals.contact ? 20 : 0) + (page.signals.localSchema ? 20 : 0)) : null;
    const phrase = normalize(keyword); const normalizedBody = ` ${normalize(page.body)} `;
    const count = normalizedBody.split(` ${phrase} `).length - 1;
    const stuffing = count >= 8 && (count * phrase.split(' ').length / Math.max(1, page.wordCount)) > .12;
    const coverage = Math.round(body.score * .6 + headings.score * .4);
    const score = Math.max(0, Math.round(title.score * .18 + h1.score * .15 + intro.score * .12 + coverage * .2 + intent.score * .2 + (anchors.length ? 85 : 25) * .05 + (localScore ?? body.score) * .1 - (stuffing ? 15 : 0)));
    return { keyword, score, intent, title, h1, headings, intro, body, coverage, internalLinkScore: anchors.length ? 85 : 25, supportingAnchors: anchors.slice(0, 12), localScore, localMatches, phraseOccurrences: count, possibleStuffing: stuffing, explanation: `Title: ${title.label.toLowerCase()}; H1: ${h1.label.toLowerCase()}; opening copy: ${intro.label.toLowerCase()}. ${anchors.length} supporting internal anchor(s) detected. Coverage measures lexical breadth, not content quality or ranking likelihood.` };
  });
}
