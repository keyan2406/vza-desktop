import { BRAND } from "./brand";

// Discord-Benachrichtigungen über Webhooks (keine eigene Bot-Software nötig).
// Dieses Modul ist bewusst frei von Next.js-Abhängigkeiten, damit es einfach testbar ist.

export type Channel = "operationen" | "loot" | "kasse" | "admin";
export type EmbedField = { name: string; value: string; inline?: boolean };
export type Embed = {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: EmbedField[];
  timestamp?: string;
  // Standard: Die Nachricht pingt gemäß Einstellung des Channels. false = ohne Ping.
  ping?: boolean;
  // Zusätzlich einzelne Mitglieder direkt erwähnen (Discord-IDs)
  mentionUsers?: string[];
  // Eigenes Ping-Ziel statt der Einstellung des Channels: everyone, here, none oder Rollen-ID
  pingTarget?: string;
};

// ---------- Erwähnungen (@everyone, @here, Rolle) ----------

export function pingFor(target: string | undefined) {
  const t = (target ?? "everyone").trim();
  if (t === "none" || t === "") return { text: "", allowed: { parse: [] as string[], roles: undefined as string[] | undefined } };
  if (t === "everyone") return { text: "@everyone", allowed: { parse: ["everyone"], roles: undefined as string[] | undefined } };
  if (t === "here") return { text: "@here", allowed: { parse: ["everyone"], roles: undefined as string[] | undefined } };
  if (/^\d{5,25}$/.test(t)) return { text: `<@&${t}>`, allowed: { parse: [] as string[], roles: [t] as string[] | undefined } };
  return { text: "", allowed: { parse: [] as string[], roles: undefined as string[] | undefined } };
}

// Pro Channel einstellbar. Ohne Einstellung wird erst einmal alle erwähnt (@everyone).
const PING_ENV: Record<Channel, string> = {
  operationen: "DISCORD_PING_OPERATIONEN",
  loot: "DISCORD_PING_LOOT",
  kasse: "DISCORD_PING_KASSE",
  admin: "DISCORD_PING_ADMIN",
};

export function pingForChannel(channel: Channel) {
  const own = process.env[PING_ENV[channel]];
  // Ältere Einstellung für #operationen bleibt gültig
  const legacy = channel === "operationen" ? process.env.DISCORD_PING_TARGET : undefined;
  return pingFor(own ?? legacy ?? "everyone");
}

const ENV: Record<Channel, string> = {
  operationen: "DISCORD_WEBHOOK_OPERATIONEN",
  loot: "DISCORD_WEBHOOK_LOOT",
  kasse: "DISCORD_WEBHOOK_KASSE",
  admin: "DISCORD_WEBHOOK_ADMIN",
};

export const CHANNELS: Channel[] = ["operationen", "loot", "kasse", "admin"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  operationen: "#operationen",
  loot: "#loot-freigabe",
  kasse: "#claim-kassa",
  admin: "Admin-Channel",
};

export const COLOR = {
  info: 0x35d6ff,
  money: 0xffb43a,
  warn: 0xff7a7a,
  muted: 0x8ba5b4,
};

const WEBHOOK_URL =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export const isWebhookUrl = (url: string) => WEBHOOK_URL.test(url);

export function isConfigured(channel: Channel) {
  return Boolean(process.env[ENV[channel]]);
}

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// Schützt Namen und Titel vor Discord-Formatierung.
export const esc = (s: string) => s.replace(/([\\*_~`|>])/g, "\\$1");

// Discord zeigt <t:…> jedem in seiner eigenen Zeitzone an.
export const when = (iso: string) =>
  `<t:${Math.floor(new Date(iso).getTime() / 1000)}:F>`;

export function siteLink(path: string) {
  const base = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  return base && base.startsWith("https://") ? `${base}${path}` : undefined;
}

// Kürzt auf Discords Grenzen. Erwähnt wird nur, was der Channel-Einstellung entspricht
// (und ausdrücklich genannte Mitglieder). Text in Titeln oder Namen kann nie jemanden anpingen.
export function buildPayload(embed: Embed, channel?: Channel) {
  const ping =
    embed.ping === false || !channel
      ? { text: "", allowed: { parse: [] as string[], roles: undefined as string[] | undefined } }
      : embed.pingTarget !== undefined
        ? pingFor(embed.pingTarget)
        : pingForChannel(channel);
  const users = (embed.mentionUsers ?? []).filter((id) => /^\d{5,25}$/.test(id)).slice(0, 60);
  const content = [ping.text, ...users.map((id) => `<@${id}>`)].filter(Boolean).join(" ");

  const fields = (embed.fields ?? [])
    .filter((f) => f.name.trim() !== "" && f.value.trim() !== "")
    .slice(0, 25)
    .map((f) => ({
      name: cut(f.name, 256),
      value: cut(f.value, 1000),
      inline: f.inline ?? false,
    }));

  return {
    username: BRAND.tool,
    ...(content ? { content } : {}),
    allowed_mentions: {
      parse: ping.allowed.parse,
      ...(ping.allowed.roles ? { roles: ping.allowed.roles } : {}),
      ...(users.length ? { users } : {}),
    },
    embeds: [
      {
        title: cut(embed.title, 250),
        ...(embed.description ? { description: cut(embed.description, 3500) } : {}),
        ...(embed.url && embed.url.startsWith("https://") ? { url: embed.url } : {}),
        color: embed.color ?? COLOR.info,
        ...(fields.length > 0 ? { fields } : {}),
        footer: { text: `${BRAND.clan} · ${BRAND.slogan}` },
        timestamp: embed.timestamp ?? new Date().toISOString(),
      },
    ],
  };
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendToDiscord(
  channel: Channel,
  embed: Embed,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  const url = process.env[ENV[channel]]?.trim();
  if (!url) return { ok: false, error: "not_configured" };
  if (!isWebhookUrl(url)) return { ok: false, error: "invalid_url" };

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(embed, channel)),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
}
