import * as c from "../utils/discord-craft.ts";
import * as bot from "../utils/discord-bot.ts";
let fails = 0; const ok = (n, cond) => { if (!cond) fails++; console.log(cond ? "OK   " : "FEHLER", n); };
process.env.SITE_URL = "https://vza.example";
const row = (o = {}) => ({ id: 7, qty: 3, note: null, status: "open", discord_channel_id: "111111111111111111", discord_message_id: "222222222222222222",
  blueprints: { name: "Antium Core Storm", recipe: { secs: 810, items: [{ name: "Torite", scu: 1.2 }, { name: "Glacosite", qty: 170 }] } },
  requester: { username: "Anna", discord_id: "340956971819728896" }, taker: null, ...o });
const db = (r) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: r }) }) }) }) });
const owners = [{ discord_id: "100000000000000001" }, { discord_id: "100000000000000002" }, { discord_id: null }, { discord_id: "kaputt" }, { discord_id: "100000000000000001" }];

let m = await c.buildCraftMessage(db(row()), 7, owners);
ok("Besitzer werden einzeln erwähnt (ohne Doppelte, Unsinn und fehlende IDs)", m.payload.content.startsWith("<@100000000000000001> <@100000000000000002> Wer von euch kann") && m.payload.allowed_mentions.users.length === 2 && m.payload.allowed_mentions.parse.length === 0);
ok("kein @everyone", !m.payload.content.includes("@everyone"));
const e = m.payload.embeds[0];
ok("Karte: Titel, Anfragender, Menge", e.title === "Blaupause angefragt: Antium Core Storm" && e.description.includes("<@340956971819728896>") && e.description.includes("**3×**"));
ok("Zutaten mit Menge multipliziert", e.fields.find((f) => f.name === "Zutaten für 3×").value === "Torite: 3,6 SCU\nGlacosite: 510×");
ok("Herstellzeit", e.fields.find((f) => f.name === "Herstellzeit je Stück").value === "13 Min 30 Sek");
ok("offen: Übernehmen und Abbrechen, plus Link", m.payload.components[0].components.map((b) => b.label).join("|") === "Das übernehme ich|Abbrechen|Auf der Seite");
ok("Kanal und Nachricht für spätere Änderung", m.channelId === "111111111111111111" && m.messageId === "222222222222222222");
m = await c.buildCraftMessage(db(row({ status: "taken", taker: { username: "Bert", discord_id: "100000000000000001" } })), 7);
ok("übernommen: Name des Übernehmers, Erledigt/Zurückgeben/Abbrechen", m.payload.embeds[0].fields[0].value === "Übernommen von <@100000000000000001>" && m.payload.components[0].components.map((b) => b.label).join("|") === "Erledigt|Zurückgeben|Abbrechen|Auf der Seite");
ok("beim späteren Ändern kein neuer Ping (kein Text, keine Erwähnungen)", m.payload.content === undefined && m.payload.allowed_mentions.parse.length === 0 && !m.payload.allowed_mentions.users);
m = await c.buildCraftMessage(db(row({ status: "done", taker: { username: "Bert", discord_id: null } })), 7);
ok("erledigt: keine Knöpfe mehr, Name statt Erwähnung ohne Discord-ID", m.payload.components.length === 0 && m.payload.embeds[0].fields[0].value === "Erledigt von Bert");
m = await c.buildCraftMessage(db(row({ status: "cancelled" })), 7);
ok("abgebrochen: keine Knöpfe", m.payload.components.length === 0 && m.payload.embeds[0].title.startsWith("Anfrage abgebrochen"));
m = await c.buildCraftMessage(db(row({ blueprints: { name: "Etwas", recipe: null }, note: "bis *Freitag* @everyone" })), 7, owners);
ok("ohne Rezept: keine Zutatenliste; Notiz kann nichts auslösen", !m.payload.embeds[0].fields.some((f) => f.name.startsWith("Zutaten")) && m.payload.embeds[0].description.includes("\\*Freitag\\*") && m.payload.allowed_mentions.parse.length === 0);
const many = Array.from({ length: 80 }, (_, i) => ({ discord_id: String(100000000000000000n + BigInt(i)) }));
m = await c.buildCraftMessage(db(row()), 7, many);
ok("viele Besitzer: höchstens 50 Erwähnungen, Text unter dem Limit", m.payload.allowed_mentions.users.length === 50 && m.payload.content.length < 2000);
const longRecipe = row({ blueprints: { name: "X", recipe: { items: Array.from({ length: 20 }, (_, i) => ({ name: "Z" + i, qty: 1 })) } } });
m = await c.buildCraftMessage(db(longRecipe), 7);
ok("lange Rezepte werden gekürzt", m.payload.embeds[0].fields.find((f) => f.name.startsWith("Zutaten")).value.split("\n").length === 9);
ok("unbekannte Anfrage", (await c.buildCraftMessage(db(null), 7)) === null);

// ---- Knöpfe im Bot ----
ok("Knopf-IDs werden erkannt", JSON.stringify(bot.parseCustomId("bp:take:12")) === '{"kind":"bp_take","id":12}' && bot.parseCustomId("bp:done:5").kind === "bp_done" && bot.parseCustomId("bp:release:5").kind === "bp_release" && bot.parseCustomId("bp:cancel:5").kind === "bp_cancel");
ok("falsche Knopf-IDs werden abgelehnt", bot.parseCustomId("bp:hack:1") === null && bot.parseCustomId("bp:take:abc") === null && bot.parseCustomId("bp:take:1;drop") === null && bot.parseCustomId("op:take:1") === null);
const calls = [];
const deps = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: { status: "ok" }, error: null }; }, siteUrl: "https://vza.example" };
const click = (id) => ({ type: 3, data: { custom_id: id }, member: { user: { id: "340956971819728896" } } });
let h = bot.handleInteraction(click("bp:take:9"), deps); let res = await h.work();
ok("Übernehmen ruft die richtige Funktion", calls[0][0] === "discord_take_craft_request" && calls[0][1].p_id === 9 && calls[0][1].p_discord_id === "340956971819728896" && res.refresh.type === "craft" && res.content.includes("übernommen"));
h = bot.handleInteraction(click("bp:done:9"), deps); res = await h.work();
ok("Erledigt", calls[1][0] === "discord_close_craft_request" && calls[1][1].p_action === "done" && res.content.includes("erledigt"));
h = bot.handleInteraction(click("bp:release:9"), deps); await h.work();
h = bot.handleInteraction(click("bp:cancel:9"), deps); await h.work();
ok("Zurückgeben und Abbrechen", calls[2][1].p_action === "release" && calls[3][1].p_action === "cancel");
for (const [status, expect] of [["not_owner", "besitzen"], ["closed", "übernommen oder abgeschlossen"], ["forbidden", "nicht"], ["own_request", "eigene"], ["not_found", "nicht mehr"], ["no_account", "kein Konto"], ["not_member", "Freigabe"]]) {
  const d2 = { rpc: async () => ({ data: { status }, error: null }) };
  const r2 = await bot.handleInteraction(click("bp:take:1"), d2).work();
  ok(`Antwort bei '${status}'`, r2.content.includes(expect) && r2.refresh === undefined);
}
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
