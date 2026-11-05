import * as c from "../utils/discord-commands.ts";
let fails = 0; const ok = (n, cond) => { if (!cond) fails++; console.log(cond ? "OK   " : "FEHLER", n); };

// ---------- nachgebaute Datenbank ----------
function fakeDb(tables, rpcs = {}) {
  const log = { upserts: [], deletes: [], rpc: [], ilike: [] };
  const mkB = (name) => {
    const st = { filters: [], eqs: {}, order: null, limit: null, count: null, head: false, op: "select", payload: null };
    const rows = () => {
      let r = typeof tables[name] === "function" ? tables[name](st) : [...(tables[name] ?? [])];
      for (const f of st.filters) r = r.filter(f);
      if (st.order) { const { col, asc } = st.order; r.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1)); }
      return r;
    };
    const res = () => {
      if (st.op === "delete") { log.deletes.push({ table: name, eqs: st.eqs }); return { data: null, error: null }; }
      if (st.op === "upsert") { log.upserts.push({ table: name, payload: st.payload }); return { data: null, error: null }; }
      const all = rows(); const out = st.limit ? all.slice(0, st.limit) : all;
      return { data: st.head ? null : out, error: null, count: all.length };
    };
    const api = {
      select(_c, o) { st.count = o?.count; st.head = !!o?.head; return api; },
      eq(col, v) { st.eqs[col] = v; st.filters.push((r) => r[col] === v); return api; },
      in(col, arr) { st.filters.push((r) => arr.includes(r[col])); return api; },
      gt(col, v) { st.filters.push((r) => r[col] > v); return api; },
      gte(col, v) { st.filters.push((r) => r[col] >= v); return api; },
      ilike(col, pat) { log.ilike.push(pat); const raw = pat.replace(/\\(.)/g, "$1"); const inner = raw.replace(/^%|%$/g, "").toLowerCase(); const contains = pat.startsWith("%") && pat.endsWith("%") && pat.length > 1;
        st.filters.push((r) => (contains ? String(r[col]).toLowerCase().includes(inner) : String(r[col]).toLowerCase() === raw.toLowerCase())); return api; },
      order(col, o) { st.order = { col, asc: o?.ascending !== false }; return api; },
      limit(n) { st.limit = n; return api; },
      maybeSingle() { const r = res(); return Promise.resolve({ ...r, data: r.data?.[0] ?? null }); },
      upsert(payload) { st.op = "upsert"; st.payload = payload; return api; },
      delete() { st.op = "delete"; return api; },
      then(ok2, bad) { return Promise.resolve(res()).then(ok2, bad); },
    };
    return api;
  };
  return { from: mkB, rpc: async (fn, args) => { log.rpc.push([fn, args]); return rpcs[fn] ? rpcs[fn](args) : { data: { status: "ok" }, error: null }; }, log };
}

const A = "340956971819728896", B = "100000000000000002", D = "100000000000000004";
const profiles = [
  { id: "u1", username: "Anna", role: "member", approved: true, discord_id: A },
  { id: "u2", username: "Bert", role: "member", approved: true, discord_id: B },
  { id: "u4", username: "Dora", role: "member", approved: false, discord_id: D },
];
const recipe = { id: "cd86dd07-2425-4cd2-81c4-88e62499c113", secs: 810, free: false, missions: 7, items: [{ name: "Torite", scu: 1.2 }, { name: "Glacosite", qty: 170 }] };
const bps = [
  { id: 1, name: "Antium Core Storm", ini_key: "item_Name_qrt_specialist_heavy_core_01_01_10", category: null, details: { cls: "Civilian", grade: "A", type: "Armor" }, recipe,
    player_blueprints: [{ user_id: "u2", profiles: { username: "Bert", discord_id: B, approved: true } }, { user_id: "u4", profiles: { username: "Dora", discord_id: D, approved: false } }] },
  { id: 2, name: "Antium Core Jet", ini_key: null, category: null, details: null, recipe: null, player_blueprints: [{ user_id: "u1", profiles: { username: "Anna", discord_id: A, approved: true } }] },
  { id: 3, name: "Monde Helmet", ini_key: null, category: null, details: null, recipe: null, player_blueprints: [] },
];
const future = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const events = [
  { id: 10, title: "Bergbau-Abend", starts_at: future(5), min_players: 3, status: "planned", event_signups: [{ user_id: "u2" }] },
  { id: 11, title: "Jagd auf Piraten", starts_at: future(30), min_players: 2, status: "planned", event_signups: [] },
  { id: 12, title: "Läuft gerade", starts_at: future(-1), min_players: 2, status: "running", event_signups: [] },
];
const mk = (extra = {}, rpcs = {}) => {
  const db = fakeDb({ profiles, blueprints: bps, events, player_stats: [], ...extra }, rpcs);
  const published = [];
  const deps = { db, siteUrl: "https://vza.example", publishCraft: async (id, owners, ch) => { published.push({ id, owners, ch }); return true; } };
  return { db, deps, published };
};
const opt = (name, value, extra = {}) => ({ type: typeof value === "number" ? 4 : typeof value === "boolean" ? 5 : 3, name, value, ...extra });
const cmd = (name, options = [], who = A, extra = {}) => ({ type: 2, data: { name, options }, member: { user: { id: who } }, channel_id: "999999999999999999", ...extra });
const sub = (name, options = []) => ({ type: 1, name, options });
const run = async (i, deps) => { const h = await c.handleCommand(i, deps); return { h, r: h.work ? await h.work() : null }; };

