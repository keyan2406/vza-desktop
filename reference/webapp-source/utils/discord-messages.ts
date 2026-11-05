import type { SupabaseClient } from "@supabase/supabase-js";
import { eventComponents, lootComponents, type RoleOption } from "./discord-bot";
import { BRAND } from "./brand";
import { COLOR, esc, pingForChannel, siteLink } from "./discord";
import { eventUrl } from "./discord-events";
import { first, formatAuec } from "./format";

type Person = { username: string | null; discord_id: string | null };

// In Embeds zeigt <@id> den Namen an, ohne jemanden zu benachrichtigen.
const who = (p: Person | null) =>
  p?.discord_id ? `<@${p.discord_id}>` : esc(p?.username ?? "Unbekannt");

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const footer = { text: `${BRAND.clan} · ${BRAND.slogan}` };

export type EventMessage = {
  payload: Record<string, unknown>;
  channelId: string | null;
  messageId: string | null;
};

// ---------- Operation ----------

export async function buildEventMessage(
  db: SupabaseClient,
  eventId: number,
  opts: { ping?: boolean } = {}
): Promise<EventMessage | null> {
  const { data } = await db
    .from("events")
    .select(
      `id, title, description, starts_at, min_players, points, status, discord_channel_id, discord_message_id, discord_event_id,
       event_signups(user_id, role_id, profiles(username, discord_id)),
       event_ship_requirements(quantity, ships(name)),
       event_role_requirements!event_role_requirements_event_id_fkey(id, name, quantity)`
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
    status: "planned" | "running" | "finished" | "cancelled";
    discord_channel_id: string | null;
    discord_message_id: string | null;
    discord_event_id: string | null;
    event_signups: { user_id: string; role_id: number | null; profiles: Person | Person[] | null }[] | null;
    event_ship_requirements: { quantity: number; ships: { name: string } | { name: string }[] | null }[] | null;
    event_role_requirements: { id: number; name: string; quantity: number }[] | null;
  };

  const signups = (e.event_signups ?? []).map((s) => ({ roleId: s.role_id, person: first(s.profiles) }));
  const roles = [...(e.event_role_requirements ?? [])].sort((a, b) => a.id - b.id);
  const ts = Math.floor(new Date(e.starts_at).getTime() / 1000);
  const planned = e.status === "planned";

  const roleOptions: RoleOption[] = roles.map((r) => ({
    id: r.id,
    name: r.name,
    needed: r.quantity,
    filled: signups.filter((s) => s.roleId === r.id).length,
  }));

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Beginn", value: `<t:${ts}:F>\n<t:${ts}:R>`, inline: true },
    { name: "Angemeldet", value: `${signups.length} von mindestens ${e.min_players}`, inline: true },
    { name: "Punkte", value: `+${e.points}`, inline: true },
  ];

  const ships = (e.event_ship_requirements ?? [])
    .map((s) => `${s.quantity}× ${esc(first(s.ships)?.name ?? "Unbekannt")}`)
    .join("\n");
  if (ships) fields.push({ name: "Benötigte Schiffe", value: cut(ships, 1000) });

  for (const r of roles) {
    const names = signups.filter((s) => s.roleId === r.id).map((s) => who(s.person));
    fields.push({
      name: `${esc(r.name)} (${names.length} von ${r.quantity})`,
      value: names.length ? cut(names.join(", "), 1000) : "noch niemand",
      inline: true,
    });
  }
  const open = signups.filter((s) => s.roleId === null).map((s) => who(s.person));
  if (open.length) {
    fields.push({ name: roles.length ? "Rolle offen" : "Dabei", value: cut(open.join(", "), 1000) });
  }

  const titles = {
    planned: `Neue Operation: ${e.title}`,
    running: `Läuft: ${e.title}`,
    finished: `Abgeschlossen: ${e.title}`,
    cancelled: `Abgesagt: ${e.title}`,
  } as const;
  const colors = { planned: COLOR.info, running: COLOR.money, finished: COLOR.muted, cancelled: COLOR.warn } as const;

  const url = siteLink(`/operationen/${eventId}`);
  const ping = pingForChannel("operationen");

  const payload: Record<string, unknown> = {
    embeds: [
      {
        title: cut(titles[e.status], 250),
        ...(url ? { url } : {}),
        description: cut(
          e.description ? esc(e.description) : planned ? "Melde dich mit den Knöpfen unten an." : "",
          3500
        ),
        color: colors[e.status],
        fields: fields.slice(0, 25),
        footer,
        timestamp: new Date().toISOString(),
      },
    ],
    // Nach dem Start oder Abschluss gibt es nichts mehr zu klicken
    components: planned
      ? eventComponents(
          eventId,
          roleOptions,
          url,
          e.discord_event_id && process.env.DISCORD_GUILD_ID
            ? eventUrl(process.env.DISCORD_GUILD_ID, e.discord_event_id)
            : undefined
        )
      : [],
    allowed_mentions: opts.ping ? { parse: ping.allowed.parse, ...(ping.allowed.roles ? { roles: ping.allowed.roles } : {}) } : { parse: [] },
  };
  if (opts.ping && ping.text) {
    payload.content = `${ping.text} Neue Operation: **${esc(e.title)}**`;
  }

  return { payload, channelId: e.discord_channel_id, messageId: e.discord_message_id };
}

