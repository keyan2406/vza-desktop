import * as ac from "../utils/auto-cancel.ts";
import * as nt from "../utils/notifications.ts";
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(c ? "OK   " : "FEHLER", n); };
const NOW = new Date("2026-11-10T12:00:00Z");
const H = 3600e3, D = 24 * H;
const iso = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();

// Nachgebaute Datenbank: wendet eq/lt wirklich auf die Zeilen an
function fakeDb(rows, { error = false } = {}) {
  const log = { updates: [], filters: [] };
  return { rows, log, from(table) {
    const q = { filters: [], patch: null };
    const api = {
      update(patch) { q.patch = patch; return api; },
      eq(c, v) { q.filters.push(["eq", c, v]); return api; },
      lt(c, v) { q.filters.push(["lt", c, v]); return api; },
      select: async () => {
        log.filters.push(q.filters); if (table !== "events") return { data: [], error: null };
        if (error) return { data: null, error: { message: "x" } };
        const hit = rows.filter((r) => q.filters.every(([op, c, v]) => (op === "eq" ? r[c] === v : r[c] < v)));
        for (const r of hit) Object.assign(r, q.patch);
        log.updates.push(hit.map((r) => r.id));
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      },
    };
    return api;
  } };
}

ok("Frist beträgt 3 Tage", ac.AUTO_CANCEL_DAYS === 3);
{
  const rows = [
    { id: 1, status: "planned", starts_at: iso(-3 * D - 1000) },       // gerade über 3 Tage her
    { id: 2, status: "planned", starts_at: iso(-3 * D + 1000) },       // fast 3 Tage
    { id: 3, status: "planned", starts_at: iso(-2 * D) },              // gestern vorgestern
    { id: 4, status: "planned", starts_at: iso(-10 * D) },             // lange her
    { id: 5, status: "planned", starts_at: iso(+2 * D) },              // Zukunft
    { id: 6, status: "planned", starts_at: iso(-1 * H) },              // vor einer Stunde
    { id: 7, status: "running", starts_at: iso(-20 * D) },             // läuft (nie beendet)
    { id: 8, status: "finished", starts_at: iso(-20 * D) },
    { id: 9, status: "cancelled", starts_at: iso(-20 * D) },
    { id: 10, status: "planned", starts_at: iso(-3 * D) },             // exakt 3 Tage: noch nicht (strikt älter)
  ];
  const db = fakeDb(rows); const told = [];
  const r = await ac.autoCancelStaleEvents(db, async (id) => { told.push(id); }, NOW);
  ok("sagt nur 'geplante' Operationen ab, die MEHR als 3 Tage zurückliegen (1 und 4)", r.ok && JSON.stringify(r.cancelled) === "[1,4]");
  ok("Grenzfall: knapp unter 3 Tagen und genau 3 Tage bleiben geplant", rows.find((x) => x.id === 2).status === "planned" && rows.find((x) => x.id === 10).status === "planned");
  ok("jüngere, zukünftige und gerade vergangene bleiben geplant (3, 5, 6)", [3, 5, 6].every((i) => rows.find((x) => x.id === i).status === "planned"));
  ok("laufende, beendete und abgesagte Operationen werden nie angefasst (7, 8, 9)", rows.find((x) => x.id === 7).status === "running" && rows.find((x) => x.id === 8).status === "finished" && rows.find((x) => x.id === 9).status === "cancelled");
  ok("Datenbank-Befehl prüft Status UND Zeit in einem Schritt, Grenze = jetzt minus 3 Tage", JSON.stringify(db.log.filters[0]) === JSON.stringify([["eq", "status", "planned"], ["lt", "starts_at", iso(-3 * D)]]));
  ok("für jede abgesagte Operation wird die Meldung ausgelöst", JSON.stringify(told) === "[1,4]");
  const r2 = await ac.autoCancelStaleEvents(db, async (id) => { told.push(id); }, NOW);
  ok("zweiter Lauf: nichts mehr zu tun, keine doppelte Meldung", r2.ok && r2.cancelled.length === 0 && told.length === 2);
  const later = await ac.autoCancelStaleEvents(db, async () => {}, new Date(NOW.getTime() + 1 * D));
  ok("einen Tag später rücken 2 und 10 nach (jetzt über 3 Tage), 3 noch nicht", JSON.stringify(later.cancelled.slice().sort((x, y) => x - y)) === "[2,10]" && rows.find((x) => x.id === 3).status === "planned");
}
{
  const db = fakeDb([{ id: 1, status: "planned", starts_at: iso(-9 * D) }, { id: 2, status: "planned", starts_at: iso(-9 * D) }, { id: 3, status: "planned", starts_at: iso(-9 * D) }]);
  const told = []; const r = await ac.autoCancelStaleEvents(db, async (id) => { told.push(id); if (id === 2) throw new Error("Discord down"); }, NOW);
  ok("Discord-Fehler bei einer Meldung: Absage bleibt, die anderen Meldungen laufen weiter", r.ok && r.cancelled.length === 3 && told.length === 3 && db.rows.every((x) => x.status === "cancelled"));
}
{
  const db = fakeDb([{ id: 1, status: "planned", starts_at: iso(-9 * D) }], { error: true }); let called = false;
  const r = await ac.autoCancelStaleEvents(db, async () => { called = true; }, NOW);
  ok("Datenbankfehler: nichts gemeldet, nicht als Erfolg gewertet, kein Absturz", !r.ok && r.cancelled.length === 0 && !called);
  const r3 = await ac.autoCancelStaleEvents(fakeDb([]), async () => { called = true; }, NOW); ok("keine Operationen: nichts zu tun", r3.ok && r3.cancelled.length === 0 && !called);
  const r4 = await ac.autoCancelStaleEvents(fakeDb([{ id: 1, status: "planned", starts_at: "2020-01-01T00:00:00Z" }]), async () => {}); ok("ohne Zeitangabe wird die aktuelle Zeit genommen", r4.ok && r4.cancelled.length === 1);
}

// ---- Discord-Meldung ----
{
  const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { title: "Frachtlauf Pyro" } }) }) }) }) };
  const manual = await nt.eventStatus(sb, 5, "cancelled");
  ok("manuelle Absage: Text wie bisher, Ping wie bisher (nicht abgeschaltet)", manual.title === "Operation abgesagt: Frachtlauf Pyro" && manual.ping === undefined && manual.description === undefined);
  const auto = await nt.eventStatus(sb, 5, "cancelled", { auto: true });
  ok("automatische Absage: eigener Titel, Begründung mit '3 Tage', leise (ohne Ping)", auto.title === "Operation automatisch abgesagt: Frachtlauf Pyro" && auto.description.includes("3 Tage") && auto.ping === false);
  const run = await nt.eventStatus(sb, 5, "running", { auto: true }); ok("'läuft'-Meldung bleibt unverändert", run.title === "Operation läuft: Frachtlauf Pyro" && run.ping === undefined);
  const none = await nt.eventStatus({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }, 5, "cancelled", { auto: true }); ok("Operation gibt es nicht mehr: keine Meldung", none === null);
}
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