// ================= Registrierung: Regeln von Discord =================
{
  const names = c.COMMANDS.map((x) => x.name);
  ok("Befehlsnamen gültig (klein, 1 bis 32 Zeichen, eindeutig)", names.every((n) => /^[a-z0-9_-]{1,32}$/.test(n)) && new Set(names).size === names.length);
  ok(`${names.length} Befehle (Discord erlaubt 100)`, names.length <= 100);
  const walk = (opts, path) => (opts ?? []).every((o) => /^[a-z0-9_-]{1,32}$/.test(o.name) && o.description.length >= 1 && o.description.length <= 100 && walk(o.options, path + "/" + o.name));
  ok("Beschreibungen 1 bis 100 Zeichen, Optionsnamen gültig", c.COMMANDS.every((x) => x.description.length >= 1 && x.description.length <= 100 && walk(x.options, x.name)));
  const requiredFirst = (opts) => { let seenOptional = false; for (const o of opts ?? []) { if (o.type === 1) { if (!requiredFirst(o.options)) return false; continue; } if (!o.required) seenOptional = true; else if (seenOptional) return false; } return true; };
  ok("Pflicht-Optionen stehen immer vor den freiwilligen (Vorgabe von Discord)", c.COMMANDS.every((x) => requiredFirst(x.options)));
  const flat = (x) => (x.options ?? []).flatMap((o) => (o.type === 1 ? flat(o) : [o]));
  ok("Autovervollständigung nur bei Textfeldern", c.COMMANDS.flatMap(flat).filter((o) => o.autocomplete).every((o) => o.type === 3));
  ok("Zahlenbereiche nur bei Ganzzahlen", c.COMMANDS.flatMap(flat).filter((o) => o.min_value !== undefined).every((o) => o.type === 4));
  ok("Unterbefehle und Optionen nicht gemischt", c.COMMANDS.every((x) => !(x.options ?? []).some((o) => o.type === 1) || (x.options ?? []).every((o) => o.type === 1)));
  const calls = []; const r = await c.registerCommands(async (p, m, b, t) => { calls.push([p, m, b, t]); return { ok: true, status: 200, json: b }; }, "123456789012345678", "987654321098765432", "TOKEN");
  ok("Eintragen: richtige Adresse, ganze Liste", calls[0][0] === "/applications/123456789012345678/guilds/987654321098765432/commands" && calls[0][1] === "PUT" && calls[0][2].length === names.length && r.count === names.length);
}

// ================= Allgemeines =================
{
  const { deps } = mk();
  let h = await c.handleCommand(cmd("hilfe"), deps);
  ok("/hilfe antwortet sofort, nur für dich, mit allen Befehlen", h.response.type === 4 && h.response.data.flags === 64 && !h.work && ["/blaupause suchen", "/einkaufsliste", "/anmelden", "/claimen", "/rangliste", "/schiff"].every((t) => h.response.data.embeds[0].description.includes(t)));
  ok("Hilfe: jeder Befehl der Liste kommt vor", c.COMMANDS.filter((x) => x.name !== "hilfe").every((x) => h.response.data.embeds[0].description.includes("/" + x.name)));
  h = await c.handleCommand(cmd("quatsch"), deps);
  ok("unbekannter Befehl", h.response.data.content.includes("nicht"));
  h = await c.handleCommand({ type: 2, data: { name: "lager" }, member: { user: { id: "kaputt" } } }, deps);
  ok("ungültige Discord-ID wird abgelehnt", h.response.data.content.includes("nicht unterstützt") && !h.work);
  h = await c.handleCommand(cmd("lager"), deps);
  ok("Antwort ist nur für dich sichtbar (Standard)", h.response.type === 5 && h.response.data.flags === 64);
  h = await c.handleCommand(cmd("lager", [opt("oeffentlich", true)]), deps);
  ok("mit 'oeffentlich' sehen es alle", h.response.type === 5 && h.response.data.flags === undefined);
  let x = await run(cmd("lager", [], "555555555555555555"), deps);
  ok("ohne Konto: freundlicher Hinweis mit Link", x.r.content.includes("kein Konto") && x.r.content.includes("https://vza.example"));
  x = await run(cmd("lager", [], D), deps);
  ok("nicht freigegeben: kein Zugriff", x.r.content.includes("Freigabe"));
}

