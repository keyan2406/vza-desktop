import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { editBotMessage, postBotMessage } from "./discord-bot";
import {
  EVENT_STATUS,
  buildScheduledEvent,
  createScheduledEvent,
  deleteScheduledEvent,
  eventDurationMin,
  loadBanner,
  patchScheduledEvent,
} from "./discord-events";
import { buildCraftMessage } from "./discord-craft";
import { buildEventMessage, buildLootMessage } from "./discord-messages";
import { sendToDiscord, siteLink } from "./discord";
import { first } from "./format";
import { announce } from "./notify";
import { eventCreated, eventFinished, eventStatus, eventUpdatedNotice, lootReleased } from "./notifications";

type Kind = "operationen" | "loot";

const channelFor = (kind: Kind) =>
  (kind === "operationen" ? process.env.DISCORD_CHANNEL_OPERATIONEN : process.env.DISCORD_CHANNEL_LOOT)?.trim();

// Der Bot ist nur aktiv, wenn alles eingerichtet ist. Sonst laufen weiter die einfachen Webhooks.
export function botConfigured(kind: Kind) {
  return Boolean(
    process.env.DISCORD_BOT_TOKEN &&
      process.env.DISCORD_APP_ID &&
      process.env.DISCORD_PUBLIC_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      channelFor(kind)
  );
}

