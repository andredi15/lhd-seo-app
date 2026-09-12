import * as cheerio from 'cheerio';

export const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.filter(Boolean))];

export function parsePage(fetched) {
  const $ = cheerio.load(fetched.html);
  const meta = (name, attr = 'name') => clean($(`meta[${attr}="${name}" i]`).first().attr('content'));
  const absolute = value => { if (!value || !String(value).trim()) return ''; try { const u = new URL(value, base); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };
  const base = (() => { try { return new URL($('base[href]').first().attr('href') || fetched.finalUrl, fetched.finalUrl).href; } catch { return fetched.finalUrl; } })();
  const schema = []; const schemaErrors = [];
  $('script[type="application/ld+json" i]').each((i, el) => { try { schema.push(JSON.parse($(el).text())); } catch { schemaErrors.push(`JSON-LD block ${i + 1} could not be parsed.`); } });
  const schemaTypes = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value['@type']) schemaTypes.push(...[].concat(value['@type']).filter(t => typeof t === 'string'));
    Object.values(value).forEach(v => { if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') visit(v); });
  };
  schema.forEach(visit);
  $('[itemtype]').each((_, el) => schemaTypes.push(...($(el).attr('itemtype') || '').split(/\s+/).map(t => t.split('/').pop())));
  const title = clean($('title').first().text());
  const description = meta('description');
  const canonicals = $('link[rel~="canonical" i]').map((_, el) => absolute($(el).attr('href'))).get();
  const robots = unique([meta('robots'), meta('googlebot'), String(fetched.headers?.['x-robots-tag'] || '')]);
  const openGraph = {};
  $('meta[property^="og:"]').each((_, el) => { openGraph[$(el).attr('property')] = clean($(el).attr('content')); });
  const maps = $('iframe[src]').map((_, el) => $(el).attr('src')).get().filter(v => /maps\.google|google\.[^/]+\/maps|maps\.app|openstreetmap|bing.com\/maps/i.test(v));
  const phoneLinks = $('a[href^="tel:"]').map((_, el) => clean($(el).attr('href').slice(4))).get();
  const contactLinks = $('a[href^="mailto:"]').map((_, el) => clean($(el).attr('href').slice(7))).get();
  const modified = unique([meta('article:modified_time', 'property'), meta('article:published_time', 'property'), ...$('time[datetime]').map((_, el) => $(el).attr('datetime')).get(), ...findSchemaValues(schema,'datePublished'), ...findSchemaValues(schema,'dateModified')]);
  $('script,style,noscript,template,svg,[hidden],[aria-hidden="true"]').remove();
  const headings = $('h1,h2,h3,h4,h5,h6').map((_, el) => ({ level: Number(el.tagName.slice(1)), text: clean($(el).text()) })).get();
  const links = $('a[href]').map((_, el) => ({ url: absolute($(el).attr('href')), anchor: clean($(el).text()), rel: $(el).attr('rel') || '', inContent: !!$(el).closest('main,article,[role="main"]').length && !$(el).closest('nav,header,footer,aside').length, inNavigation: !!$(el).closest('nav,header,[role="navigation"]').length })).get().filter(l => l.url);
  const host = new URL(fetched.finalUrl).hostname;
  const internalLinks = links.filter(l => new URL(l.url).hostname === host);
  const externalLinks = links.filter(l => new URL(l.url).hostname !== host);
  const images = $('img').map((_, el) => ({ src: absolute($(el).attr('src') || $(el).attr('data-src') || ''), alt: $(el).attr('alt') === undefined ? null : clean($(el).attr('alt')), decorative: $(el).attr('role') === 'presentation', width: $(el).attr('width') || '', height: $(el).attr('height') || '' })).get();
  const allText = clean($('body').text());
  const content = $('main,[role="main"]').first().length ? $('main,[role="main"]').first() : $('article').first().length ? $('article').first() : $('body');
  const clone = content.clone(); clone.find('nav,header,footer,aside,form,button').remove();
  // Preserve boundaries between block elements before whitespace normalization.
  clone.find('p,div,li,section,h1,h2,h3,h4,h5,h6,br,tr').each((_, el) => $(el).append(' '));
  const fullBody = clean(clone.text());
  const body = fullBody.slice(0, 120000);
  const h = level => headings.filter(h => h.level === level).map(h => h.text);
  const hierarchyIssues = headings.filter((h, i) => i > 0 && h.level > headings[i - 1].level + 1).map(h => `Heading level jumps to H${h.level}: ${h.text}`);
  const faqs = unique([...headings.map(h => h.text).filter(t => /\?$|^(how|what|why|when|where|can|does|do|is|are)\b/i.test(t)), ...$('summary').map((_, el) => clean($(el).text())).get()]);
  const signals = {
    breadcrumbs: schemaTypes.includes('BreadcrumbList') || $('[aria-label*="breadcrumb" i],[class*="breadcrumb" i]').length > 0,
    address: findSchemaValues(schema, 'streetAddress').length > 0 || $('address').length > 0,
    serviceArea: /service area|serving|areas we serve|locally|located in|based in/i.test(allText),
    phone: phoneLinks.length > 0 || /(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/.test(allText),
    contact: phoneLinks.length > 0 || contactLinks.length > 0 || links.some(l => /contact/i.test(l.anchor)),
    map: maps.length > 0,
    localSchema: schemaTypes.some(t => /LocalBusiness|HomeAndConstructionBusiness|ProfessionalService|Dentist|Restaurant|Store|Electrician|Plumber|HVACBusiness|LegalService|AutoRepair|MedicalBusiness|RealEstateAgent/i.test(t)),
    reviews: /testimonial|customer reviews|client reviews|rated \d|what our (clients|customers) say/i.test(allText) || schemaTypes.some(t => /Review|AggregateRating/.test(t)),
    trust: /certif|licensed|insured|accredit|case stud|project gallery|our projects|years of experience|guarantee/i.test(allText),
    cta: links.some(l => /contact|quote|book|schedule|buy|order|enquire|call|get started|request/i.test(l.anchor)) || $('button,input[type="submit"]').length > 0,
    audience: /homeowners|businesses|residential|commercial|families|customers|clients|teams|students|patients/i.test(body),
    services: /services|we (offer|provide|install|design)|our solutions/i.test(body),
    faq: faqs.length > 0 || schemaTypes.includes('FAQPage')
  };
  return { requestedUrl: fetched.requestedUrl, url: fetched.finalUrl, fetchedAt: fetched.fetchedAt, status: fetched.status, responseMs: fetched.responseMs, bytes: fetched.bytes, contentHash: fetched.contentHash, redirects: fetched.redirects || [], robotsNote: fetched.robotsNote, title, titleCount: $('title').length, description, canonical: canonicals[0] || '', canonicals, robots, openGraph, viewport: meta('viewport'), https: fetched.finalUrl.startsWith('https:'), headings, h1: h(1), h2: h(2), h3: h(3), hierarchyIssues, body, intro: body.split(/\s+/).slice(0, 120).join(' '), wordCount: fullBody.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0, textTruncated: fullBody.length > body.length, images, internalLinks, externalLinks, schema, schemaTypes: unique(schemaTypes), schemaErrors, phoneLinks: unique(phoneLinks), contactLinks: unique(contactLinks), maps, freshness: modified, faqs, signals, businessName: openGraph['og:site_name'] || findBusinessName(schema) || '', locations: unique(findSchemaValues(schema, 'addressLocality')), extraction: 'Static HTML; scripts are not executed. Signals are detectable evidence, not verified business claims.' };
}

function findSchemaValues(values, key) {
  const found = [];
  const walk = value => { if (!value || typeof value !== 'object') return; if (typeof value[key] === 'string') found.push(value[key]); Object.values(value).forEach(v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }); };
  values.forEach(walk); return found;
}
function findBusinessName(values) {
  const queue = [...values];
  while (queue.length) {
    const value = queue.shift(); if (!value || typeof value !== 'object') continue;
    if (/Organization|Business|Service|Store|Restaurant|Dentist|Plumber|Electrician|RealEstateAgent|Corporation|WebSite/i.test([].concat(value['@type'] || '').join(' ')) && typeof value.name === 'string') return value.name;
    Object.values(value).forEach(v => { if (Array.isArray(v)) queue.push(...v); else if (v && typeof v === 'object') queue.push(v); });
  }
  return '';
}