// ================= Blaupausen =================
{
  const { deps, db } = mk();
  let x = await run(cmd("blaupause", [sub("suchen", [opt("name", "1")])]), deps);
  let e = x.r.embeds[0];
  ok("suchen (per Kennung): Name, Kategorie, Beschreibung", e.title === "Antium Core Storm" && e.description.startsWith("Rüstung · Civilian · Grade A · Armor"));
  ok("Besitzer: nur Freigegebene, als Erwähnung (ohne Ping)", e.fields[0].name === "Besitzer (1)" && e.fields[0].value === `<@${B}>` && x.r.allowed_mentions.parse.length === 0);
  ok("Zutaten und Herstellzeit", e.fields.find((f) => f.name === "Zutaten (1 Stück)").value === "Torite: 1,2 SCU\nGlacosite: 170×" && e.fields.find((f) => f.name === "Herstellzeit").value === "13 Min 30 Sek");
  ok("Hinweis auf Anfrage, wenn man sie nicht hat", e.description.includes("/blaupause anfragen"));
  x = await run(cmd("blaupause", [sub("suchen", [opt("name", "antium core jet")])]), deps);
  ok("suchen (per Name, Groß-/Kleinschreibung egal): eigene Blaupause", x.r.embeds[0].title === "Antium Core Jet" && x.r.embeds[0].description.includes("Du besitzt diese Blaupause") && x.r.embeds[0].fields.some((f) => f.name === "Rezept"));
  x = await run(cmd("blaupause", [sub("suchen", [opt("name", "Monde")])]), deps);
  ok("Teilname mit genau einem Treffer", x.r.embeds[0].title === "Monde Helmet" && x.r.embeds[0].fields[0].value.includes("Niemand"));
  x = await run(cmd("blaupause", [sub("suchen", [opt("name", "Antium")])]), deps);
  ok("mehrdeutig: Vorschläge statt Raten", x.r.content.includes("Mehrere passen") && x.r.content.includes("Antium Core Storm") && x.r.content.includes("Antium Core Jet"));
  x = await run(cmd("blaupause", [sub("suchen", [opt("name", "Gibtesnicht")])]), deps);
  ok("nicht gefunden", x.r.content.includes("keine Blaupause gefunden"));
  x = await run(cmd("blaupause", [sub("suchen", [opt("name", "999")])]), deps);
  ok("unbekannte Kennung", x.r.content.includes("gibt es nicht"));
  db.log.ilike.length = 0; await run(cmd("blaupause", [sub("suchen", [opt("name", "50%_x")])]), deps);
  ok("Sonderzeichen der Suche werden entschärft (kein Platzhalter-Missbrauch)", db.log.ilike.every((p) => !/(^|[^\\])[%_]/.test(p.replace(/^%|%$/g, ""))));

  // anfragen
  const created = { data: { status: "ok", id: 42, blueprint_name: "Antium Core Storm", owners: [{ discord_id: B }] }, error: null };
  const m2 = mk({}, { discord_create_craft_request: () => created });
  x = await run(cmd("blaupause", [sub("anfragen", [opt("name", "1"), opt("menge", 3), opt("notiz", "bis Freitag")])]), m2.deps);
  const args = m2.db.log.rpc[0];
  ok("anfragen: richtige Funktion und Werte", args[0] === "discord_create_craft_request" && args[1].p_blueprint_id === 1 && args[1].p_qty === 3 && args[1].p_note === "bis Freitag" && args[1].p_discord_id === A);
  ok("anfragen: Karte wird im Kanal veröffentlicht, Besitzer werden benachrichtigt", m2.published.length === 1 && m2.published[0].id === 42 && m2.published[0].owners[0].discord_id === B && m2.published[0].ch === "999999999999999999");
  ok("anfragen: Bestätigung nur für dich", x.r.content.includes("#42") && x.r.content.includes("1 Besitzer wurde"));
  for (const [status, expect] of [["own", "schon selbst"], ["exists", "offene Anfrage (#7)"], ["no_owners", "niemand"], ["too_many", "5 offene"], ["bad_qty", "1 und 99"], ["no_blueprint", "gibt es nicht"], ["no_account", "kein Konto"], ["not_member", "Freigabe"]]) {
    const m3 = mk({}, { discord_create_craft_request: () => ({ data: { status, id: 7, blueprint_name: "X" }, error: null }) });
    const y = await run(cmd("blaupause", [sub("anfragen", [opt("name", "1")])]), m3.deps);
    ok(`anfragen: Antwort bei '${status}', nichts gepostet`, y.r.content.toLowerCase().includes(expect.toLowerCase()) && m3.published.length === 0);
  }
  const m4 = mk({}, { discord_create_craft_request: () => created }); m4.deps.publishCraft = async () => false;
  x = await run(cmd("blaupause", [sub("anfragen", [opt("name", "1")])]), m4.deps);
  ok("anfragen: Posten scheitert, Anfrage bleibt gespeichert, ehrlicher Hinweis", x.r.content.includes("gespeichert") && x.r.content.includes("nicht in Discord posten"));
  const m5 = mk({}, { discord_create_craft_request: () => ({ data: null, error: { message: "boom" } }) });
  x = await run(cmd("blaupause", [sub("anfragen", [opt("name", "1")])]), m5.deps);
  ok("anfragen: Datenbankfehler", x.r.content.includes("nicht geklappt"));
  x = await run(cmd("blaupause", [sub("anfragen", [opt("name", "1"), opt("menge", 500)])]), m2.deps);
  ok("anfragen: Menge wird auf 99 begrenzt", m2.db.log.rpc.at(-1)[1].p_qty === 99);

  // meine
  const mine = mk({ player_blueprints: [{ user_id: "u1", acquired_at: "2026-03-26T12:00:00Z", created_at: "2026-03-27T00:00:00Z", blueprints: { name: "Antium Core Jet" } }, { user_id: "u1", acquired_at: null, created_at: "2026-03-20T00:00:00Z", blueprints: { name: "Monde Helmet" } }] });
  x = await run(cmd("blaupause", [sub("meine")]), mine.deps);
  ok("meine: Liste mit Datum", x.r.embeds[0].title === "Deine Blaupausen (2)" && x.r.embeds[0].description.includes("Antium Core Jet <t:") && x.r.embeds[0].description.includes("Monde Helmet"));
  x = await run(cmd("blaupause", [sub("meine")]), mk().deps);
  ok("meine: leer", x.r.content.includes("noch keine Blaupausen"));
}

