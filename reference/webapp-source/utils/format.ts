// Supabase liefert verknüpfte Datensätze je nach Beziehung als Objekt oder Liste.
export const first = <T>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

const dateTime = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

export function formatDate(iso: string) {
  return `${dateTime.format(new Date(iso))} Uhr`;
}

// Offset von Europe/Berlin zu UTC (in Millisekunden) zum Zeitpunkt ts.
function berlinOffsetMs(ts: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - ts;
}

// Wandelt "2026-11-05T20:00" (deutsche Uhrzeit) in einen exakten Zeitpunkt (ISO) um.
export function berlinLocalToISO(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let ts = naive - berlinOffsetMs(naive);
  ts = naive - berlinOffsetMs(ts); // zweite Korrektur an der Sommerzeit-Grenze
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const auec = new Intl.NumberFormat("de-DE");

export function formatAuec(n: number | null | undefined) {
  return `${auec.format(Number(n ?? 0))} aUEC`;
}

// Für das Eingabefeld "datetime-local": Zeitpunkt in deutscher Ortszeit als "2026-11-05T20:00".
export function toBerlinLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
