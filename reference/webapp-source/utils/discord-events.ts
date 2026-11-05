// Discord-Events (die Veranstaltungen in der Eventliste des Servers).
// Dieses Modul ist frei von Next.js-Abhängigkeiten, damit es sich gut testen lässt.
import { discordCall } from "./discord-bot";

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type EventPlan = {
  name: string;
  description: string;
  startsAt: string; // ISO-Zeitpunkt
  durationMin: number;
  voiceChannelId?: string; // Sprachkanal, in dem die Operation stattfindet (optional)
  location: string; // Ortsangabe, wenn kein Sprachkanal gesetzt ist
  image?: string; // Banner als data:-Adresse
};

export function eventDurationMin(raw: string | undefined) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 15 && n <= 1440 ? Math.round(n) : 120;
}

export const eventUrl = (guildId: string, eventId: string) => `https://discord.com/events/${guildId}/${eventId}`;

// Baut den Inhalt für Discord. Mit Sprachkanal wird das Event dort gehalten, sonst als "extern" mit Ortsangabe.
// Discord verlangt einen Beginn in der Zukunft, sonst gibt es nichts anzulegen (null).
export function buildScheduledEvent(plan: EventPlan, now = Date.now()) {
  const start = new Date(plan.startsAt).getTime();
  if (!Number.isFinite(start) || start <= now + 60_000) return null;
  const end = start + plan.durationMin * 60_000;

  const base = {
    name: cut(plan.name.trim() || "Operation", 100),
    description: cut(plan.description, 1000),
    privacy_level: 2, // nur für Mitglieder des Servers
    scheduled_start_time: new Date(start).toISOString(),
    scheduled_end_time: new Date(end).toISOString(),
    ...(plan.image ? { image: plan.image } : {}),
  };

  if (plan.voiceChannelId && /^\d{5,25}$/.test(plan.voiceChannelId)) {
    return { ...base, entity_type: 2, channel_id: plan.voiceChannelId };
  }
  return {
    ...base,
    entity_type: 3,
    entity_metadata: { location: cut(plan.location.trim() || "Star Citizen", 100) },
  };
}

export async function createScheduledEvent(botToken: string, guildId: string, body: object) {
  const r = await discordCall(`/guilds/${guildId}/scheduled-events`, "POST", body, botToken);
  return r.ok && typeof r.json?.id === "string" ? (r.json.id as string) : null;
}

export async function patchScheduledEvent(botToken: string, guildId: string, id: string, body: object) {
  return (await discordCall(`/guilds/${guildId}/scheduled-events/${id}`, "PATCH", body, botToken)).ok;
}

export async function deleteScheduledEvent(botToken: string, guildId: string, id: string) {
  return (await discordCall(`/guilds/${guildId}/scheduled-events/${id}`, "DELETE", undefined, botToken)).ok;
}

// Status laut Discord: 2 = läuft, 3 = beendet, 4 = abgesagt
export const EVENT_STATUS = { active: 2, completed: 3, canceled: 4 } as const;

// Standard-Banner von der eigenen Seite holen (einmal pro Serverinstanz zwischengespeichert)
let cachedBanner: string | null | undefined;
export async function loadBanner(siteUrl: string | undefined): Promise<string | undefined> {
  if (cachedBanner !== undefined) return cachedBanner ?? undefined;
  if (!siteUrl) return undefined;
  try {
    const res = await fetch(`${siteUrl}/vza-event-banner.jpg`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      cachedBanner = null; // gibt es nicht: nicht ständig neu versuchen
      return undefined;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5_000_000) {
      cachedBanner = null;
      return undefined;
    }
    cachedBanner = `data:image/jpeg;base64,${buf.toString("base64")}`;
    return cachedBanner;
  } catch {
    return undefined; // Netzwerkproblem: beim nächsten Mal erneut versuchen
  }
}