// ================= Anfragen-Liste =================
{
  const req = [
    { id: 5, qty: 2, status: "open", blueprint_id: 1, blueprints: { name: "Antium Core Storm" }, requester: { username: "Dora", discord_id: D }, taker: null, created_at: "2026-03-02" },
    { id: 6, qty: 1, status: "taken", blueprint_id: 2, blueprints: { name: "Antium Core Jet" }, requester: { username: "Bert", discord_id: B }, taker: { username: "Anna", discord_id: A }, created_at: "2026-03-01" },
    { id: 7, qty: 1, status: "done", blueprint_id: 3, blueprints: { name: "X" }, requester: { username: "Bert", discord_id: B }, taker: null, created_at: "2026-02-01" },
  ];
  const pb = [{ user_id: "u2", blueprint_id: 1 }, { user_id: "u1", blueprint_id: 2 }];
  const { deps } = mk({ craft_requests: req, player_blueprints: pb });
  let x = await run(cmd("anfragen", [], B), deps);
  const d = x.r.embeds[0].description;
  ok("offene Anfragen: erledigte fehlen, übernommene mit Namen", d.includes("**#5**") && d.includes("**#6**") && !d.includes("**#7**") && d.includes(`übernommen von <@${A}>`));
  ok("Hinweis 'du kannst sie übernehmen' nur bei eigener Blaupause", d.split("\n").find((l) => l.includes("#5")).includes("du kannst sie übernehmen") && !d.split("\n").find((l) => l.includes("#6")).includes("du kannst"));
  x = await run(cmd("anfragen", [], A), mk({ craft_requests: [], player_blueprints: [] }).deps);
  ok("keine Anfragen", x.r.content.includes("keine offenen"));
}

// ================= Einkaufsliste =================
{
  const list = [
    { user_id: "u1", blueprint_id: 1, qty: 2, created_at: "1", blueprints: { name: "Antium Core Storm", recipe } },
    { user_id: "u1", blueprint_id: 2, qty: 1, created_at: "2", blueprints: { name: "Antium Core Jet", recipe: null } },
    { user_id: "u2", blueprint_id: 3, qty: 9, created_at: "3", blueprints: { name: "Fremde", recipe } },
  ];
  const m = mk({ shopping_list: list });
  let x = await run(cmd("einkaufsliste", [sub("zeigen")]), m.deps);
  const f = x.r.embeds[0].fields;
  ok("zeigen: nur eigene Einträge, Zutaten summiert", f[0].value === "2× Antium Core Storm\n1× Antium Core Jet" && f[1].value === "Glacosite: 340×\nTorite: 2,4 SCU");
  ok("zeigen: Blaupausen ohne Rezept werden genannt", f[2].name === "Ohne bekanntes Rezept" && f[2].value === "Antium Core Jet");
  x = await run(cmd("einkaufsliste", [sub("zeigen")]), mk({ shopping_list: [] }).deps);
  ok("zeigen: leer", x.r.content.includes("leer"));
  x = await run(cmd("einkaufsliste", [sub("hinzufuegen", [opt("blaupause", "1"), opt("menge", 4)])]), m.deps);
  ok("hinzufuegen: gespeichert für dich mit Menge", m.db.log.upserts[0].payload.user_id === "u1" && m.db.log.upserts[0].payload.blueprint_id === 1 && m.db.log.upserts[0].payload.qty === 4 && x.r.content.includes("4× Antium Core Storm"));
  x = await run(cmd("einkaufsliste", [sub("entfernen", [opt("blaupause", "1")])]), m.deps);
  ok("entfernen: nur dein Eintrag", m.db.log.deletes.at(-1).eqs.user_id === "u1" && m.db.log.deletes.at(-1).eqs.blueprint_id === 1);
  x = await run(cmd("einkaufsliste", [sub("leeren")]), m.deps);
  ok("leeren: nur deine Liste", m.db.log.deletes.at(-1).eqs.user_id === "u1" && m.db.log.deletes.at(-1).eqs.blueprint_id === undefined && x.r.content.includes("leer"));
}

// ================= Operationen =================
{
  const m = mk({ event_role_requirements: [{ id: 100, event_id: 10, name: "Pilot" }, { id: 101, event_id: 10, name: "Bergmann" }] });
  let x = await run(cmd("operationen"), m.deps);
  const d = x.r.embeds[0].description;
  ok("operationen: Zeit, Anmeldestand, Link; laufende markiert", d.includes("**Bergbau-Abend**") && d.includes("<t:") && d.includes("1 von mindestens 3 angemeldet") && d.includes("https://vza.example/operationen/10") && d.includes("(läuft)"));
  ok("operationen: nach Zeit sortiert", d.indexOf("Läuft gerade") < d.indexOf("Bergbau-Abend") && d.indexOf("Bergbau-Abend") < d.indexOf("Jagd auf Piraten"));
  x = await run(cmd("anmelden", [opt("operation", "10")]), m.deps);
  ok("anmelden ohne Rolle", m.db.log.rpc[0][0] === "discord_event_signup" && m.db.log.rpc[0][1].p_role_id === null && x.r.content.includes("Bergbau-Abend") && x.r.content.includes("Du bist dabei") && x.r.refresh.type === "event" && x.r.refresh.id === 10);
  x = await run(cmd("anmelden", [opt("operation", "10"), opt("rolle", "101")]), m.deps);
  ok("anmelden mit Rolle (Kennung)", m.db.log.rpc.at(-1)[1].p_role_id === 101);
  x = await run(cmd("anmelden", [opt("operation", "bergbau"), opt("rolle", "pilot")]), m.deps);
  ok("anmelden per Name und Rollenname", m.db.log.rpc.at(-1)[1].p_event_id === 10 && m.db.log.rpc.at(-1)[1].p_role_id === 100);
  x = await run(cmd("anmelden", [opt("operation", "10"), opt("rolle", "gibtsnicht")]), m.deps);
  ok("anmelden: unbekannte Rolle, nichts passiert", x.r.content.includes("gibt es bei dieser Operation nicht") && m.db.log.rpc.at(-1)[1].p_role_id !== undefined && !x.r.refresh);
  x = await run(cmd("abmelden", [opt("operation", "10")]), mk({}, { discord_event_signoff: () => ({ data: { status: "ok", was_signed_up: true }, error: null }) }).deps);
  ok("abmelden", x.r.content.includes("abgemeldet") && x.r.refresh.type === "event");
  const rpcBefore = m.db.log.rpc.length;
  x = await run(cmd("anmelden", [opt("operation", "999")]), m.deps);
  ok("unbekannte Operation: Hinweis, und es wird nichts angemeldet", x.r.content.includes("gibt es nicht") && m.db.log.rpc.length === rpcBefore && !x.r.refresh);
  x = await run(cmd("anmelden", [opt("operation", "10")]), mk({}, { discord_event_signup: () => ({ data: { status: "closed" }, error: null }) }).deps);
  ok("anmelden bei geschlossener Operation: keine Aktualisierung", x.r.content.includes("nicht mehr") && !x.r.refresh);
  x = await run(cmd("operationen"), mk({ events: [] }).deps);
  ok("keine Operationen", x.r.content.includes("keine Operation geplant"));
}

