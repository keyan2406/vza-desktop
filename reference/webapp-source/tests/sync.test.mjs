import * as s from "../utils/catalog-sync.ts";
let fails = 0; const ok = (n, cond) => { if (!cond) fails++; console.log(cond ? "OK   " : "FEHLER", n); };
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bp = (i, o = {}) => ({ uuid: U(i), output_name: "Blaupause " + i, output_class: i % 2 ? "SHLD_BEHR_S03_X" + i : "COOL_AEGS_S01_X" + i, craft_time_seconds: 600 + i, is_available_by_default: false, ingredient_count: 1, unlocking_missions_count: 0, ingredients: [{ name: "Torite", quantity_scu: i }], output: { uuid: U(1000 + i), name: "Blaupause " + i, type: i % 2 ? "Shield" : "Cooler", type_label: "T", grade: "A" }, game_version: "4.4", ...o });
const mission = (i, bpIds, o = {}) => ({ uuid: U(5000 + i), title: "Mission " + i, faction: { name: i % 2 ? "Headhunters" : "Foxwell Enforcement" }, rank_index: 1, star_systems: ["Stanton"], blueprints: bpIds.map((b) => ({ uuid: U(b), name: "Blaupause " + b })), ...o });

function fakeApi({ bps = [], ms = [], size = 200, fail = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const kind = url.includes("/blueprints?") ? "bp" : "m";
    if (fail[kind] === 429) return { ok: false, status: 429, json: async () => ({}) };
    if (fail[kind] === 500) return { ok: false, status: 500, json: async () => ({}) };
    if (fail[kind] === "throw") throw new Error("netz");
    if (fail[kind] === "kaputt") return { ok: true, status: 200, json: async () => { throw new Error("json"); } };
    const page = Number(/page\[number\]=(\d+)/.exec(url)[1]);
    const list = kind === "bp" ? bps : ms;
    return { ok: true, status: 200, json: async () => ({ data: list.slice((page - 1) * size, page * size) }) };
  };
  fetchImpl.calls = calls; return fetchImpl;
}
function fakeDb({ previous = 0, upsertError = false, deleteError = false } = {}) {
  const log = { upserts: [], deletes: [], meta: [] };
  return { log, from(table) { return {
    select: () => Promise.resolve({ count: previous, error: null }),
    upsert: (rows, o) => { if (table === "catalog_meta") { log.meta.push(rows); return Promise.resolve({ error: null }); } log.upserts.push({ rows, o }); return Promise.resolve({ error: upsertError ? { message: "x" } : null }); },
    delete: () => ({ lt: (c, v) => { log.deletes.push([table, c, v]); return Promise.resolve({ error: deleteError ? { message: "x" } : null }); } }),
  }; } };
}
const NOW = new Date("2026-11-03T12:00:00Z");

