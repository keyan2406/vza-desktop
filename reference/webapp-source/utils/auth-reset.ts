import { hashCode } from "./auth-codes";
import { normalizeResetCode } from "./auth-validate";
import { createAdminClient } from "./supabase/admin";

export type ResetPeek =
  | { status: "ok"; loginName: string | null; username: string }
  | { status: "invalid" }
  | { status: "unavailable" };

// Für die Seite "Neues Passwort": Ist der Link gültig und hat das Konto schon einen Benutzernamen? Verbraucht nichts.
export async function peekPasswordReset(rawCode: unknown): Promise<ResetPeek> {
  const code = normalizeResetCode(rawCode);
  if (!code.ok) return { status: "invalid" };
  const admin = createAdminClient();
  if (!admin) return { status: "unavailable" };
  const { data, error } = await admin.rpc("peek_password_reset", { p_hash: hashCode(code.value) });
  if (error) return { status: "unavailable" };
  const r = (data ?? {}) as { status?: string; login_name?: string | null; username?: string };
  if (r.status !== "ok") return { status: "invalid" };
  return { status: "ok", loginName: r.login_name ?? null, username: r.username ?? "" };
}
