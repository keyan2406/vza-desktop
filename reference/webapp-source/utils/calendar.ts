// Hilfen für die Kalenderansicht. Alle Tage und Uhrzeiten gelten in deutscher Zeit.

const TZ = "Europe/Berlin";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export type BerlinParts = { y: number; m: number; d: number; hh: number; mm: number };

export function berlinParts(date: Date): BerlinParts {
  const p = fmt.formatToParts(date);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: n("year"), m: n("month"), d: n("day"), hh: n("hour"), mm: n("minute") };
}

export const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const keyOf = (date: Date) => {
  const p = berlinParts(date);
  return dayKey(p.y, p.m, p.d);
};
export const timeOf = (date: Date) => {
  const p = berlinParts(date);
  return `${pad(p.hh)}:${pad(p.mm)}`;
};

// "2026-11" -> { y, m }. Ungültiges fällt auf den Standard zurück.
export function parseMonth(value: string | undefined, fallback: { y: number; m: number }) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? "");
  if (!m) return fallback;
  const y = Number(m[1]);
  if (y < 2000 || y > 2100) return fallback;
  return { y, m: Number(m[2]) };
}

export function parseDay(value: string | undefined) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value ?? "");
  return m ? value! : null;
}

export function shiftMonth(y: number, m: number, delta: number) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export type Cell = { key: string; y: number; m: number; d: number; inMonth: boolean };

// 6 Wochen mit Montag als erstem Tag. Rein rechnerisch, unabhängig von der Zeitzone.
export function monthGrid(y: number, m: number): Cell[] {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // 0 = Montag
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const t = new Date(Date.UTC(y, m - 1, 1 - offset + i));
    const cy = t.getUTCFullYear();
    const cm = t.getUTCMonth() + 1;
    const cd = t.getUTCDate();
    cells.push({ key: dayKey(cy, cm, cd), y: cy, m: cm, d: cd, inMonth: cy === y && cm === m });
  }
  return cells;
}

// Zeitraum, der alle sichtbaren Tage sicher abdeckt (großzügig, gefiltert wird danach nach Tag).
export function gridRange(cells: Cell[]) {
  const a = cells[0];
  const z = cells[cells.length - 1];
  const start = new Date(Date.UTC(a.y, a.m - 1, a.d) - 24 * 3600 * 1000);
  const end = new Date(Date.UTC(z.y, z.m - 1, z.d) + 48 * 3600 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export const monthTitle = (y: number, m: number) =>
  new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );

export const longDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
};
