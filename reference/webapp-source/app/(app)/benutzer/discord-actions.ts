"use server";

import { createClient } from "../../../utils/supabase/server";
import { BRAND } from "../../../utils/brand";
import { discordCall } from "../../../utils/discord-bot";
import { COMMANDS, registerCommands } from "../../../utils/discord-commands";
import {
  CHANNELS,
  CHANNEL_LABEL,
  COLOR,
  sendToDiscord,
  siteLink,
  type Channel,
} from "../../../utils/discord";

const MESSAGES: Record<string, string> = {
  not_configured: "Für diesen Channel ist noch keine Webhook-Adresse hinterlegt.",
  invalid_url: "Die hinterlegte Adresse sieht nicht wie ein Discord-Webhook aus.",
  http_401: "Discord lehnt die Adresse ab. Wurde der Webhook gelöscht?",
  http_404: "Discord kennt diesen Webhook nicht mehr. Wurde er gelöscht?",
  http_429: "Discord bremst gerade. Bitte in einer Minute noch einmal versuchen.",
  network: "Discord war nicht erreichbar. Bitte noch einmal versuchen.",
};

export async function sendDiscordTest(
  channel: Channel
): Promise<{ error: string | null }> {
  if (!CHANNELS.includes(channel)) return { error: "Unbekannter Channel." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { error: "Keine Berechtigung." };

  const res = await sendToDiscord(channel, {
    title: `Testnachricht vom ${BRAND.tool}`,
    description: `Die Verbindung zu ${CHANNEL_LABEL[channel]} funktioniert.`,
    url: siteLink("/dashboard"),
    color: COLOR.info,
    ping: false,
  });

  if (res.ok) return { error: null };
  return { error: MESSAGES[res.error] ?? "Senden fehlgeschlagen." };
}

// Trägt die Slash-Befehle (/blaupause, /operationen ...) auf dem Discord-Server ein. Nur Admins.
export async function registerDiscordCommands(): Promise<{ error: string | null; count: number }> {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "admin") return { error: "Keine Berechtigung.", count: 0 };

  const appId = process.env.DISCORD_APP_ID?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const missing = [!appId && "DISCORD_APP_ID", !guildId && "DISCORD_GUILD_ID", !token && "DISCORD_BOT_TOKEN"].filter(Boolean);
  if (missing.length > 0) return { error: `Bei Vercel fehlt: ${missing.join(", ")}.`, count: 0 };

  const r = await registerCommands(discordCall as never, appId!, guildId!, token!);
  if (r.ok) return { error: null, count: r.count || COMMANDS.length };
  if (r.status === 403 || r.status === 401) {
    return {
      error:
        "Discord lehnt das ab. Der Bot braucht beim Einladen den Bereich „applications.commands“. Lade ihn mit dem erweiterten Link erneut ein.",
      count: 0,
    };
  }
  if (r.status === 404) return { error: "Discord kennt diese Anwendung oder diesen Server nicht. Prüfe DISCORD_APP_ID und DISCORD_GUILD_ID.", count: 0 };
  return { error: `Das Eintragen hat nicht geklappt (Discord-Antwort ${r.status || "keine"}).`, count: 0 };
}
