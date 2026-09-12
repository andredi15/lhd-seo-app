const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const pct = (checks) => Math.round(100 * checks.filter(Boolean).length / checks.length);
export function scorePage(page, keywords, topics) {
  const local = keywords.some(k => k.intent.local);
  const commercial = keywords.some(k => k.intent.labels.some(l => ['Transactional', 'Commercial investigation'].includes(l)));
  const noindex = page.robots.some(r => /\bnoindex\b|\bnone\b/i.test(r));
  const textChecks = [page.wordCount >= 80, page.h2.length > 0, average(keywords.map(k => k.body.coverage)) >= .5, average(keywords.map(k => k.intro.coverage)) >= .5];
  if (commercial) textChecks.push(topics.filter(t => t.present).length >= 3);
  const categories = [
    { name: 'Search Intent & Relevance', weight: local ? 20 : 25, score: Math.round(average(keywords.map(k => k.intent.score * .5 + k.body.score * .5))), basis: 'Equal parts query/page-type inference and body topic-term coverage.' },
    { name: 'Content Quality & Topic Coverage', weight: local ? 20 : 25, score: pct(textChecks), basis: 'Proxies: extractable copy, subheadings, body and intro topic terms; commercial pages also checked for supporting topics. No reward for excess length.' },
    { name: 'On-Page SEO', weight: 20, score: Math.round(average([page.title ? 100 : 0, page.description ? 100 : 0, page.h1.length === 1 ? 100 : 30, average(keywords.map(k => k.title.score)), average(keywords.map(k => k.h1.score)), keywords.some(k => k.possibleStuffing) ? 0 : 100])), basis: 'Metadata presence, one primary heading, keyword placement, and no repetition warning.' },
    { name: 'Technical/Page Structure', weight: 15, score: pct([page.status >= 200 && page.status < 300, !noindex, page.https, !!page.viewport, !page.hierarchyIssues.length, !!page.canonical, !page.schemaErrors.length]), basis: 'Seven equal checks: success response, index directive, HTTPS, viewport, heading order, canonical and JSON-LD syntax. Does not establish actual indexing.' },
    { name: 'Internal Linking & Site Signals', weight: 10, score: pct([page.internalLinks.length > 0, page.internalLinks.some(l => l.anchor.length > 4 && !/^(click here|read more|learn more)$/i.test(l.anchor)), keywords.some(k => k.supportingAnchors.length > 0)]), basis: 'Observed outbound internal links, descriptive anchors, and topic-related anchors. Inbound links are not crawled.' },
    ...(local ? [{ name: 'Local SEO Signals', weight: 10, score: Math.round(average(keywords.filter(k => k.intent.local).map(k => k.localScore))), basis: 'Geographic mentions 40%, service-area language 20%, contact 20%, local schema 20%. Presence does not verify business eligibility.' }] : []),
    { name: 'Conversion/Trust Signals', weight: 5, score: pct(commercial ? [page.signals.cta, page.signals.contact, page.signals.trust || page.signals.reviews] : [page.internalLinks.length > 0 || page.externalLinks.length > 0, !!page.businessName || page.schemaTypes.length > 0]), basis: commercial ? 'CTA, contact route, and trust/review wording.' : 'Supporting references/navigation and detectable attribution.' }
  ];
  const raw = Math.round(categories.reduce((sum, c) => sum + c.score * c.weight / 100, 0));
  return { overall: noindex ? Math.min(35, raw) : raw, raw, categories, localRelevant: local, capReason: noindex ? 'Score capped at 35 because a noindex/none directive was observed.' : '', label: 'SEO Optimization Score', version: '1.0', methodology: 'A transparent heuristic prioritization aid, not a Google ranking score. Category names describe review areas; lexical proxies cannot establish content quality. Non-local reports allocate the local 10% equally to intent and content. No rank, traffic, CWV, or backlink data is inferred.' };
}