// ================= Lager =================
{
  const loot = [{ id: 1, name: "Taurus Gewehr", quantity: 2, price_auec: 12000, location: "Hangar", status: "released", released_at: "2026-03-02", loot_claims: [{ status: "pending" }, { status: "pending" }, { status: "withdrawn" }] },
    { id: 2, name: "Rüstung", quantity: 1, price_auec: null, location: null, status: "released", released_at: "2026-03-01", loot_claims: [] },
    { id: 3, name: "Schon weg", quantity: 1, price_auec: 5, location: null, status: "awarded", released_at: "2026-02-01", loot_claims: [] }];
  const m = mk({ loot_items: loot });
  let x = await run(cmd("lager"), m.deps);
  ok("lager: nur freigegebene, mit Menge, Preis, offenen Claims", x.r.embeds[0].description.includes("**Taurus Gewehr** ×2") && x.r.embeds[0].description.includes("2 Claims") && x.r.embeds[0].description.includes("**Rüstung**") && !x.r.embeds[0].description.includes("Schon weg"));
  x = await run(cmd("claimen", [opt("objekt", "1")]), m.deps);
  ok("claimen per Kennung", m.db.log.rpc[0][0] === "discord_loot_claim" && m.db.log.rpc[0][1].p_item_id === 1 && x.r.refresh.type === "loot");
  x = await run(cmd("claimen", [opt("objekt", "taurus")]), m.deps);
  ok("claimen per Name", m.db.log.rpc.at(-1)[1].p_item_id === 1);
  x = await run(cmd("claimen", [opt("objekt", "schon weg")]), m.deps);
  ok("claimen: nicht freigegebenes Objekt wird nicht gefunden", x.r.content.includes("kein freigegebenes Objekt"));
  x = await run(cmd("lager"), mk({ loot_items: [] }).deps);
  ok("lager leer", x.r.content.includes("nichts"));
}