// ---- Normalfall ----
{
  const bps = Array.from({ length: 5 }, (_, i) => bp(i + 1)); const ms = [mission(1, [1, 2]), mission(2, [2, 3]), mission(3, [99])];
  const api = fakeApi({ bps, ms }); const db = fakeDb({ previous: 5 });
  const r = await s.syncCatalog({ fetchImpl: api, db, now: NOW });
  ok("Erfolg: Zahlen", r.ok && r.blueprints === 5 && r.missions === 3 && r.withSources === 3 && r.givers === 2 && r.warnings.length === 0);
  ok("Abfragen: eine Seite Blaupausen, eine Seite Missionen, mit den richtigen Filtern", api.calls.length === 2 && api.calls[0].includes("/blueprints?page[size]=200&page[number]=1") && api.calls[1].includes("filter[has_blueprints]=true") && api.calls[1].includes("filter[grouped]=true"));
  const rows = db.log.upserts[0].rows;
  ok("gespeichert: alle Blaupausen, Zeitpunkt, Missionsquellen", rows.length === 5 && rows.every((x) => x.synced_at === NOW.toISOString()) && rows.find((x) => x.uuid === U(2)).sources.length === 2 && rows.find((x) => x.uuid === U(4)).sources.length === 0 && rows.find((x) => x.uuid === U(2)).missions_count === 2);
  ok("Speichern: Konflikt über die Kennung (bestehende Zeilen werden aktualisiert)", db.log.upserts[0].o.onConflict === "uuid");
  ok("Zeilen enthalten keine 'detail'-Spalte (bleibt erhalten)", rows.every((x) => !("detail" in x)));
  ok("Veraltetes wird entfernt (älter als dieser Lauf)", db.log.deletes.length === 1 && db.log.deletes[0][0] === "catalog_blueprints" && db.log.deletes[0][1] === "synced_at" && db.log.deletes[0][2] === NOW.toISOString());
  ok("Stand wird festgehalten", db.log.meta[0].id === 1 && db.log.meta[0].blueprint_count === 5 && db.log.meta[0].mission_count === 3 && db.log.meta[0].giver_count === 2 && db.log.meta[0].game_version === "4.4");
}
// ---- Mehrere Seiten, Doppelte, Unsinn ----
{
  const bps = [...Array.from({ length: 230 }, (_, i) => bp(i + 1)), bp(1), { uuid: "x" }, null];
  const api = fakeApi({ bps, ms: [] }); const db = fakeDb({ previous: 0 });
  const r = await s.syncCatalog({ fetchImpl: api, db, now: NOW });
  ok("Seiten: zweite Seite wird geholt (200 + 33)", api.calls.filter((u) => u.includes("/blueprints?")).length === 2 && r.ok);
  ok("Doppelte und Unbrauchbares werden aussortiert (230 eindeutige)", r.blueprints === 230);
  ok("gespeichert in Stücken zu höchstens 150", db.log.upserts.length === 2 && db.log.upserts.every((u) => u.rows.length <= 150) && db.log.upserts.reduce((n, u) => n + u.rows.length, 0) === 230);
  ok("Ohne Missionen: kein Absturz, null Quellen", r.missions === 0 && r.withSources === 0 && r.givers === 0);
}
// ---- Fehler bei den Blaupausen: nichts anfassen ----
for (const [label, fail, limited] of [["Datenbank bremst (429)", { bp: 429 }, true], ["Serverfehler", { bp: 500 }, false], ["nicht erreichbar", { bp: "throw" }, false], ["Antwort nicht lesbar", { bp: "kaputt" }, false]]) {
  const api = fakeApi({ bps: [bp(1)], fail }); const db = fakeDb({ previous: 100 });
  const r = await s.syncCatalog({ fetchImpl: api, db, now: NOW });
  ok(`Blaupausen: ${label} → nichts gespeichert, nichts gelöscht, Hinweis`, !r.ok && r.limited === limited && db.log.upserts.length === 0 && db.log.deletes.length === 0 && db.log.meta.length === 0 && r.warnings.some((w) => w.includes("Es wurde nichts geändert")));
}
{
  const api = fakeApi({ bps: [], ms: [] }); const db = fakeDb({ previous: 100 }); const r = await s.syncCatalog({ fetchImpl: api, db, now: NOW });
  ok("Leere Antwort: nichts gelöscht (Schutz vor dem Leeren des Katalogs)", !r.ok && db.log.upserts.length === 0 && db.log.deletes.length === 0);
}
// ---- Fehler bei den Missionen: Blaupausen ja, alte Quellen bleiben ----
{
  const bps = [bp(1), bp(2)];
  for (const fail of [{ m: 429 }, { m: 500 }, { m: "throw" }]) {
    const api = fakeApi({ bps, ms: [mission(1, [1])], fail }); const db = fakeDb({ previous: 2 });
    const r = await s.syncCatalog({ fetchImpl: api, db, now: NOW });
    const rows = db.log.upserts[0].rows;
    ok(`Missionen fehlgeschlagen (${JSON.stringify(fail)}): Blaupausen werden aktualisiert, Quellen bleiben unberührt`, r.ok && rows.length === 2 && rows.every((x) => !("sources" in x) && !("missions_count" in x)) && r.warnings.some((w) => w.includes("Missionen konnten nicht")) && db.log.meta[0].mission_count === null);
  }
  const api = fakeApi({ bps, ms: [], fail: { m: 429 } }); const r = await s.syncCatalog({ fetchImpl: api, db: fakeDb(), now: NOW }); ok("429 bei den Missionen wird gemeldet", r.limited === true);
}
// ---- Schutz vor halben Listen ----
{
  const api = fakeApi({ bps: Array.from({ length: 10 }, (_, i) => bp(i + 1)), ms: [] }); const db = fakeDb({ previous: 700 });
  const r = await s.syncCatalog({ fetchImpl: api, db, now: NOW });
  ok("Neue Liste viel kürzer als vorher: wird gespeichert, aber Altes bleibt, mit Hinweis", r.ok && db.log.upserts.length === 1 && db.log.deletes.length === 0 && r.warnings.some((w) => w.includes("viel kürzer")));
  const ok2 = await s.syncCatalog({ fetchImpl: fakeApi({ bps: Array.from({ length: 400 }, (_, i) => bp(i + 1)) }), db: fakeDb({ previous: 700 }), now: NOW });
  ok("Leicht kürzere Liste (400 von 700) ist in Ordnung", ok2.ok && ok2.warnings.length === 0);
}
// ---- Speicherfehler ----
{
  const db = fakeDb({ previous: 5, upsertError: true }); const r = await s.syncCatalog({ fetchImpl: fakeApi({ bps: [bp(1)] }), db, now: NOW });
  ok("Speicherfehler: nicht als Erfolg gemeldet, nichts gelöscht, kein Stand vermerkt", !r.ok && db.log.deletes.length === 0 && db.log.meta.length === 0 && r.warnings.some((w) => w.includes("Speichern")));
  const db2 = fakeDb({ previous: 1, deleteError: true }); const r2 = await s.syncCatalog({ fetchImpl: fakeApi({ bps: [bp(1)] }), db: db2, now: NOW });
  ok("Fehler beim Aufräumen: Erfolg mit Hinweis", r2.ok && r2.warnings.some((w) => w.includes("nicht entfernt")));
}
// ---- Sicherheitsgrenze: höchstens 30 Seiten ----
{
  let n = 0; const endless = async () => { n++; return { ok: true, status: 200, json: async () => ({ data: Array.from({ length: 200 }, (_, i) => bp(n * 1000 + i)) }) }; };
  const db = fakeDb(); const r = await s.syncCatalog({ fetchImpl: endless, db, now: NOW });
  ok("Endlose Seiten: nach 30 Seiten Schluss, nichts gespeichert", !r.ok && n === 30 && db.log.upserts.length === 0);
}
// ---- Seitenangaben der API ----
{
  const calls = []; const f = async (u) => { calls.push(u); return { ok: true, status: 200, json: async () => ({ data: Array.from({ length: 200 }, (_, i) => bp(i + 1)), meta: { last_page: 1 } }) }; };
  const r = await s.syncCatalog({ fetchImpl: f, db: fakeDb(), now: NOW });
  ok("meta.last_page = 1 beendet das Blättern trotz voller Seite", calls.filter((u) => u.includes("/blueprints?")).length === 1 && r.ok);
  const calls2 = []; const f2 = async (u) => { calls2.push(u); return { ok: true, status: 200, json: async () => ({ data: Array.from({ length: 200 }, (_, i) => bp(i + 1)), links: { next: null } }) }; };
  await s.syncCatalog({ fetchImpl: f2, db: fakeDb(), now: NOW }); ok("links.next = null beendet das Blättern", calls2.filter((u) => u.includes("/blueprints?")).length === 1);
}
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
