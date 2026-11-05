import type { SupabaseClient } from "@supabase/supabase-js";
import { COLOR, esc, siteLink, type Embed } from "./discord";
import { first } from "./format";

export type ReminderKind = "h1" | "m10";
type Person = { username: string | null; discord_id: string | null };

type EventRow = {
  id: number;
  title: string;
  starts_at: string;
  min_players: number;
  status: string;
  event_signups: { role_id: number | null; profiles: Person | Person[] | null }[] | null;
  event_role_requirements: { id: number; name: string; quantity: number }[] | null;
};

// Baut die Erinnerung. mode kommt aus DISCORD_PING_ERINNERUNG:
//   "signed" (Standard) = Angemeldete einzeln erwähnen, alle nur wenn noch Spieler fehlen
//   "everyone", "here", Rollen-ID = zusätzlich immer dieses Ziel pingen
//   "none" = gar nicht pingen
export async function buildReminder(
  db: SupabaseClient,
  eventId: number,
  kind: ReminderKind,
  mode: string | undefined
): Promise<Embed | null> {
  const { data } = await db
    .from("events")
    .select(
      `id, title, starts_at, min_players, status,
       event_signups(role_id, profiles(username, discord_id)),
       event_role_requirements!event_role_requirements_event_id_fkey(id, name, quantity)`
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const e = data as unknown as EventRow;
  if (e.status !== "planned") return null;

  const signups = (e.event_signups ?? []).map((s) => ({ roleId: s.role_id, person: first(s.profiles) }));
  const ids = signups
    .map((s) => s.person?.discord_id)
    .filter((id): id is string => typeof id === "string" && id !== "");
  const missing = Math.max(0, e.min_players - signups.length);
  const ts = Math.floor(new Date(e.starts_at).getTime() / 1000);
  const roles = [...(e.event_role_requirements ?? [])].sort((a, b) => a.id - b.id);

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Beginn", value: `<t:${ts}:F>\n<t:${ts}:R>`, inline: true },
    { name: "Angemeldet", value: `${signups.length} von mindestens ${e.min_players}`, inline: true },
  ];
  if (roles.length) {
    fields.push({
      name: "Rollen",
      value: roles
        .map((r) => `${esc(r.name)}: ${signups.filter((s) => s.roleId === r.id).length} von ${r.quantity}`)
        .join("\n"),
    });
  }

  const embed: Embed = {
    title: kind === "h1" ? `Erinnerung: ${e.title}` : `Gleich geht es los: ${e.title}`,
    url: siteLink(`/operationen/${e.id}`),
    description:
      (kind === "h1" ? "Die Operation beginnt in etwa einer Stunde." : "Die Operation beginnt gleich.") +
      (missing > 0
        ? ` Es fehlen noch **${missing}** ${missing === 1 ? "Spieler" : "Spieler"} bis zur Mindestzahl. Melde dich an!`
        : " Bis gleich!"),
    color: kind === "h1" ? COLOR.info : COLOR.money,
    fields,
    mentionUsers: ids,
  };

  const m = (mode ?? "signed").trim();
  if (m === "signed") embed.ping = missing > 0; // alle nur, wenn noch jemand fehlt
  else embed.pingTarget = m; // eigenes Ziel (oder "none")

  return embed;
}

export type SendFn = (embed: Embed) => Promise<boolean>;

// Holt die fälligen Erinnerungen aus der Datenbank und verschickt sie.
export async function runReminders(db: SupabaseClient, send: SendFn, mode: string | undefined) {
  const { data, error } = await db.rpc("claim_due_reminders");
  if (error || !Array.isArray(data)) return { claimed: 0, sent: 0, failed: 0, ok: false };

  let sent = 0;
  let failed = 0;
  for (const row of data as { event_id: number; kind: ReminderKind }[]) {
    let ok = false;
    try {
      const embed = await buildReminder(db, row.event_id, row.kind, mode);
      // Operation inzwischen abgesagt oder gestartet: nichts senden
      ok = embed ? await send(embed) : true;
    } catch {
      ok = false;
    }
    if (ok) {
      sent++;
    } else {
      failed++;
      // Beim nächsten Lauf noch einmal versuchen
      await db
        .from("events")
        .update(row.kind === "h1" ? { reminder_60_sent_at: null } : { reminder_10_sent_at: null })
        .eq("id", row.event_id);
    }
  }
  return { claimed: data.length, sent, failed, ok: true };
}
