import * as c from "../utils/calendar.ts";
import * as d from "../utils/discord.ts";
let fails = 0; const ok = (n, cond) => { if (!cond) fails++; console.log(cond ? "OK   " : "FEHLER", n); };

// ---- Kalender ----
const g = c.monthGrid(2026, 11);   // 1. Nov 2026 ist ein Sonntag
ok("42 Zellen", g.length === 42);
ok("Woche beginnt am Montag: 26.10.2026", g[0].key === "2026-10-26" && !g[0].inMonth);
ok("1. November ist eine Sonntagszelle (Index 6)", g[6].key === "2026-11-01" && g[6].inMonth);
ok("30 Tage im Monat", g.filter(x => x.inMonth).length === 30);
const feb = c.monthGrid(2028, 2);   // Schaltjahr
ok("Schaltjahr: 29 Tage", feb.filter(x => x.inMonth).length === 29);
const dec = c.monthGrid(2026, 12); ok("Dezember: 31 Tage, Jahreswechsel in der Rasterzeile", dec.filter(x => x.inMonth).length === 31 && dec[41].key.startsWith("2027") || dec[41].key.startsWith("2026"));
ok("Monat vor Januar", JSON.stringify(c.shiftMonth(2026, 1, -1)) === '{"y":2025,"m":12}');
ok("Monat nach Dezember", JSON.stringify(c.shiftMonth(2026, 12, 1)) === '{"y":2027,"m":1}');
ok("12 Monate zurück", JSON.stringify(c.shiftMonth(2026, 3, -14)) === '{"y":2025,"m":1}');
const fb = { y: 2026, m: 11 };
ok("Monat parsen", JSON.stringify(c.parseMonth("2027-03", fb)) === '{"y":2027,"m":3}');
ok("Unsinn -> Standard", c.parseMonth("2026-13", fb) === fb && c.parseMonth("abc", fb) === fb && c.parseMonth("1999-05", fb) === fb && c.parseMonth(undefined, fb) === fb);
ok("Injection im Monat -> Standard", c.parseMonth("2026-11'; drop", fb) === fb);
ok("Tag parsen", c.parseDay("2026-11-05") === "2026-11-05" && c.parseDay("2026-11-35") === null && c.parseDay("x") === null);
// Zeitzonen: 23:30 UTC im Winter ist 00:30 des nächsten Tages in Berlin
ok("Berlin-Tag über Mitternacht (Winter)", c.keyOf(new Date("2026-11-05T23:30:00Z")) === "2026-11-06");
ok("Berlin-Tag über Mitternacht (Sommer, +2)", c.keyOf(new Date("2026-07-05T22:30:00Z")) === "2026-07-06");
ok("Uhrzeit Winter", c.timeOf(new Date("2026-11-05T19:00:00Z")) === "20:00");
ok("Uhrzeit Sommer", c.timeOf(new Date("2026-07-05T18:00:00Z")) === "20:00");
ok("Zeitraum deckt Raster ab", (() => { const r = c.gridRange(g); return r.startIso < "2026-10-26T00:00:00.000Z" && r.endIso > "2026-12-06T00:00:00.000Z"; })());
ok("Monatsname deutsch", c.monthTitle(2026, 11).toLowerCase().includes("november") && c.monthTitle(2026, 3).toLowerCase().includes("märz"));

// ---- Pings ----
delete process.env.DISCORD_PING_OPERATIONEN; delete process.env.DISCORD_PING_TARGET;
let p = d.buildPayload({ title: "Test" }, "loot");
ok("Standard: @everyone in jedem Channel", p.content === "@everyone" && p.allowed_mentions.parse[0] === "everyone");
p = d.buildPayload({ title: "Test", ping: false }, "loot");
ok("ping:false = kein Ping", p.content === undefined && p.allowed_mentions.parse.length === 0);
p = d.buildPayload({ title: "Test" });
ok("ohne Channel kein Ping", p.content === undefined);
process.env.DISCORD_PING_LOOT = "none"; p = d.buildPayload({ title: "x" }, "loot");
ok("pro Channel abschaltbar", p.content === undefined);
process.env.DISCORD_PING_KASSE = "123456789012345678"; p = d.buildPayload({ title: "x" }, "kasse");
ok("pro Channel auf eine Rolle", p.content === "<@&123456789012345678>" && p.allowed_mentions.roles[0] === "123456789012345678" && p.allowed_mentions.parse.length === 0);
process.env.DISCORD_PING_TARGET = "here"; p = d.buildPayload({ title: "x" }, "operationen");
ok("alte Einstellung gilt für #operationen", p.content === "@here");
process.env.DISCORD_PING_OPERATIONEN = "everyone"; p = d.buildPayload({ title: "x" }, "operationen");
ok("neue Einstellung geht vor", p.content === "@everyone");
p = d.buildPayload({ title: "x", mentionUsers: ["340956971819728896", "evil", "1;2"] }, "admin");
ok("Gewinner direkt erwähnt, Unsinn ignoriert", p.content === "@everyone <@340956971819728896>" && p.allowed_mentions.users.length === 1);
p = d.buildPayload({ title: "Hallo @everyone und <@&123456789012345678>", description: "@here", ping: false });
ok("Text im Titel/Beschreibung löst nie etwas aus", p.allowed_mentions.parse.length === 0 && !p.allowed_mentions.roles && !p.allowed_mentions.users);
p = d.buildPayload({ title: "x", mentionUsers: Array.from({ length: 80 }, (_, i) => String(10000 + i)) }, "admin");
ok("höchstens 60 direkte Erwähnungen", p.allowed_mentions.users.length === 60);
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
