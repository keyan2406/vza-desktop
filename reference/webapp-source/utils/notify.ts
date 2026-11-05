import { after } from "next/server";
import { sendToDiscord, type Channel, type Embed } from "./discord";

// Schickt die Nachricht im Hintergrund. Die Seite wartet nicht auf Discord,
// und ein Discord-Problem darf nie die eigentliche Aktion zum Scheitern bringen.
export function notifyDiscord(channel: Channel, embed: Embed) {
  try {
    after(async () => {
      await sendToDiscord(channel, embed);
    });
  } catch {
    void sendToDiscord(channel, embed);
  }
}

// Baut die Nachricht (mit den nötigen Datenbank-Abfragen) und sendet sie.
export async function announce(channel: Channel, build: () => Promise<Embed | null>) {
  try {
    const embed = await build();
    if (embed) notifyDiscord(channel, embed);
  } catch {
    // Absichtlich leer: Benachrichtigungen sind nur ein Zusatz.
  }
}
