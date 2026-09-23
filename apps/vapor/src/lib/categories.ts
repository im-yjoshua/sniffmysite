/**
 * Specimen categories — frontend metadata ONLY (§2.13 polish batch).
 *
 * These are labels, not data: they come from the fixed 20-site fixture suite
 * (packages/api/src/test/fixtures), which is already mostly AI startups.
 * No scores, no companies, no ranks are invented here — the board still gets
 * all of that from the engine.
 */
export type CategoryKey =
  | 'ai_agents'
  | 'dev_tools'
  | 'marketing'
  | 'productivity'
  | 'other';

export interface Category {
  key: CategoryKey;
  label: string;
}

export const CATEGORIES: Category[] = [
  { key: 'ai_agents', label: 'AI Agents' },
  { key: 'dev_tools', label: 'Dev Tools' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'other', label: 'Other' },
];

const DOMAIN_CATEGORIES: Record<string, CategoryKey> = {
  // AI startups — the board's natural majority
  'anthropic.com': 'ai_agents',
  'character.ai': 'ai_agents',
  'copy.ai': 'ai_agents',
  'deepseek.com': 'ai_agents',
  'elevenlabs.io': 'ai_agents',
  'mistral.ai': 'ai_agents',
  'openai.com': 'ai_agents',
  'runwayml.com': 'ai_agents',
  'synthesia.io': 'ai_agents',
  'x.ai': 'ai_agents',
  // Dev tools & infra
  'github.com': 'dev_tools',
  'huggingface.co': 'dev_tools',
  'linear.app': 'dev_tools',
  'replit.com': 'dev_tools',
  'supabase.com': 'dev_tools',
  'vercel.com': 'dev_tools',
  // AI marketing copy
  'jasper.ai': 'marketing',
  // Productivity
  'notion.so': 'productivity',
  // Everything else
  'apple.com': 'other',
  'stripe.com': 'other',
};

/** Category label for a board domain; "Other" if the domain isn't listed. */
export function categoryFor(domain: string): CategoryKey {
  return DOMAIN_CATEGORIES[domain.toLowerCase()] ?? 'other';
}
