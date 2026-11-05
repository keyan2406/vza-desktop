import type { SupabaseClient } from "@supabase/supabase-js";

// Angekündigte Operationen, die nie gestartet wurden, werden nach dieser Zeit automatisch abgesagt.
export const AUTO_CANCEL_DAYS = 3;
const DAY_MS = 24 * 3600 * 1000;

// Setzt alle Operationen mit Status "geplant", deren Termin länger als AUTO_CANCEL_DAYS zurückliegt, auf "abgesagt".
// Der Datenbank-Befehl prüft Status und Zeit in einem Schritt: Was inzwischen gestartet oder abgesagt wurde, bleibt unberührt,
// und zwei gleichzeitige Läufe sagen nichts doppelt ab.
export async function autoCancelStaleEvents(
  db: SupabaseClient,
  onCancelled: (eventId: number) => Promise<void>,
  now: Date = new Date()
): Promise<{ ok: boolean; cancelled: number[] }> {
  const cutoff = new Date(now.getTime() - AUTO_CANCEL_DAYS * DAY_MS).toISOString();
  const { data, error } = await db
    .from("events")
    .update({ status: "cancelled" })
    .eq("status", "planned")
    .lt("starts_at", cutoff)
    .select("id");
  if (error || !Array.isArray(data)) return { ok: false, cancelled: [] };

  const ids = (data as { id: number }[]).map((r) => r.id);
  for (const id of ids) {
    try {
      await onCancelled(id);
    } catch {
      // Die Meldung in Discord ist nur eine Zugabe: Die Absage selbst steht schon in der Datenbank.
    }
  }
  return { ok: true, cancelled: ids };
}