// ================= Rangliste, Profil, Hangar, Schiff =================
{
  const stats = [
    { user_id: "u1", username: "Anna", total_points: 120, ops_count: 5, level: 4 },
    { user_id: "u2", username: "Bert", total_points: 300, ops_count: 9, level: 5 },
    { user_id: "u3", username: "Cleo", total_points: 50, ops_count: 2, level: 2 },
  ];
  const th = [{ level: 1, min_points: 0 }, { level: 2, min_points: 30 }, { level: 3, min_points: 70 }, { level: 4, min_points: 120 }, { level: 5, min_points: 180 }, { level: 6, min_points: 250 }];
  const m = mk({ player_stats: stats, level_thresholds: th });
  let x = await run(cmd("rangliste"), m.deps);
  const lines = x.r.embeds[0].description.split("\n");
  ok("rangliste: nach Punkten, Medaillen", lines[0].startsWith("🥇 Bert") && lines[1].startsWith("🥈 Anna") && lines[2].startsWith("🥉 Cleo") && lines[0].includes("Level 5 · 300 Punkte · 9 Operationen"));
  const five = mk({ player_stats: Array.from({ length: 5 }, (_, k) => ({ user_id: "p" + k, username: "P" + k, total_points: 100 - k, ops_count: 1, level: 2 })), level_thresholds: th });
  x = await run(cmd("rangliste", [opt("anzahl", 3)]), five.deps);
  ok("rangliste: Anzahl begrenzt auf genau 3 Plätze", x.r.embeds[0].description.split("\n").length === 3);
  x = await run(cmd("rangliste"), five.deps);
  ok("rangliste: ohne Angabe bis zu 10 (hier alle 5)", x.r.embeds[0].description.split("\n").length === 5);
  x = await run(cmd("profil"), m.deps);
  const fl = x.r.embeds[0].fields;
  ok("profil (du selbst): Level, Punkte, Rang 2, Operationen", x.r.embeds[0].title === "Anna" && fl.find((f) => f.name === "Level").value === "4" && fl.find((f) => f.name === "Punkte").value === "120" && fl.find((f) => f.name === "Rang").value === "2.");
  ok("profil: Punkte bis zum nächsten Level", fl.find((f) => f.name === "Bis Level 5")?.value === "noch 60 Punkte");
  x = await run(cmd("profil", [{ type: 6, name: "mitglied", value: B }]), m.deps);
  ok("profil (anderes Mitglied)", x.r.embeds[0].title === "Bert" && x.r.embeds[0].fields.find((f) => f.name === "Rang").value === "1.");
  x = await run(cmd("profil", [{ type: 6, name: "mitglied", value: "555555555555555555" }]), m.deps);
  ok("profil: unbekanntes Mitglied", x.r.content.includes("nicht gefunden"));
  x = await run(cmd("profil", [{ type: 6, name: "mitglied", value: D }]), m.deps);
  ok("profil: nicht freigegebenes Mitglied bleibt verborgen", x.r.content.includes("nicht gefunden"));

  const hangar = [{ user_id: "u1", ship_id: 1, source: "ingame", ships: { name: "Prospector" } }, { user_id: "u1", ship_id: 1, source: "ingame", ships: { name: "Prospector" } }, { user_id: "u1", ship_id: 2, source: "pledge", ships: { name: "Carrack" }, pledge_value_eur: 500 },
    { user_id: "u2", ship_id: 1, source: "ingame", profiles: { username: "Bert", discord_id: B, approved: true }, ships: { name: "Prospector" } }];
  const m2 = mk({ hangar_ships: hangar.map((h) => ({ ...h, profiles: h.profiles ?? { username: "Anna", discord_id: A, approved: true } })), ships: [{ id: 1, name: "Prospector" }, { id: 2, name: "Carrack" }, { id: 3, name: "Prospector Mk2" }] });
  x = await run(cmd("hangar"), m2.deps);
  const hf = x.r.embeds[0].fields;
  ok("hangar: gruppiert, Spiel und Pledge getrennt", x.r.embeds[0].title === "Hangar von Anna" && hf[0].name === "Im Spiel (1)" && hf[0].value === "Prospector ×2" && hf[1].name === "Pledge (1)" && hf[1].value === "Carrack");
  ok("hangar: keine Euro-Beträge", !JSON.stringify(x.r).includes("500") && !JSON.stringify(x.r).includes("€"));
  x = await run(cmd("schiff", [opt("name", "2")]), m2.deps);
  ok("schiff (Kennung): Besitzer mit Erwähnung", x.r.embeds[0].title === "Carrack" && x.r.embeds[0].fields[0].name === "Pledge (1)" && x.r.embeds[0].fields[0].value === `<@${A}>` && x.r.embeds[0].fields.length === 1);
  x = await run(cmd("schiff", [opt("name", "carrack")]), m2.deps);
  ok("schiff (Name)", x.r.embeds[0].title === "Carrack");
  x = await run(cmd("schiff", [opt("name", "prospector")]), m2.deps);
  ok("schiff: genauer Name gewinnt gegen ähnlichen", x.r.embeds[0].title === "Prospector");
  x = await run(cmd("schiff", [opt("name", "gibtsnicht")]), m2.deps);
  ok("schiff: unbekannt", x.r.content.includes("kein Schiff gefunden"));
}

// ================= Autovervollständigung =================
{
  const m = mk({ shopping_list: [{ user_id: "u1", blueprint_id: 1, qty: 2, created_at: "1", blueprints: { name: "Antium Core Storm", recipe } }, { user_id: "u2", blueprint_id: 3, qty: 1, created_at: "2", blueprints: { name: "Fremde", recipe } }],
    event_role_requirements: [{ id: 100, event_id: 10, name: "Pilot" }, { id: 101, event_id: 10, name: "Bergmann" }, { id: 102, event_id: 11, name: "Jäger" }],
    loot_items: [{ id: 1, name: "Taurus Gewehr", status: "released", released_at: "2" }, { id: 2, name: "Altes", status: "awarded", released_at: "1" }], ships: [{ id: 1, name: "Prospector" }, { id: 2, name: "Carrack" }] });
  const ac = async (name, options, who = A) => (await c.handleCommand({ type: 4, data: { name, options }, member: { user: { id: who } } }, m.deps)).response;
  let r = await ac("blaupause", [sub("suchen", [opt("name", "antium", { focused: true })])]);
  ok("Vorschläge: Blaupausen mit Kennung als Wert", r.type === 8 && r.data.choices.length === 2 && r.data.choices[0].value === "2" && r.data.choices.some((x) => x.name === "Antium Core Storm" && x.value === "1"));
  r = await ac("blaupause", [sub("suchen", [opt("name", "", { focused: true })])]);
  ok("Vorschläge ohne Eingabe", r.data.choices.length === 3);
  r = await ac("einkaufsliste", [sub("entfernen", [opt("blaupause", "", { focused: true })])]);
  ok("Vorschläge beim Entfernen: nur deine Einträge", r.data.choices.length === 1 && r.data.choices[0].name === "2× Antium Core Storm" && r.data.choices[0].value === "1");
  r = await ac("einkaufsliste", [sub("hinzufuegen", [opt("blaupause", "mon", { focused: true })])]);
  ok("Vorschläge beim Hinzufügen", r.data.choices.length === 1 && r.data.choices[0].name === "Monde Helmet");
  r = await ac("anmelden", [opt("operation", "", { focused: true })]);
  ok("Vorschläge: geplante Operationen mit Datum (laufende nicht)", r.data.choices.length === 2 && /\(\d\d\.\d\d\.\)$/.test(r.data.choices[0].name) && !r.data.choices.some((x) => x.name.includes("Läuft")));
  r = await ac("anmelden", [opt("operation", "10"), opt("rolle", "", { focused: true })]);
  ok("Vorschläge: Rollen der gewählten Operation", r.data.choices.map((x) => x.name).sort().join(",") === "Bergmann,Pilot");
  r = await ac("anmelden", [opt("rolle", "", { focused: true })]);
  ok("Rollen ohne gewählte Operation: keine Vorschläge", r.data.choices.length === 0);
  r = await ac("claimen", [opt("objekt", "", { focused: true })]);
  ok("Vorschläge: nur freigegebene Objekte", r.data.choices.length === 1 && r.data.choices[0].name === "Taurus Gewehr");
  r = await ac("schiff", [opt("name", "car", { focused: true })]);
  ok("Vorschläge: Schiffe", r.data.choices.length === 1 && r.data.choices[0].name === "Carrack");
  r = await ac("blaupause", [sub("suchen", [opt("name", "a", { focused: true })])], "555555555555555555");
  ok("Fremde ohne Konto bekommen keine Vorschläge", r.data.choices.length === 0);
  r = await ac("blaupause", [sub("suchen", [opt("name", "a", { focused: true })])], D);
  ok("Nicht Freigegebene bekommen keine Vorschläge", r.data.choices.length === 0);
  r = await ac("hilfe", []);
  ok("ohne Eingabefeld keine Vorschläge, kein Absturz", r.type === 8 && r.data.choices.length === 0);
  const many = mk({ blueprints: Array.from({ length: 60 }, (_, k) => ({ id: k + 1, name: "N".repeat(150) + k, player_blueprints: [] })) });
  const rr = (await c.handleCommand({ type: 4, data: { name: "blaupause", options: [sub("suchen", [opt("name", "", { focused: true })])] }, member: { user: { id: A } } }, { ...many.deps, db: fakeDb({ profiles, blueprints: Array.from({ length: 60 }, (_, k) => ({ id: k + 1, name: "N".repeat(150) + k })) }) })).response;
  ok("höchstens 25 Vorschläge, Namen auf 100 Zeichen gekürzt", rr.data.choices.length === 25 && rr.data.choices.every((x) => x.name.length <= 100));
}