// ---------- Loot ----------

export async function buildLootMessage(
  db: SupabaseClient,
  itemId: number,
  opts: { ping?: boolean } = {}
): Promise<EventMessage | null> {
  const { data } = await db
    .from("loot_items")
    .select(
      `id, name, quantity, status, price_auec, location, location_note, discord_channel_id, discord_message_id,
       events(title),
       holder:profiles!loot_items_holder_id_fkey(username, discord_id),
       winner:profiles!loot_items_winner_id_fkey(username, discord_id),
       loot_claims(status, created_at, profiles(username, discord_id))`
    )
    .eq("id", itemId)
    .maybeSingle();
  if (!data) return null;

  const i = data as unknown as {
    name: string;
    quantity: number;
    status: "locked" | "released" | "awarded" | "sold";
    price_auec: number | null;
    location: "player" | "vizsla_bank";
    location_note: string | null;
    discord_channel_id: string | null;
    discord_message_id: string | null;
    events: { title: string } | { title: string }[] | null;
    holder: Person | Person[] | null;
    winner: Person | Person[] | null;
    loot_claims: { status: string; created_at: string; profiles: Person | Person[] | null }[] | null;
  };

  const claims = (i.loot_claims ?? [])
    .filter((c) => c.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((c) => who(first(c.profiles)));
  const where =
    i.location === "vizsla_bank" ? "Vizsla Bank Account" : `Spieler: ${who(first(i.holder))}`;
  const released = i.status === "released";

  const descriptions = {
    locked: "Wartet auf die Freigabe durch einen Offizier.",
    released: "Setze einen Claim. Ein Offizier entscheidet, wer es bekommt.",
    awarded: `Zugeteilt an ${who(first(i.winner))}. Die Zahlung ist noch offen.`,
    sold: `Verkauft an ${who(first(i.winner))}.`,
  } as const;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Preis", value: formatAuec(i.price_auec), inline: true },
    { name: "Standort", value: cut(i.location_note ? `${where} (${esc(i.location_note)})` : where, 1000), inline: true },
  ];
  const eventTitle = first(i.events)?.title;
  if (eventTitle) fields.push({ name: "Aus der Operation", value: esc(eventTitle) });
  if (released) {
    fields.push({
      name: `Claims (${claims.length})`,
      value: claims.length ? cut(claims.join(", "), 1000) : "noch keine",
    });
  }

  const url = siteLink("/lager");
  const ping = pingForChannel("loot");

  const payload: Record<string, unknown> = {
    embeds: [
      {
        title: cut(`${released ? "Neu im Lager" : "Lager"}: ${i.name} ×${i.quantity}`, 250),
        ...(url ? { url } : {}),
        description: descriptions[i.status],
        color: released ? COLOR.info : i.status === "awarded" ? COLOR.money : COLOR.muted,
        fields,
        footer,
        timestamp: new Date().toISOString(),
      },
    ],
    components: released ? lootComponents(itemId, url) : [],
    allowed_mentions: opts.ping ? { parse: ping.allowed.parse, ...(ping.allowed.roles ? { roles: ping.allowed.roles } : {}) } : { parse: [] },
  };
  if (opts.ping && ping.text) payload.content = `${ping.text} Neuer Loot: **${esc(i.name)}**`;

  return { payload, channelId: i.discord_channel_id, messageId: i.discord_message_id };
}
