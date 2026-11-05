import type { SupabaseClient } from "@supabase/supabase-js";
import { announce } from "./notify";
import { accessRequested } from "./notifications";

// Neues, noch nicht freigegebenes Konto: Admins genau einmal in Discord informieren
export async function notifyIfNewRequest(supabase: SupabaseClient) {
  try {
    const { data: isNew } = await supabase.rpc("claim_pending_notice");
    if (isNew !== true) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await announce("admin", () => accessRequested(supabase, user.id));
  } catch {
    // Die Meldung ist nur eine Zugabe, die Anmeldung zählt
  }
}