function background(fn: () => Promise<void>) {
  const safe = async () => {
    try {
      await fn();
    } catch {
      // Discord darf die eigentliche Aktion nie stören
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}

type Table = "events" | "loot_items";

async function publish(
  kind: Kind,
  table: Table,
  id: number,
  build: (db: SupabaseClient, id: number, o: { ping: boolean }) => ReturnType<typeof buildEventMessage>
) {
  const db = createAdminClient();
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = channelFor(kind);
  if (!db || !token || !channel) return;
  const built = await build(db, id, { ping: true });
  if (!built) return;
  const messageId = await postBotMessage(token, channel, built.payload);
  if (messageId) {
    await db.from(table).update({ discord_channel_id: channel, discord_message_id: messageId }).eq("id", id);
  }
}

async function refresh(
  table: Table,
  id: number,
  build: (db: SupabaseClient, id: number, o: { ping: boolean }) => ReturnType<typeof buildEventMessage>
) {
  const db = createAdminClient();
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!db || !token) return;
  const built = await build(db, id, { ping: false });
  if (!built?.channelId || !built.messageId) return;
  // Beim Aktualisieren bleibt der Nachrichtentext und damit die Erwähnung unverändert
  const { allowed_mentions, ...rest } = built.payload;
  void allowed_mentions;
  await editBotMessage(token, built.channelId, built.messageId, { ...rest, allowed_mentions: { parse: [] } });
}

// Wird auch von den Knopf-Antworten benutzt
export const refreshEventMessage = (id: number) => refresh("events", id, buildEventMessage);
export const refreshLootMessage = (id: number) => refresh("loot_items", id, buildLootMessage);

// ---------- Aufrufe aus den Aktionen der Seite ----------

// ---------- Discord-Event (Eventliste des Servers) ----------

// Nur nötig: Bot-Token und die ID des Servers. Der Bot braucht das Recht "Events verwalten".
export function eventsConfigured() {
  return Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
}

type PlanRow = {
  title: string;
  description: string | null;
  starts_at: string;
  discord_event_id: string | null;
  event_ship_requirements: { quantity: number; ships: { name: string } | { name: string }[] | null }[] | null;
  event_role_requirements: { name: string; quantity: number }[] | null;
};

async function loadPlan(db: SupabaseClient, eventId: number) {
  const { data } = await db
    .from("events")
    .select(
      `title, description, starts_at, discord_event_id,
       event_ship_requirements(quantity, ships(name)),
       event_role_requirements!event_role_requirements_event_id_fkey(name, quantity)`
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const e = data as unknown as PlanRow;

  const ships = (e.event_ship_requirements ?? []).map((s) => `${s.quantity}× ${first(s.ships)?.name ?? "Schiff"}`);
  const roles = (e.event_role_requirements ?? []).map((r) => `${r.quantity}× ${r.name}`);
  const link = siteLink(`/operationen/${eventId}`);
  const text = [
    e.description?.trim() || "",
    ships.length ? `Schiffe: ${ships.join(", ")}` : "",
    roles.length ? `Rollen: ${roles.join(", ")}` : "",
    link ? `Anmelden und Details: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    existingId: e.discord_event_id,
    plan: {
      name: e.title,
      description: text,
      startsAt: e.starts_at,
      durationMin: eventDurationMin(process.env.DISCORD_EVENT_DAUER_MIN),
      voiceChannelId: process.env.DISCORD_EVENT_VOICE_CHANNEL?.trim() || undefined,
      location: process.env.DISCORD_EVENT_ORT?.trim() || "Star Citizen",
    },
  };
}

async function createDiscordEvent(eventId: number) {
  const db = createAdminClient();
  const token = process.env.DISCORD_BOT_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID?.trim();
  if (!db || !token || !guild) return;
  const loaded = await loadPlan(db, eventId);
  if (!loaded || loaded.existingId) return;

  const image = await loadBanner(process.env.SITE_URL?.trim().replace(/\/+$/, ""));
  const body = buildScheduledEvent({ ...loaded.plan, image });
  if (!body) return;
  const id = await createScheduledEvent(token, guild, body);
  if (id) await db.from("events").update({ discord_event_id: id }).eq("id", eventId);
}

// Titel, Beschreibung oder Beginn geändert: Event in Discord anpassen (das Bild bleibt)
async function updateDiscordEvent(eventId: number) {
  const db = createAdminClient();
  const token = process.env.DISCORD_BOT_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID?.trim();
  if (!db || !token || !guild) return;
  const loaded = await loadPlan(db, eventId);
  if (!loaded) return;
  if (!loaded.existingId) return createDiscordEvent(eventId);

  const body = buildScheduledEvent(loaded.plan);
  if (!body) return;
  const { entity_type: _t, privacy_level: _p, ...changes } = body as Record<string, unknown>;
  void _t;
  void _p;
  await patchScheduledEvent(token, guild, loaded.existingId, changes);
}

async function discordEventStatus(eventId: number, status: "active" | "completed" | "cancelled") {
  const db = createAdminClient();
  const token = process.env.DISCORD_BOT_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID?.trim();
  if (!db || !token || !guild) return;
  const { data } = await db.from("events").select("discord_event_id").eq("id", eventId).maybeSingle();
  const id = data?.discord_event_id as string | null | undefined;
  if (!id) return;

  if (status === "active") {
    await patchScheduledEvent(token, guild, id, { status: EVENT_STATUS.active });
  } else if (status === "completed") {
    // Wurde das Event nie gestartet, lässt es sich nicht "beenden": dann einfach entfernen
    const ok = await patchScheduledEvent(token, guild, id, { status: EVENT_STATUS.completed });
    if (!ok) await deleteScheduledEvent(token, guild, id);
  } else {
    await deleteScheduledEvent(token, guild, id);
  }
}

export async function eventChanged(
  supabase: SupabaseClient,
  eventId: number,
  kind: "created" | "running" | "cancelled" | "finished",
  extra?: { attendees: number; loot: number },
  opts?: { auto?: boolean }
) {
  const bot = botConfigured("operationen");
  const events = eventsConfigured();

  if (kind === "created") {
    if (bot || events) {
      background(async () => {
        // Erst das Event anlegen, damit die Nachricht den Link dazu bekommt
        if (events) await createDiscordEvent(eventId);
        if (bot) await publish("operationen", "events", eventId, buildEventMessage);
      });
    }
    if (!bot) await announce("operationen", () => eventCreated(supabase, eventId));
    return;
  }

  // Die große Nachricht mit den Knöpfen wird aktualisiert (Knöpfe verschwinden) ...
  if (bot) background(() => refreshEventMessage(eventId));

  // ... das Event in der Eventliste wird mitgeführt ...
  if (events) {
    background(() =>
      discordEventStatus(eventId, kind === "running" ? "active" : kind === "finished" ? "completed" : "cancelled")
    );
  }

  // ... und zusätzlich kommt eine neue, kurze Meldung, die auch pingt.
  if (kind === "finished") {
    await announce("operationen", () =>
      eventFinished(supabase, eventId, extra?.attendees ?? 0, extra?.loot ?? 0)
    );
  } else {
    await announce("operationen", () => eventStatus(supabase, eventId, kind, { auto: opts?.auto }));
  }
}

// Operation wurde bearbeitet (z. B. neuer Beginn)
export async function eventEdited(supabase: SupabaseClient, eventId: number, timeChanged: boolean) {
  if (botConfigured("operationen")) background(() => refreshEventMessage(eventId));
  if (eventsConfigured()) background(() => updateDiscordEvent(eventId));
  await announce("operationen", () => eventUpdatedNotice(supabase, eventId, timeChanged));
}

// Jemand hat sich auf der Seite an- oder abgemeldet
export function eventSignupsChanged(eventId: number) {
  if (botConfigured("operationen")) background(() => refreshEventMessage(eventId));
}

export async function lootReleasedNotice(supabase: SupabaseClient, itemId: number) {
  if (botConfigured("loot")) {
    background(() => publish("loot", "loot_items", itemId, buildLootMessage));
    return;
  }
  await announce("loot", () => lootReleased(supabase, itemId));
}

// Claims, Zuteilung, Zahlung: die Nachricht im Loot-Channel aktuell halten
export function lootMessageChanged(itemId: number) {
  if (botConfigured("loot")) background(() => refreshLootMessage(itemId));
}

// ---------- Herstellungs-Anfragen ("Wer kann mir das herstellen?") ----------

const validChannel = (c: string | undefined | null): c is string => !!c && /^\d{5,25}$/.test(c.trim());

// Postet die Anfrage mit Knöpfen im Kanal und erwähnt die Besitzer einzeln.
// Reihenfolge der Kanäle: der Kanal des Befehls, dann DISCORD_CHANNEL_ANFRAGEN, dann der Operations-Kanal.
// Geht das alles nicht, kommt wenigstens eine einfache Meldung über den Webhook (ohne Knöpfe).
export async function publishCraftRequest(
  requestId: number,
  owners: { discord_id: string | null }[],
  preferChannel?: string
): Promise<boolean> {
  const db = createAdminClient();
  if (!db) return false;
  const msg = await buildCraftMessage(db, requestId, owners);
  if (!msg) return false;

  const token = process.env.DISCORD_BOT_TOKEN;
  if (token) {
    const channels = [preferChannel, process.env.DISCORD_CHANNEL_ANFRAGEN, process.env.DISCORD_CHANNEL_OPERATIONEN]
      .filter(validChannel)
      .map((c) => c.trim())
      .filter((c, i, a) => a.indexOf(c) === i);
    for (const channel of channels) {
      const messageId = await postBotMessage(token, channel, msg.payload);
      if (messageId) {
        await db.from("craft_requests").update({ discord_channel_id: channel, discord_message_id: messageId }).eq("id", requestId);
        return true;
      }
    }
  }

  // Ersatz: einfache Meldung ohne Knöpfe
  const embed = (msg.payload.embeds[0] ?? {}) as { title?: string; description?: string; color?: number; fields?: { name: string; value: string; inline?: boolean }[] };
  const ids = ((msg.payload.allowed_mentions as { users?: string[] }).users ?? []) as string[];
  const res = await sendToDiscord("operationen", {
    title: embed.title ?? "Blaupause angefragt",
    description: `${embed.description ?? ""}\n\nÜbernehmen kannst du die Anfrage auf der Seite unter Blaupausen.`,
    color: embed.color,
    fields: embed.fields,
    mentionUsers: ids,
    pingTarget: "none",
  });
  return res.ok;
}

// Anfrage wurde übernommen, erledigt oder abgebrochen: Karte und Knöpfe anpassen (ohne neuen Ping)
export async function refreshCraftMessage(requestId: number) {
  const db = createAdminClient();
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!db || !token) return;
  const msg = await buildCraftMessage(db, requestId);
  if (!msg || !msg.channelId || !msg.messageId) return;
  await editBotMessage(token, msg.channelId, msg.messageId, msg.payload);
}

// Für Aktionen auf der Seite: Discord im Hintergrund nachziehen
export function craftChanged(requestId: number, kind: "created", owners: { discord_id: string | null }[]): void;
export function craftChanged(requestId: number, kind: "updated"): void;
export function craftChanged(requestId: number, kind: "created" | "updated", owners: { discord_id: string | null }[] = []) {
  background(async () => {
    if (kind === "created") await publishCraftRequest(requestId, owners);
    else await refreshCraftMessage(requestId);
  });
}
