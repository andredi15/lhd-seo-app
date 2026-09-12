/** Future provider contract: { id, capabilities, isConfigured(), async collect({url, keywords, signal}) }.
 * Each returned metric must include source, collectedAt, value, and units.
 * No provider is registered until credentials and actual collection are implemented.
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
    catch { output.push({ provider: provider.id, error: 'Integration data unavailable.' }); }
  }
  return output;
}
