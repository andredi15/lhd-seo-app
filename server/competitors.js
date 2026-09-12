import { matchKeyword, normalize, tokens } from './keywords.js';

export function compareCompetitors(target, competitors) {
  const successful = competitors.filter(c => c.analysis);
  const gaps = []; const corpus = normalize(target.page.body);
  const commercial = target.keywords.some(k => k.intent.labels.some(l => ['Transactional', 'Commercial investigation'].includes(l)));
  for (const topic of target.topics) {
    if (!commercial && ['Services and scope','Pricing and estimates','Project examples','Reviews and testimonials','Qualifications and guarantees'].includes(topic.name)) continue;
    if (topic.group === 'Local Relevance Gaps' && !target.score.localRelevant) continue;
    const evidence = successful.flatMap(c => c.analysis.topics.filter(t => t.name === topic.name && t.present).map(t => ({ url: c.analysis.page.url, quote: t.evidence })));
    if (!topic.present && evidence.length) gaps.push({ group: topic.group, topic: topic.name, evidence, frequency: evidence.length, usefulness: topic.group === 'Trust Gaps' ? 'Useful only when authentic evidence exists for this business. Competitor claims are not verified.' : topic.group === 'Local Relevance Gaps' ? 'Useful for local intent only when the business genuinely serves those areas; do not copy competitors’ locations.' : 'Consider whether this helps the visitor understand scope, compare options, or act. Competitor presence alone does not establish relevance.', status: 'No matching lexical signal in target copy; review for differently worded coverage.' });
  }
  const candidateMap = new Map();
  for (const c of successful) {
    for (const heading of [...c.analysis.page.h2, ...c.analysis.page.h3, ...c.analysis.page.faqs]) {
      if (heading.length < 8 || heading.length > 180 || /cookie|privacy|subscribe|newsletter|navigation|menu/i.test(heading)) continue;
      if (matchKeyword(target.page.body, heading).coverage >= .7 || corpus.includes(normalize(heading))) continue;
      const relevant = target.keywords.some(k => tokens(heading).some(t => tokens(k.keyword).includes(t)));
      if (!relevant) continue;
      const key = normalize(heading); const candidate = candidateMap.get(key) || { group: /\?$|^(how|what|when|why|can|do|does)\b/i.test(heading) ? 'Missing Questions' : 'Missing Services or Subtopics', topic: heading, evidence: [], frequency: 0, usefulness: 'This competitor heading overlaps the requested subject. Evaluate the underlying customer need and your real offering before adding an original section; do not duplicate their wording or unsupported services.', status: 'Candidate gap inferred from heading terms; semantic equivalence may be missed.' };
      if (!candidate.evidence.some(e => e.url === c.analysis.page.url)) { candidate.evidence.push({ url: c.analysis.page.url, quote: heading }); candidate.frequency++; }
      candidateMap.set(key, candidate);
    }
  }
  gaps.push(...[...candidateMap.values()].sort((a, b) => b.frequency - a.frequency).slice(0, 12));
  const mean = successful.length ? Math.round(successful.reduce((n, c) => n + c.analysis.score.overall, 0) / successful.length) : null;
  const delta = mean === null ? null : target.score.overall - mean;
  const position = delta === null ? 'Not assessed' : delta >= 10 ? 'Ahead' : delta >= -9 ? 'Competitive' : delta >= -24 ? 'Moderate Gap' : 'Significant Gap';
  const strongest = [...target.score.categories].sort((a, b) => b.score - a.score)[0];
  const weakest = [...target.score.categories].sort((a, b) => a.score - b.score)[0];
  const explanation = mean === null ? 'No successfully retrieved competitor pages are available.' : `The target’s heuristic score is ${target.score.overall}, compared with an average of ${mean} across ${successful.length} retrieved competitor page(s). ${strongest.name} is the strongest measured category; ${weakest.name} is the weakest. ${gaps.length} candidate gaps need editorial review. This compares only the supplied pages, not live search rankings.`;
  return { position, mean, delta, explanation, successfulCount: successful.length, requestedCount: competitors.length, gaps };
}

export const comparisonFactors = [
  ['SEO Optimization Score', a => a.score.overall],
  ['Title optimization (primary)', a => a.keywords[0].title.label],
  ['Title length', a => a.page.title.length],
  ['H1', a => a.page.h1.join(' | ') || 'Not detected'],
  ['Heading structure', a => `${a.page.h2.length} H2 / ${a.page.h3.length} H3 / ${a.page.hierarchyIssues.length} level skips`],
  ['Approximate word count', a => a.page.wordCount],
  ['Topic signals (not depth)', a => a.topics.filter(t => t.present).map(t => t.name).join(', ') || 'Not detected'],
  ['Keyword targeting (primary)', a => a.keywords[0].score],
  ['Semantic coverage', a => `${a.keywords[0].coverage}% lexical proxy; editorial review required`],
  ['Internal links', a => a.page.internalLinks.length],
  ['External references / links', a => a.page.externalLinks.length],
  ['Images', a => a.page.images.length],
  ['Alt attributes', a => `${a.page.images.filter(i => i.alt !== null).length}/${a.page.images.length} present; ${a.page.images.filter(i => i.alt === '').length} empty`],
  ['Structured data', a => a.page.schemaTypes.join(', ') || 'Not detected'],
  ['Local signals', a => ['serviceArea', 'phone', 'localSchema', 'map'].filter(s => a.page.signals[s]).join(', ') || 'Not detected'],
  ['FAQs / question headings', a => a.page.faqs.length],
  ['Trust / review wording', a => a.page.signals.trust || a.page.signals.reviews ? 'Detected; unverified' : 'Not detected'],
  ['Calls to action', a => a.page.signals.cta ? 'Detected' : 'Not detected'],
  ['Freshness signals', a => a.page.freshness.join(', ') || 'Not detected; age unknown']
];

export function comparisonTable(target, competitors) {
  return comparisonFactors.map(([factor, get]) => ({ factor, target: get(target), competitors: competitors.map(c => c.analysis ? get(c.analysis) : 'Unavailable') }));
}
