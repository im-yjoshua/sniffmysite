import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client — reads use the anon key, which is public-by-design
 * (it ships in the client bundle). All writes go through the Express API
 * with the service-role key, which NEVER leaves the server.
 *
 * Values come from env (.env.example is the template). If they're missing
 * the client is null — the UI must never crash on a missing key. (Task 7
 * will read profiles and score history through this client.)
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = supabase !== null;
