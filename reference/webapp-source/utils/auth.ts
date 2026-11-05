import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Role = "member" | "officer" | "admin";
export type SessionUser = { id: string; email: string | null };

// Wer ist angemeldet? Das Token wird lokal geprüft (ohne Netzwerk), sobald das Supabase-Projekt asymmetrische
// JWT-Schlüssel nutzt. Sonst fragt Supabase im Hintergrund selbst beim Auth-Server nach. Pro Seitenaufruf nur einmal.
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const user: SessionUser | null =
    claims && typeof claims.sub === "string"
      ? { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
      : null;
  return { supabase, user };
});

// Holt den eingeloggten Nutzer samt Rolle. Ohne Login geht es zurück zur Startseite.
// Rahmen und Seite fragen beide danach: durch cache() läuft die Prüfung trotzdem nur einmal pro Aufruf.
export const requireProfile = cache(async () => {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role, approved, discord_id, login_name")
    .eq("id", user.id)
    .maybeSingle();

  // Neue Konten warten, bis ein Admin sie freigibt.
  if (!profile || profile.approved !== true) redirect("/wartet");

  return {
    supabase,
    user,
    username: (profile?.username as string | undefined) ?? "Pilot",
    role: ((profile?.role as Role | undefined) ?? "member") as Role,
    discordLinked: !!profile?.discord_id,
    loginName: (profile?.login_name as string | null | undefined) ?? null,
  };
});

// Wie requireProfile, aber nur für Officer und Admins. Mitglieder gehen zurück zum Dashboard.
export async function requireOfficer() {
  const profile = await requireProfile();
  if (profile.role === "member") redirect("/dashboard");
  return profile;
}

// Nur für Admins. Alle anderen gehen zurück zum Dashboard.
export async function requireAdmin() {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
