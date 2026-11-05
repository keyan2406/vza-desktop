import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "../../../../utils/supabase/admin";
import { buildPayload, sendToDiscord, type Embed } from "../../../../utils/discord";
import { postBotMessage } from "../../../../utils/discord-bot";
import { botConfigured } from "../../../../utils/discord-publish";
import { autoCancelStaleEvents } from "../../../../utils/auto-cancel";
import { eventChanged } from "../../../../utils/discord-publish";
import { runReminders } from "../../../../utils/discord-reminders";

// Wird von Supabase alle paar Minuten aufgerufen (pg_cron mit pg_net). Geschützt durch ein Geheimwort.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("not configured", { status: 503 });

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("unauthorized", { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return new Response("not configured", { status: 503 });

  const send = async (embed: Embed) => {
    if (botConfigured("operationen")) {
      const { username, ...payload } = buildPayload(embed, "operationen");
      void username; // nur für Webhooks gedacht
      const id = await postBotMessage(
        process.env.DISCORD_BOT_TOKEN as string,
        process.env.DISCORD_CHANNEL_OPERATIONEN as string,
        payload
      );
      return id !== null;
    }
    return (await sendToDiscord("operationen", embed)).ok;
  };

  const result = await runReminders(db, send, process.env.DISCORD_PING_ERINNERUNG);

  // Angekündigte Operationen, die 3 Tage nach dem Termin nicht stattgefunden haben, werden abgesagt
  let autoCancelled: number[] = [];
  try {
    const auto = await autoCancelStaleEvents(db, (id) => eventChanged(db, id, "cancelled", undefined, { auto: true }));
    autoCancelled = auto.cancelled;
  } catch {
    // Die Erinnerungen sind schon verschickt, ein Fehler hier darf den Aufruf nicht scheitern lassen
  }
  return Response.json({ ...result, autoCancelled: autoCancelled.length });
}
