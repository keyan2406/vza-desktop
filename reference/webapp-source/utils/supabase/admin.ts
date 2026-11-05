import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Nur auf dem Server benutzen. Der Service-Schlüssel umgeht alle Datenbank-Regeln und darf
// niemals im Browser oder in einer NEXT_PUBLIC_-Variable landen.
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
