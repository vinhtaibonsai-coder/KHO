import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Chỉ cho phép service-role phía server. Không fallback về anon key vì RLS
// phải chặn hoàn toàn truy cập trực tiếp từ browser.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseEnabled) return null;
  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
