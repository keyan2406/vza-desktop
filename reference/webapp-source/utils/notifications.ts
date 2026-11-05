import type { SupabaseClient } from "@supabase/supabase-js";
import { COLOR, esc, siteLink, when, type Embed } from "./discord";
import { first, formatAuec } from "./format";

type Name = { username: string; discord_id?: string | null };

async function username(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
  return (data?.username as string | undefined) ?? "Unbekannt";
}

// ---------- Admin-Channel ----------

export async function accessRequested(supabase: SupabaseClient, userId: string): Promise<Embed | null> {
  const { data } = await supabase
    .from("profiles")
    .select("username, discord_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    title: "Neue Freigabe-Anfrage",
    url: siteLink("/benutzer"),
    description: `${esc(data.username ?? "Unbekannt")} hat sich ${data.discord_id ? "mit Discord" : "mit Benutzername und Passwort"} angemeldet und wartet auf Freigabe.`,
    color: COLOR.money,
    fields: [
      data.discord_id
        ? { name: "Discord-ID", value: data.discord_id, inline: true }
        : { name: "Discord", value: "noch nicht verknüpft", inline: true },
    ],
  };
}

// ---------- #operationen ----------

export async function eventCreated(supabase: SupabaseClient, eventId: number): Promise<Embed | null> {
  const { data } = await supabase
    .from("events")
    .select(
      `title, description, starts_at, min_players, points,
       event_ship_requirements(quantity, ships(name)),
       event_role_requirements!event_role_requirements_event_id_fkey(name, quantity)`
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;

  const e = data as unknown as {
    title: string;
    description: string | null;
    starts_at: string;
    min_players: number;
    points: number;
    event_ship_requirements: { quantity: number; ships: { name: string } | { name: string }[] | null }[] | null;
    event_role_requirements: { name: string; quantity: number }[] | null;
  };

  const ships = (e.event_ship_requirements ?? [])
    .map((s) => `${s.quantity}× ${esc(first(s.ships)?.name ?? "Unbekannt")}`)
    .join("\n");
  const roles = (e.event_role_requirements ?? [])
    .map((r) => `${r.quantity}× ${esc(r.name)}`)
    .join("\n");

  return {
    title: `Neue Operation: ${e.title}`,
    url: siteLink(`/operationen/${eventId}`),
    description: e.description ? esc(e.description) : "Melde dich auf der Seite an und wähle deine Rolle.",
    color: COLOR.info,
    fields: [
      { name: "Beginn", value: when(e.starts_at), inline: true },
      { name: "Mindestens", value: `${e.min_players} Spieler`, inline: true },
      { name: "Punkte", value: `+${e.points}`, inline: true },
      { name: "Benötigte Schiffe", value: ships },
      { name: "Benötigte Rollen", value: roles },
    ],
  };
}

export async function eventUpdatedNotice(
  supabase: SupabaseClient,
  eventId: number,
  timeChanged: boolean
): Promise<Embed | null> {
  const { data } = await supabase
    .from("events")
    .select("title, starts_at, min_players, points")
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  return {
    title: `Operation geändert: ${data.title}`,
    url: siteLink(`/operationen/${eventId}`),
    description: timeChanged
      ? "Die Operation hat einen neuen Beginn. Bitte prüfe, ob du noch kannst."
      : "Die Angaben zur Operation wurden angepasst.",
    color: COLOR.money,
    fields: [
      { name: "Beginn", value: when(data.starts_at), inline: true },
      { name: "Mindestens", value: `${data.min_players} Spieler`, inline: true },
      { name: "Punkte", value: `+${data.points}`, inline: true },
    ],
  };
}

export async function eventStatus(
  supabase: SupabaseClient,
  eventId: number,
  kind: "running" | "cancelled",
  opts?: { auto?: boolean }
): Promise<Embed | null> {
  const { data } = await supabase.from("events").select("title").eq("id", eventId).maybeSingle();
  if (!data) return null;
  if (kind === "running") {
    return { title: `Operation läuft: ${data.title}`, url: siteLink(`/operationen/${eventId}`), color: COLOR.money };
  }
  // Automatische Absage: leise (ohne Ping), denn der Termin liegt schon Tage zurück
  if (opts?.auto) {
    return {
      title: `Operation automatisch abgesagt: ${data.title}`,
      description: "Der Termin liegt mehr als 3 Tage zurück und die Operation wurde nicht gestartet.",
      color: COLOR.warn,
      ping: false,
    };
  }
  return { title: `Operation abgesagt: ${data.title}`, color: COLOR.warn };
}

export async function eventFinished(
  supabase: SupabaseClient,
  eventId: number,
  attendees: number,
  lootEntries: number
): Promise<Embed | null> {
  const { data } = await supabase.from("events").select("title, points").eq("id", eventId).maybeSingle();
  if (!data) return null;
  return {
    title: `Operation abgeschlossen: ${data.title}`,
    url: siteLink(`/operationen/${eventId}`),
    color: COLOR.muted,
    fields: [
      { name: "Teilnehmer", value: String(attendees), inline: true },
      { name: "Punkte", value: `+${data.points} pro Person`, inline: true },
      { name: "Loot", value: lootEntries > 0 ? `${lootEntries} Einträge im Lager` : "keiner", inline: true },
    ],
  };
}

// ---------- Loot ----------

type Item = {
  name: string;
  quantity: number;
  price_auec: number | null;
  location: "player" | "vizsla_bank";
  location_note: string | null;
  events: { title: string } | { title: string }[] | null;
  holder: Name | Name[] | null;
  winner: Name | Name[] | null;
};

async function item(supabase: SupabaseClient, id: number): Promise<Item | null> {
  const { data } = await supabase
    .from("loot_items")
    .select(
      `name, quantity, price_auec, location, location_note,
       events(title),
       holder:profiles!loot_items_holder_id_fkey(username),
       winner:profiles!loot_items_winner_id_fkey(username, discord_id)`
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Item) ?? null;
}

const label = (i: Item) => `${esc(i.name)} ×${i.quantity}`;

// ---------- #loot-freigabe ----------

export async function lootReleased(supabase: SupabaseClient, itemId: number): Promise<Embed | null> {
  const i = await item(supabase, itemId);
  if (!i) return null;
  const where =
    i.location === "vizsla_bank"
      ? "Vizsla Bank Account"
      : `Spieler: ${esc(first(i.holder)?.username ?? "unbekannt")}`;
  return {
    title: `Neu im Lager: ${label(i)}`,
    url: siteLink("/lager"),
    description: "Jeder kann einen Claim setzen. Ein Offizier entscheidet, wer es bekommt.",
    color: COLOR.info,
    fields: [
      { name: "Preis", value: formatAuec(i.price_auec), inline: true },
      { name: "Standort", value: i.location_note ? `${where} (${esc(i.location_note)})` : where, inline: true },
      { name: "Aus der Operation", value: first(i.events)?.title ? esc(first(i.events)!.title) : "" },
    ],
  };
}

// ---------- #claim-kassa ----------

export async function lootClaimed(supabase: SupabaseClient, itemId: number, userId: string): Promise<Embed | null> {
  const [i, who] = await Promise.all([item(supabase, itemId), username(supabase, userId)]);
  if (!i) return null;
  return {
    title: `Claim: ${label(i)}`,
    url: siteLink("/lager"),
    description: `${esc(who)} hat einen Claim gesetzt.`,
    color: COLOR.info,
  };
}

export async function lootAwarded(supabase: SupabaseClient, itemId: number): Promise<Embed | null> {
  const i = await item(supabase, itemId);
  if (!i) return null;
  return {
    title: `Zugeteilt: ${label(i)}`,
    url: siteLink("/lager"),
    description: `${esc(first(i.winner)?.username ?? "Unbekannt")} bekommt das Objekt und überweist ${formatAuec(i.price_auec)} an den Vizsla Bank Account.`,
    color: COLOR.money,
    // Der Gewinner wird direkt erwähnt, damit er es nicht übersieht
    mentionUsers: first(i.winner)?.discord_id ? [first(i.winner)!.discord_id as string] : [],
  };
}

export async function paymentConfirmed(supabase: SupabaseClient, itemId: number): Promise<Embed | null> {
  const i = await item(supabase, itemId);
  if (!i) return null;
  return {
    title: `Zahlung bestätigt: ${label(i)}`,
    description: "Das Objekt wurde aus dem Lager ausgebucht.",
    color: COLOR.money,
    fields: [
      { name: "Käufer", value: esc(first(i.winner)?.username ?? "Unbekannt"), inline: true },
      { name: "Betrag", value: formatAuec(i.price_auec), inline: true },
    ],
  };
}

export async function awardCancelled(supabase: SupabaseClient, itemId: number): Promise<Embed | null> {
  const i = await item(supabase, itemId);
  if (!i) return null;
  return {
    title: `Zuteilung aufgehoben: ${label(i)}`,
    url: siteLink("/lager"),
    description: "Das Objekt ist wieder frei, die anderen Claims gelten weiter.",
    color: COLOR.warn,
  };
}
