import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client (§1.5).
 *
 * Uses the SERVICE-ROLE key, which bypasses RLS — required because anon has
 * no INSERT grant on burn.companies (pending rows are the moderation queue;
 * only `live` rows are publicly readable). This module is server-only: the
 * key lives in the Express env and is NEVER sent to the client.
 */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('supabase_not_configured');
  }
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
