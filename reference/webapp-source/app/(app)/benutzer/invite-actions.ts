"use server";

import { revalidatePath } from "next/cache";
import { newInviteCode } from "../../../utils/auth-codes";
import { createClient } from "../../../utils/supabase/server";

type Result = { error: string | null; code?: string };

// Legt einen Einladungscode an. Nur Admins (die Datenbank-Regeln sichern das zusätzlich ab).
export async function createInviteCode(note: string, maxUses: number, days: number): Promise<Result> {
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 500) return { error: "Die Zahl der Nutzungen muss zwischen 1 und 500 liegen." };
  if (!Number.isInteger(days) || days < 0 || days > 365) return { error: "Die Gültigkeit muss zwischen 0 (unbegrenzt) und 365 Tagen liegen." };
  const cleanNote = String(note ?? "").trim().slice(0, 80);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const expires = days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newInviteCode();
    const { error } = await supabase
      .from("invite_codes")
      .insert({ code, note: cleanNote || null, max_uses: maxUses, expires_at: expires, created_by: user.id });
    if (!error) {
      revalidatePath("/benutzer");
      return { error: null, code };
    }
    if (error.code !== "23505") return { error: "Das hat nicht geklappt (nur Admins dürfen Codes anlegen)." };
  }
  return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
}

export async function revokeInviteCode(code: string): Promise<Result> {
  if (!/^[A-Z0-9-]{6,32}$/.test(String(code))) return { error: "Ungültiger Code." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("invite_codes").update({ revoked: true }).eq("code", code).select("code");
  if (error || !data || data.length === 0) return { error: "Das hat nicht geklappt." };
  revalidatePath("/benutzer");
  return { error: null };
}

export async function deleteInviteCode(code: string): Promise<Result> {
  if (!/^[A-Z0-9-]{6,32}$/.test(String(code))) return { error: "Ungültiger Code." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("invite_codes").delete().eq("code", code).select("code");
  if (error || !data || data.length === 0) return { error: "Das hat nicht geklappt." };
  revalidatePath("/benutzer");
  return { error: null };
}
