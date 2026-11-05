// Liest erhaltene Blaupausen aus der Game.log von Star Citizen. Läuft komplett im Browser:
// Die Log-Datei verlässt den Rechner nicht, nur die gefundenen Blaupausen-Namen werden übertragen.
//
// Das Spiel schreibt bei jeder neuen Blaupause eine Zeile wie diese:
//   <2026-03-26T17:15:41.684Z> [Notice] <SHUDEvent_OnNotification> Added notification
//   "Received Blueprint: Defiance Helmet Tactical: " [23] to queue.
// Dieselbe Meldung taucht in einer zweiten Zeile ("UpdateNotificationItem") noch einmal auf und wird ignoriert.

export type Found = { name: string; at: string | null };

const MARKERS = ["Received Blueprint", "Bauplan erhalten"];
const ECHO = "UpdateNotificationItem";

// Endet der Text mit ': "', ist das der Schluss des Namens. Anführungszeichen im Namen
// (z. B. Parallax "Sunstone" Rifle) stören dadurch nicht.
const MAIN = /(?:Received Blueprint|Bauplan erhalten):\s*(.*?):\s*"/;
// Rückfall, falls ein Patch den Doppelpunkt am Ende weglässt
const FALLBACK = /(?:Received Blueprint|Bauplan erhalten):\s*([^"\[\]]+?)\s*"/;
const STAMP = /^<(\d{4}-\d{2}-\d{2}T[\d:.]+Z)>/;

function clean(raw: string) {
  const name = raw.replace(/\s+/g, " ").replace(/[:\s]+$/, "").trim();
  return name.length >= 1 && name.length <= 120 ? name : "";
}

export function parseLine(line: string): Found | null {
  if (line.length > 3000) return null;
  if (!MARKERS.some((m) => line.includes(m))) return null;
  if (line.includes(ECHO)) return null;
  const m = MAIN.exec(line) ?? FALLBACK.exec(line);
  if (!m) return null;
  const name = clean(m[1]);
  if (!name) return null;
  return { name, at: STAMP.exec(line)?.[1] ?? null };
}

// Sammelt Funde aus beliebig zerstückelten Textblöcken. Jede Blaupause zählt nur einmal (früheste Zeit).
export function createScanner() {
  const found = new Map<string, Found>();
  let tail = "";

  const add = (line: string) => {
    const f = parseLine(line);
    if (!f) return;
    const key = f.name.toLowerCase();
    const old = found.get(key);
    if (!old || (f.at && (!old.at || f.at < old.at))) found.set(key, f);
  };

  return {
    feed(chunk: string) {
      const lines = (tail + chunk).split("\n");
      tail = lines.pop() ?? "";
      for (const l of lines) add(l);
    },
    // Letzte, unvollständige Zeile mitnehmen und alles zurückgeben
    finish(): Found[] {
      if (tail) add(tail);
      tail = "";
      return [...found.values()];
    },
    // Zwischenstand, ohne die letzte (noch wachsende) Zeile abzuschließen
    snapshot(): Found[] {
      return [...found.values()];
    },
  };
}

export type Scanner = ReturnType<typeof createScanner>;

// Liest eine Datei in Stücken (auch mehrere hundert Megabyte), ohne den Browser zu blockieren.
export async function scanBlob(
  blob: Blob,
  scanner: Scanner,
  opts: { onProgress?: (read: number, total: number) => void; signal?: { aborted: boolean } } = {}
) {
  const reader = blob.stream().getReader();
  const decoder = new TextDecoder("utf-8");
  let read = 0;
  for (;;) {
    if (opts.signal?.aborted) {
      await reader.cancel();
      return false;
    }
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    scanner.feed(decoder.decode(value, { stream: true }));
    opts.onProgress?.(read, blob.size);
    // dem Browser kurz Luft lassen
    if (read % (8 * 1024 * 1024) < value.byteLength) await new Promise((r) => setTimeout(r, 0));
  }
  scanner.feed(decoder.decode());
  return true;
}
