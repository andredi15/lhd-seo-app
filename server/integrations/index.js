import {createPageSpeedProvider} from './pagespeed.js';
/** Provider contract: { id, isConfigured(), async collect({report, signal, emit}) }.
 * Successful runs include source and collection time; measurements include values and units.
 * Only configured providers are called. Provider failures remain separate from SEO findings.
 * Keep observations separate from the heuristic optimization score.
 */
export const providers = new Map();
export function registerProvider(provider) {
  if (!provider?.id || typeof provider.collect !== 'function' || typeof provider.isConfigured !== 'function') throw new Error('Invalid integration provider');
  providers.set(provider.id, provider);
}
export async function collectIntegrations(context) {
  const output = [];
  for (const provider of providers.values()) if (provider.isConfigured()) {
    try { output.push({ provider: provider.id, metrics: await provider.collect(context) }); }
    catch { context.signal?.throwIfAborted(); output.push({ provider: provider.id, error: 'Integration data unavailable.' }); }
  }
  return output;
}

registerProvider(createPageSpeedProvider());
