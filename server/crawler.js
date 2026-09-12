import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import robotsParser from 'robots-parser';
import iconv from 'iconv-lite';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

const UA = 'LighthouseSEOSpecialist';
const TIMEOUT = Math.max(1000, Math.min(30000, Number(process.env.CRAWL_TIMEOUT_MS) || 15000));
const MAX_BYTES = Math.max(10000, Math.min(5000000, Number(process.env.MAX_HTML_BYTES) || 3000000));

export function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid public HTTP or HTTPS URL.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete URL including https://.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP/HTTPS URLs without credentials are allowed.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard web ports (80 and 443) are supported.');
  url.hash = '';
  return url.href;
}

export function isPublicAddress(address) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
    return parsed.range() === 'unicast';
  } catch { return false; }
}

export async function resolvePublic(url) {
  const hostname = new URL(normalizeUrl(url)).hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || /\.(localhost|local|internal|test|invalid)$/i.test(hostname)) throw new Error('Private or reserved hosts cannot be crawled.');
  let timer;
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS lookup timed out.')), TIMEOUT); })
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Private or reserved network addresses cannot be crawled.');
  return addresses[0];
}

// Pin the validated DNS answer to the connection to prevent DNS-rebinding SSRF.
export async function requestPublic(value, { signal, limit = MAX_BYTES } = {}) {
  const url = normalizeUrl(value);
  const address = await resolvePublic(url);
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https:') ? https : http;
    const req = transport.get(url, {
      signal,
      headers: { 'User-Agent': `${UA}/1.0 (bounded SEO audit)`, Accept: 'text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.8', 'Accept-Encoding': 'gzip, deflate, br' },
      lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family)
    }, res => {
      const chunks = []; let bytes = 0; let decodedBytes = 0;
      const encoding = String(res.headers['content-encoding'] || 'identity').toLowerCase();
      const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
      if (!decoder && encoding !== 'identity') { req.destroy(new Error('Unsupported response content encoding.')); return; }
      const bodyStream = decoder ? res.pipe(decoder) : res;
      const oversized = () => { const error = new Error(`Response exceeds the ${Math.round(limit / 1000)} KB crawl limit.`); bodyStream.destroy(error); res.destroy(); req.destroy(error); };
      res.on('data', chunk => { bytes += chunk.length; if (bytes > limit) oversized(); });
      bodyStream.on('data', chunk => {
        decodedBytes += chunk.length;
        if (decodedBytes > limit) oversized();
        else chunks.push(chunk);
      });
      res.on('error', reject);
      bodyStream.on('error', reject);
      bodyStream.on('end', () => resolve({ url, status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks), bytes, decodedBytes, responseMs: Math.round(performance.now() - started) }));
    });
    const timer = setTimeout(() => req.destroy(new Error('Page request timed out.')), TIMEOUT);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}

export async function robotsPolicy(origin, signal, request = requestPublic) {
  const original = `${origin}/robots.txt`; let url = original;
  for (let hop = 0; hop < 4; hop++) {
    const res = await request(url, { signal, limit: 512000 });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) { url = normalizeUrl(new URL(res.headers.location, url).href); continue; }
    if (res.status === 404 || res.status === 410) return { parser: null, sitemaps: [], note: 'No robots.txt file found.' };
    if (res.status >= 400) throw new Error(`Unable to establish robots.txt permission (HTTP ${res.status}).`);
    const parser = robotsParser(original, res.buffer.toString('utf8'));
    return { parser, sitemaps: parser.getSitemaps(), note: 'robots.txt checked for LighthouseSEOSpecialist.' };
  }
  throw new Error('Too many robots.txt redirects.');
}

export async function crawlPage(value, { signal, robotsCache = new Map(), request = requestPublic, allowUrl = () => true, beforePageRequest = () => {} } = {}) {
  let url = normalizeUrl(value); const redirects = []; const notes = [];
  for (let hop = 0; hop <= 5; hop++) {
    if (!allowUrl(url)) throw new Error('Redirect leaves this domain’s crawl scope.');
    const origin = new URL(url).origin;
    if (!robotsCache.has(origin)) robotsCache.set(origin, robotsPolicy(origin, signal, request));
    const policy = await robotsCache.get(origin);
    if (policy.parser?.isAllowed(url, UA) === false) throw new Error('Crawling this URL is disallowed by robots.txt.');
    notes.push(policy.note);
    const delay = policy.parser?.getCrawlDelay(UA);
    if (delay > 0) {
      if (delay > 10) throw new Error('robots.txt requests a crawl delay longer than this interactive audit supports.');
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error('Analysis cancelled.')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delay * 1000);
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
      });
    }
    await beforePageRequest(url);
    const res = await request(url, { signal });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      const next = normalizeUrl(new URL(res.headers.location, url).href);
      redirects.push({ from: url, to: next, status: res.status }); url = next; continue;
    }
    if (res.status < 200 || res.status >= 300) { const error = new Error(`Page returned HTTP ${res.status}; no page analysis was generated.`); error.status = res.status; error.redirects = redirects; throw error; }
    if (!/text\/html|application\/xhtml\+xml/i.test(res.headers['content-type'] || '')) throw new Error('The URL did not return an HTML page.');
    const charset = /charset=["']?([^\s;"']+)/i.exec(res.headers['content-type'] || '')?.[1]
      || /<meta[^>]+charset\s*=\s*["']?([^\s"'/>]+)/i.exec(res.buffer.subarray(0, 4096).toString('ascii'))?.[1] || 'utf-8';
    const html = iconv.decode(res.buffer, iconv.encodingExists(charset) ? charset : 'utf-8');
    if (/just a moment|verify you are human|attention required.*cloudflare/i.test(html.slice(0, 20000)) && !/<main[\s>]/i.test(html)) throw new Error('A bot challenge was returned instead of usable page content.');
    return { ...res, buffer: undefined, html, requestedUrl: normalizeUrl(value), finalUrl: url, redirects, robotsNote: [...new Set(notes)].join(' '), fetchedAt: new Date().toISOString(), contentHash: createHash('sha256').update(res.buffer).digest('hex') };
  }
  throw new Error('Too many page redirects (maximum 5).');
}
