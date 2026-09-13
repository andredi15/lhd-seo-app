import {explainReport} from '../public/recommendation-examples.js';
import { randomUUID } from 'node:crypto';
import { normalizeUrl, crawlPage } from './crawler.js';
import { parsePage } from './parser.js';
import { analyzeKeywords, concepts } from './keywords.js';
import { scorePage } from './scoring.js';
import { analyzeRules, makeImprovements, priorityOrder } from './rules.js';
import { compareCompetitors, comparisonTable } from './competitors.js';
import { analyzeAI } from './ai.js';

export function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Provide a target URL and keywords.');
  const targetUrl = normalizeUrl(input.targetUrl);
  const raw = Array.isArray(input.keywords) ? input.keywords : typeof input.keywords === 'string' ? input.keywords.split(/[\n,]+/) : [];
  if (raw.some(k => typeof k !== 'string')) throw new Error('Keywords must be text.');
  const keywords = [...new Map(raw.map(k => k.trim()).filter(Boolean).map(k => [k.toLowerCase(), k])).values()];
  if (!keywords.length || keywords.length > 20 || keywords.some(k => k.length > 160 || !/[\p{L}\p{N}]/u.test(k))) throw new Error('Enter 1–20 keywords, each 1–160 characters and containing a letter or number.');
  if (input.competitorUrls && !Array.isArray(input.competitorUrls)) throw new Error('Competitor URLs must be a list.');
  const rawCompetitors = input.competitorUrls || [];
  if (rawCompetitors.some(v => typeof v !== 'string')) throw new Error('Each competitor URL must be text.');
  if (rawCompetitors.length > 5) throw new Error('A maximum of 5 competitors is supported.');
  const competitors = [...new Set(rawCompetitors.filter(v => typeof v === 'string' && v.trim()).map(normalizeUrl))].filter(u => u !== targetUrl);
  return { targetUrl, keywords, competitorUrls: competitors, duplicatesRemoved: rawCompetitors.filter(v => typeof v === 'string' && v.trim()).length - competitors.length };
}

export function analyzePage(page, words) {
  const keywords = analyzeKeywords(page, words); const topics = concepts(page);
  return { page, keywords, topics, score: scorePage(page, keywords, topics), issues: analyzeRules(page, keywords, topics) };
}

export async function buildReport(input, emit = () => {}, signal, dependencies = {}) {
  const crawl = dependencies.crawl || crawlPage; const ai = dependencies.ai || analyzeAI;
  const robotsCache = new Map();
  emit('Fetching target page');
  const fetched = await crawl(input.targetUrl, { signal, robotsCache });
  emit('Analyzing page structure');
  const page = parsePage(fetched);
  emit('Evaluating keyword targeting');
  const target = analyzePage(page, input.keywords);
  const competitors = [];
  for (let i = 0; i < input.competitorUrls.length; i++) {
    if (signal?.aborted) throw new Error('Analysis cancelled.');
    emit(`Analyzing competitors (${i + 1}/${input.competitorUrls.length})`);
    const url = input.competitorUrls[i];
    try { const fetchedCompetitor = await crawl(url, { signal, robotsCache }); competitors.push({ url, analysis: analyzePage(parsePage(fetchedCompetitor), input.keywords) }); }
    catch (error) { if (signal?.aborted) throw error; competitors.push({ url, error: error.message }); }
  }
  emit('Identifying content gaps');
  const comparison = compareCompetitors(target, competitors);
  const report = { id: randomUUID(), schemaVersion: 1, date: new Date().toISOString(), input, target, competitors, comparison, table: comparisonTable(target, competitors), warnings: [
    'Static HTML only: JavaScript-rendered content, visual layout and image subject matter are not assessed.',
    'Search intent, content depth, semantic coverage and local signals use imperfect English-language heuristics. Review conclusions before publishing.',
    ...(page.wordCount < 80 ? ['Very little text was retrieved. Scores have low evidential confidence; check the rendered page before drawing conclusions.'] : []),
    ...(page.textTruncated ? ['Extracted text exceeds the analysis limit. Only the first 120,000 characters are analyzed.'] : []),
    ...(input.duplicatesRemoved ? [`${input.duplicatesRemoved} duplicate/target competitor URL(s) removed.`] : []),
    ...competitors.filter(c => c.error).map(c => `${c.url}: ${c.error}`)
  ], integrations: [], improvements: makeImprovements(page, target.keywords, target.issues, comparison.gaps) };
  for (const [i, gap] of comparison.gaps.slice(0, 5).entries()) target.issues.push({ id: `gap-${i}`, priority: 'Medium Impact', element: gap.group, issue: `Evaluate a section about ${gap.topic}`, evidence: gap.evidence.map(e => `${e.url}: “${e.quote}”`).join('\n'), why: gap.usefulness, fix: 'Check whether the target already covers this need in different wording. If it is relevant to the actual offering, add an original, useful answer backed by business facts.', example: '', sourceUrl: page.url, basis: 'Competitor-derived hypothesis; editorial review required' });
  target.issues.sort((a,b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
  emit('Building recommendations');
  const strong = target.score.categories.filter(c => c.score >= 75).map(c => c.name);
  report.summary = {
    "What's Working": strong.length ? `The strongest observed areas are ${strong.join(', ')}. Preserve those elements while addressing the main gaps.` : 'The retrieved page provides a starting point, but none of the measured categories reached the strong-signal threshold. Confirm the rendered page before judging sparse extraction.',
    "What's Holding the Page Back": target.issues.length ? target.issues.slice(0, 2).map(i => `${i.issue}: ${i.why}`).join(' ') : 'No major issues were detected by these rules. That does not establish ranking strength or replace an editorial review.',
    'Biggest Opportunity': comparison.gaps.length ? `Evaluate ${comparison.gaps[0].topic.toLowerCase()} against the customer’s needs. ${comparison.gaps[0].usefulness}` : target.issues[0]?.fix || 'Validate the page against real customer questions and search-result intent, then measure how visitors respond.',
    'Recommended Next Move': target.issues[0] ? `${target.issues[0].issue}. ${target.issues[0].fix}` : 'Review the page manually, then use connected search and conversion data to identify the next meaningful improvement.'
  };
  report.ai = await ai(report, signal);
  report.actionPlan = {
    'Fix First': target.issues.filter(i => ['Critical', 'High Impact'].includes(i.priority)).map(i => ({ id: i.id, text: i.issue, detail: i.fix })),
    Next: target.issues.filter(i => ['Medium Impact', 'Low Impact'].includes(i.priority)).map(i => ({ id: i.id, text: i.issue, detail: i.fix })),
    Ongoing: [{ id: 'ongoing-review', text: 'Review content against real customer questions', detail: 'Keep business details accurate; add supporting content only where it serves a need.' }, { id: 'ongoing-measure', text: 'Measure search visibility and conversions', detail: 'Use Search Console, analytics, or a legitimate rank data source when connected. This report contains none of those metrics.' }]
  };
  return explainReport(report);
}
