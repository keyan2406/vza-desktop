"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["member", "officer", "admin"] as const;
type Role = (typeof ROLES)[number];

const SAFE = [
  "Keine Berechtigung",
  "Benutzer nicht gefunden",
  "Der letzte Admin kann nicht herabgestuft werden",
];

// Die Datenbank-Funktion prüft zusätzlich, dass nur Admins Rollen ändern
// und dass immer mindestens ein Admin übrig bleibt.
export async function setUserRole(
  userId: string,
  role: Role
): Promise<{ error: string | null }> {
  if (typeof userId !== "string" || !UUID.test(userId)) {
    return { error: "Ungültiger Benutzer." };
  }
  if (!ROLES.includes(role)) return { error: "Ungültige Rolle." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (user.id === userId) {
    return { error: "Du kannst deine eigene Rolle nicht ändern." };
  }

  const { error } = await supabase.rpc("set_user_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) {
    const known = SAFE.find((m) => error.message.includes(m));
    return { error: known ? `${known}.` : "Speichern fehlgeschlagen." };
  }

  revalidatePath("/benutzer");
  return { error: null };
}

function parseId(formData: FormData) {
  const id = String(formData.get("user_id") ?? "");
  return UUID.test(id) ? id : null;
}

// Beides prüft die Datenbank-Funktion zusätzlich: nur Admins, und abgelehnt
// werden können nur noch nicht freigegebene Konten.
export async function approveUser(formData: FormData): Promise<void> {
  const id = parseId(formData);
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("approve_user", { p_user_id: id });
  revalidatePath("/benutzer");
  revalidatePath("/dashboard");
}

export async function rejectUser(formData: FormData): Promise<void> {
  const id = parseId(formData);
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("reject_user", { p_user_id: id });
  revalidatePath("/benutzer");
  revalidatePath("/dashboard");
}

// Sperren: Zugang weg, Verlauf bleibt. Löschen: endgültig (nur für gesperrte oder offene Konten).
export async function blockUser(formData: FormData): Promise<void> {
  const id = parseId(formData);
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("block_user", { p_user_id: id });
  revalidatePath("/benutzer");
  revalidatePath("/", "layout");
}

export async function unblockUser(formData: FormData): Promise<void> {
  const id = parseId(formData);
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("unblock_user", { p_user_id: id });
  revalidatePath("/benutzer");
  revalidatePath("/", "layout");
}

export async function deleteMember(formData: FormData): Promise<void> {
  const id = parseId(formData);
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("delete_member", { p_user_id: id });
  revalidatePath("/benutzer");
  revalidatePath("/", "layout");
}