// ================= Fehlerfälle =================
{
  const bad = { from: () => { throw new Error("db kaputt"); }, rpc: async () => { throw new Error("db kaputt"); } };
  const h = await c.handleCommand(cmd("lager"), { db: bad, publishCraft: async () => true });
  let threw = false; try { await h.work(); } catch { threw = true; }
  ok("Datenbankausfall: Fehler wird nach oben gemeldet (die Seite fängt ihn ab und antwortet freundlich)", threw);
  const r = await c.handleCommand({ type: 4, data: { name: "schiff", options: [sub("x", [])] }, member: { user: { id: A } } }, { db: bad, publishCraft: async () => true });
  ok("Autovervollständigung bei Ausfall: leere Liste statt Fehler", r.response.type === 8 && r.response.data.choices.length === 0);
}

// ================= Konto verknüpfen (/verknuepfen) =================
{
  const link = c.COMMANDS.find((x) => x.name === "verknuepfen");
  ok("/verknuepfen ist registriert, Code ist Pflicht", !!link && link.options[0].name === "code" && link.options[0].required === true && link.options[0].type === 3);
  const NEW = "777777777777777777"; // jemand ohne Konto auf der Seite
  const withRpc = (res) => mk({}, { discord_link_account: () => res });
  let m = withRpc({ data: { status: "ok", username: "Erika *Muster*" }, error: null });
  let h = await c.handleCommand(cmd("verknuepfen", [opt("code", "k7qm-4xhd")], NEW), m.deps);
  ok("antwortet sofort und nur für dich", h.response.type === 5 && h.response.data.flags === 64);
  let x = await h.work();
  ok("auch ohne Konto/Freigabe möglich: Code wird groß und ohne Bindestrich an die Datenbank gegeben", m.db.log.rpc[0][0] === "discord_link_account" && m.db.log.rpc[0][1].p_code === "K7QM4XHD" && m.db.log.rpc[0][1].p_discord_id === NEW);
  ok("Erfolg: Name wird (entschärft) genannt, Hinweis auf Erwähnungen und Befehle", x.content.includes("Verknüpft") && x.content.includes("Erika \\*Muster\\*") && x.content.includes("/hilfe"));
  x = await (await c.handleCommand(cmd("verknuepfen", [opt("code", "  k7qm 4xhd  ")], D), m.deps)).work();
  ok("auch ein noch nicht freigegebenes Mitglied kann verknüpfen", m.db.log.rpc.at(-1)[1].p_code === "K7QM4XHD" && m.db.log.rpc.at(-1)[1].p_discord_id === D);
  for (const bad of ["abc", "", "K7QM4XH", "K7QM4XHDX", "K7QM-4XH!", "<script>"]) {
    const m2 = withRpc({ data: { status: "ok" }, error: null });
    const r = await (await c.handleCommand(cmd("verknuepfen", [opt("code", bad)], NEW), m2.deps)).work();
    if (m2.db.log.rpc.length !== 0 || !r.content.includes("8 Zeichen")) { fails++; console.log("FEHLER ungültiger Code wurde weitergegeben:", JSON.stringify(bad)); }
  }
  ok("ungültiges Format (6 Fälle): Hinweis, die Datenbank wird gar nicht gefragt", true);
  for (const [status, expect] of [["invalid", "stimmt nicht oder ist abgelaufen"], ["discord_taken", "schon mit einem anderen Konto"], ["already_linked", "schon mit Discord verknüpft"], ["bad_id", "nicht geklappt"], ["irgendwas", "nicht geklappt"]]) {
    const r = await (await c.handleCommand(cmd("verknuepfen", [opt("code", "K7QM4XHD")], NEW), withRpc({ data: { status }, error: null }).deps)).work();
    ok(`Antwort bei '${status}'`, r.content.includes(expect));
  }
  const r2 = await (await c.handleCommand(cmd("verknuepfen", [opt("code", "K7QM4XHD")], NEW), withRpc({ data: null, error: { message: "boom" } }).deps)).work();
  ok("Datenbankfehler: freundliche Meldung", r2.content.includes("nicht geklappt"));
  const un = await c.handleCommand({ type: 4, data: { name: "verknuepfen", options: [opt("code", "K7", { focused: true })] }, member: { user: { id: NEW } } }, m.deps);
  ok("Autovervollständigung gibt für den Code nichts preis", un.response.type === 8 && un.response.data.choices.length === 0);
}

