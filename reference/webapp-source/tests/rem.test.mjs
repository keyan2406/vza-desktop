import * as r from "../utils/discord-reminders.ts";
import * as d from "../utils/discord.ts";
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(c ? "OK   " : "FEHLER", n); };
process.env.SITE_URL = "https://vza.example";
delete process.env.DISCORD_PING_OPERATIONEN; delete process.env.DISCORD_PING_TARGET;

const base = { id: 5, title: "Bergbau", starts_at: "2026-11-05T19:00:00.000Z", min_players: 3, status: "planned",
  event_signups: [ { role_id: 1, profiles: { username: "Anna", discord_id: "340956971819728896" } }, { role_id: null, profiles: { username: "Ben", discord_id: null } } ],
  event_role_requirements: [{ id: 1, name: "Pilot", quantity: 2 }] };
const dbWith = (row, rpcData) => {
  const updates = [];
  const client = {
    from: (t) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }), update: (v) => ({ eq: async (c, id) => { updates.push([t, v, id]); return {}; } }) }),
    rpc: async () => ({ data: rpcData, error: rpcData === "ERR" ? { message: "x" } : null }),
    updates,
  };
  if (rpcData === "ERR") client.rpc = async () => ({ data: null, error: { message: "x" } });
  return client;
};

// ---- buildReminder ----
let e = await r.buildReminder(dbWith(base), 5, "h1", undefined);
ok("Stunden-Erinnerung", e.title === "Erinnerung: Bergbau" && e.description.includes("in etwa einer Stunde"));
ok("zeigt fehlende Spieler", e.description.includes("**1**"));
ok("Angemeldete mit Discord-ID werden erwähnt, ohne ID nicht", JSON.stringify(e.mentionUsers) === '["340956971819728896"]');
ok("Standard: pingt alle, weil noch jemand fehlt", e.ping === true && e.pingTarget === undefined);
let p = d.buildPayload(e, "operationen");
ok("Nachricht: @everyone und Angemeldeter", p.content === "@everyone <@340956971819728896>" && p.allowed_mentions.users[0] === "340956971819728896");
ok("Beginn mit relativer Zeit", e.fields[0].value.includes(":R>"));
ok("Rollenstand", e.fields.some(f => f.name === "Rollen" && f.value.includes("Pilot: 1 von 2")));

e = await r.buildReminder(dbWith({ ...base, min_players: 2 }), 5, "m10", undefined);
ok("10-Minuten-Text", e.title.startsWith("Gleich geht es los") && e.description.includes("beginnt gleich"));
ok("Mindestzahl erreicht: kein @everyone, nur Angemeldete", e.ping === false && d.buildPayload(e, "operationen").content === "<@340956971819728896>");
ok("alles besetzt: freundlicher Text", e.description.includes("Bis gleich"));

e = await r.buildReminder(dbWith({ ...base, min_players: 1 }), 5, "h1", "everyone");
ok("Modus everyone: immer @everyone", d.buildPayload(e, "operationen").content === "@everyone <@340956971819728896>");
e = await r.buildReminder(dbWith(base), 5, "h1", "none");
ok("Modus none: nur Angemeldete, kein Broadcast", d.buildPayload(e, "operationen").content === "<@340956971819728896>" && d.buildPayload(e, "operationen").allowed_mentions.parse.length === 0);
e = await r.buildReminder(dbWith(base), 5, "h1", "123456789012345678");
ok("Modus Rolle", d.buildPayload(e, "operationen").content.startsWith("<@&123456789012345678>"));
ok("abgesagte Operation: keine Erinnerung", (await r.buildReminder(dbWith({ ...base, status: "cancelled" }), 5, "h1")) === null);
ok("gelöschte Operation: keine Erinnerung", (await r.buildReminder(dbWith(null), 5, "h1")) === null);
const many = { ...base, event_signups: Array.from({ length: 80 }, (_, i) => ({ role_id: null, profiles: { username: "u" + i, discord_id: String(100000 + i) } })) };
e = await r.buildReminder(dbWith(many), 5, "h1");
ok("viele Angemeldete: höchstens 60 Erwähnungen", d.buildPayload(e, "operationen").allowed_mentions.users.length === 60 && d.buildPayload(e, "operationen").content.length < 2000);
const evil = { ...base, title: "*@everyone* <@&123456789012345678>" };
e = await r.buildReminder(dbWith({ ...evil, min_players: 0 }), 5, "h1", "none");
ok("Titel kann nichts auslösen", d.buildPayload(e, "operationen").allowed_mentions.parse.length === 0 && !d.buildPayload(e, "operationen").allowed_mentions.roles);

// ---- runReminders ----
let sentEmbeds = [];
let db = dbWith(base, [{ event_id: 5, kind: "h1" }, { event_id: 5, kind: "m10" }]);
let res = await r.runReminders(db, async (em) => { sentEmbeds.push(em); return true; }, undefined);
ok("zwei Erinnerungen gesendet", res.ok && res.claimed === 2 && res.sent === 2 && res.failed === 0 && sentEmbeds.length === 2);
db = dbWith(base, [{ event_id: 5, kind: "h1" }, { event_id: 6, kind: "m10" }]);
res = await r.runReminders(db, async () => false, undefined);
ok("Senden schlägt fehl: Markierung wird zurückgenommen (neuer Versuch)", res.failed === 2 && db.updates.length === 2 && db.updates[0][1].reminder_60_sent_at === null && db.updates[1][1].reminder_10_sent_at === null);
db = dbWith(base, [{ event_id: 5, kind: "h1" }]);
res = await r.runReminders(db, async () => { throw new Error("boom"); }, undefined);
ok("Ausnahme beim Senden wird abgefangen", res.failed === 1 && res.ok);
db = dbWith({ ...base, status: "running" }, [{ event_id: 5, kind: "h1" }]);
sentEmbeds = []; res = await r.runReminders(db, async (em) => { sentEmbeds.push(em); return true; }, undefined);
ok("inzwischen gestartet: nichts gesendet, kein Fehler", sentEmbeds.length === 0 && res.sent === 1 && res.failed === 0);
res = await r.runReminders(dbWith(base, "ERR"), async () => true, undefined);
ok("Datenbankfehler: sauber beendet", res.ok === false && res.claimed === 0);
res = await r.runReminders(dbWith(base, []), async () => true, undefined);
ok("nichts fällig", res.ok && res.claimed === 0);
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
