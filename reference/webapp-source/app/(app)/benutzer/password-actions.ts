"use server";

import { hashCode, newResetCode } from "../../../utils/auth-codes";
import { normalizeResetCode } from "../../../utils/auth-validate";
import { createClient } from "../../../utils/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Für Admins: einen Link zum Festlegen eines neuen Passworts erzeugen (15 Minuten gültig, einmal benutzbar).
// Gedacht für Mitglieder, die ihr Passwort vergessen haben und Discord nicht verknüpft haben.
export async function createPasswordLink(userId: string): Promise<{ error: string | null; link?: string; name?: string }> {
  if (!UUID.test(String(userId))) return { error: "Ungültiges Mitglied." };
  const base = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (!base) return { error: "Bei Vercel fehlt der Eintrag SITE_URL, damit der Link vollständig wird." };

  const supabase = await createClient();
  // Bei dem seltenen Fall, dass der Code schon vergeben ist, wird ein neuer erzeugt
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newResetCode();
    const norm = normalizeResetCode(code);
    if (!norm.ok) return { error: "Das hat nicht geklappt." };
    const { data, error } = await supabase.rpc("admin_create_password_reset", { p_user_id: userId, p_hash: hashCode(norm.value) });
    if (error) return { error: "Das hat nicht geklappt (nur Admins dürfen das)." };
    const r = (data ?? {}) as { status?: string; username?: string };
    if (r.status === "ok") return { error: null, link: `${base}/passwort-neu?code=${code}`, name: r.username ?? "" };
    if (r.status === "blocked") return { error: "Dieses Mitglied ist gesperrt." };
    if (r.status === "not_found") return { error: "Dieses Mitglied gibt es nicht mehr." };
    if (r.status !== "retry") return { error: "Das hat nicht geklappt." };
  }
  return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
}