// ================= Passwort zurücksetzen (/passwort) =================
{
  const { createHash } = await import("node:crypto");
  const cmdP = c.COMMANDS.find((x) => x.name === "passwort");
  ok("/passwort ist registriert, ohne Optionen", !!cmdP && !cmdP.options);
  ok("/passwort steht in der Hilfe", JSON.stringify(c.helpEmbed("https://vza.example")).includes("/passwort"));
  const NEW = "777777777777777777";
  const withRpc = (fn) => mk({}, { discord_create_password_reset: fn });
  let seen = [];
  let m = withRpc((a) => { seen.push(a); return { data: { status: "ok", login_name: "keyan", username: "Keyan" }, error: null }; });
  let h = await c.handleCommand(cmd("passwort", [], NEW), m.deps);
  ok("antwortet sofort und nur für dich sichtbar", h.response.type === 5 && h.response.data.flags === 64);
  let x = await h.work();
  const code = /code=([A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4})/.exec(x.content)?.[1];
  ok("Link mit Adresse der Seite und 16-stelligem Code", !!code && x.content.includes("https://vza.example/passwort-neu?code=" + code));
  ok("an die Datenbank geht nur der Fingerabdruck (SHA-256) des Codes, nie der Code selbst", seen[0].p_hash === createHash("sha256").update(code.replace(/-/g, "")).digest("hex") && !JSON.stringify(seen[0]).includes(code) && seen[0].p_discord_id === NEW);
  ok("auch ohne Konto/Freigabe wird die Datenbank gefragt (sie entscheidet)", m.db.log.rpc[0][0] === "discord_create_password_reset");
  ok("Hinweise: 15 Minuten, einmal, nicht weitergeben; Benutzername genannt; keine Erwähnungen", x.content.includes("15 Minuten") && x.content.includes("nur einmal") && x.content.includes("niemandem") && x.content.includes("`keyan`") && JSON.stringify(x.allowed_mentions) === '{"parse":[]}');
  m = withRpc(() => ({ data: { status: "ok", login_name: null }, error: null }));
  x = await (await c.handleCommand(cmd("passwort", [], NEW), m.deps)).work();
  ok("ohne Benutzernamen: Hinweis, dass er gleich festgelegt wird", x.content.includes("noch keinen Benutzernamen"));
  const noSite = { ...m.deps, siteUrl: undefined };
  x = await (await c.handleCommand(cmd("passwort", [], NEW), noSite)).work();
  ok("ohne SITE_URL: Code statt Link, mit Hinweis", !x.content.includes("http") && /`[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}`/.test(x.content));
  const codes = new Set(); for (let i = 0; i < 40; i++) { const r = await (await c.handleCommand(cmd("passwort", [], NEW), mk({}, { discord_create_password_reset: () => ({ data: { status: "ok" }, error: null }) }).deps)).work(); codes.add(/code=([A-Z2-9-]+)/.exec(r.content)[1]); }
  ok("jedes Mal ein anderer Code (40 von 40 verschieden)", codes.size === 40);
  for (const [status, expect] of [["no_account", "mit keinem Konto"], ["blocked", "gesperrt"], ["too_soon", "gerade erst"], ["bad_id", "nicht geklappt"], ["bad_hash", "nicht geklappt"], ["unbekannt", "nicht geklappt"]]) {
    const r = await (await c.handleCommand(cmd("passwort", [], NEW), withRpc(() => ({ data: { status }, error: null })).deps)).work();
    ok(`Antwort bei '${status}'`, r.content.includes(expect) && !/passwort-neu\?code=/.test(r.content));
  }
  let n = 0; seen = [];
  x = await (await c.handleCommand(cmd("passwort", [], NEW), withRpc((a) => { seen.push(a.p_hash); return { data: { status: ++n < 3 ? "retry" : "ok" }, error: null }; }).deps)).work();
  ok("Kollision ('retry'): neuer Code wird versucht, dann klappt es", x.content.includes("passwort-neu?code=") && seen.length === 3 && new Set(seen).size === 3);
  seen = [];
  x = await (await c.handleCommand(cmd("passwort", [], NEW), withRpc((a) => { seen.push(a); return { data: { status: "retry" }, error: null }; }).deps)).work();
  ok("dreimal Kollision: Meldung statt Endlosschleife", seen.length === 3 && x.content.includes("nicht geklappt"));
  x = await (await c.handleCommand(cmd("passwort", [], NEW), withRpc(() => ({ data: null, error: { message: "boom" } })).deps)).work();
  ok("Datenbankfehler: freundliche Meldung ohne Details", x.content.includes("nicht geklappt") && !x.content.includes("boom"));
  const ac = await c.handleCommand({ type: 4, data: { name: "passwort", options: [] }, member: { user: { id: NEW } } }, m.deps);
  ok("Autovervollständigung gibt nichts preis", ac.response.type === 8 && ac.response.data.choices.length === 0);
}
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
