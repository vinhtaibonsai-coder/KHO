import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Bật khi đã điền env, tắt thì store tự fallback sang data/database.json */
export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient | null = null;

/** Client dùng chung cho API (server) và trang (browser) */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseEnabled) return null;
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_KEY as string, {
      auth: { persistSession: false },
    });
  }
  return client;
}
