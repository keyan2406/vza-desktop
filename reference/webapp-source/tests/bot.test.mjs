import { generateKeyPairSync, sign } from "node:crypto";
import * as bot from "../utils/discord-bot.ts";
import * as msg from "../utils/discord-messages.ts";

let fails = 0;
const ok = (name, cond) => { if (!cond) fails++; console.log(cond ? "OK   " : "FEHLER", name); };

// ---------- 1) Signatur ----------
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const now = Math.floor(Date.now() / 1000);
const ts = String(now);
const body = JSON.stringify({ type: 1 });
const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");
ok("gültige Signatur", bot.verifyDiscordSignature(raw, sig, ts, body));
ok("veränderter Inhalt abgelehnt", !bot.verifyDiscordSignature(raw, sig, ts, body + " "));
ok("falsche Zeit abgelehnt", !bot.verifyDiscordSignature(raw, sig, String(now + 1), body));
const old = String(now - 3600);
const oldSig = sign(null, Buffer.from(old + body), privateKey).toString("hex");
ok("alte Anfrage abgelehnt (Wiederholungsschutz)", !bot.verifyDiscordSignature(raw, oldSig, old, body));
ok("kaputter Schlüssel abgelehnt", !bot.verifyDiscordSignature("zz", sig, ts, body));
ok("kaputte Signatur abgelehnt", !bot.verifyDiscordSignature(raw, "00".repeat(64), ts, body));
const other = generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
ok("fremder Schlüssel abgelehnt", !bot.verifyDiscordSignature(other, sig, ts, body));

// ---------- 2) Erwähnungen ----------
const e = bot.pingFor(undefined); ok("Standard = @everyone", e.text === "@everyone" && e.allowed.parse[0] === "everyone");
ok("here", bot.pingFor("here").text === "@here");
ok("keine", bot.pingFor("none").text === "" && bot.pingFor("none").allowed.parse.length === 0);
const r = bot.pingFor("123456789012345678"); ok("Rolle", r.text === "<@&123456789012345678>" && r.allowed.roles[0] === "123456789012345678" && r.allowed.parse.length === 0);
ok("Unsinn = keine Erwähnung", bot.pingFor("@everyone; drop").text === "");

// ---------- 3) Knopf-IDs ----------
ok("op:join", JSON.stringify(bot.parseCustomId("op:join:12")) === '{"kind":"op_join","id":12}');
ok("loot:claim", bot.parseCustomId("loot:claim:5")?.kind === "loot_claim");
ok("op:claim ungültig", bot.parseCustomId("op:claim:5") === null);
ok("loot:join ungültig", bot.parseCustomId("loot:join:5") === null);
ok("Text statt Zahl ungültig", bot.parseCustomId("op:join:abc") === null && bot.parseCustomId("op:join:1;2") === null);
ok("kein String ungültig", bot.parseCustomId(42) === null && bot.parseCustomId(undefined) === null);

// ---------- 4) Komponenten ----------
const comps = bot.eventComponents(7, Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: "R".repeat(150), filled: 1, needed: 2 })), "https://x.example/o/7");
ok("Menü höchstens 25 Optionen", comps[1].components[0].options.length === 25);
ok("Rollenname auf 100 gekürzt", comps[1].components[0].options[0].label.length === 100);
ok("3 Knöpfe in Zeile 1", comps[0].components.length === 3 && comps[0].components[2].style === 5);
ok("ohne Rollen kein Menü", bot.eventComponents(7, []).length === 1);
ok("Loot: Claim und Zurückziehen", bot.lootComponents(3)[0].components.map(c => c.custom_id).join() === "loot:claim:3,loot:unclaim:3");

// ---------- 5) Klick-Verarbeitung ----------
const calls = [];
const deps = { siteUrl: "https://vza.example", rpc: async (fn, args) => { calls.push([fn, args]); return { data: next, error: null }; } };
let next;
const click = (custom_id, extra = {}) => ({ type: 3, data: { custom_id, ...extra }, member: { user: { id: "340956971819728896" } } });

ok("PING beantwortet", JSON.stringify(bot.handleInteraction({ type: 1 }, deps).response) === '{"type":1}');
const h = bot.handleInteraction(click("op:join:9"), deps);
ok("sofortige, nur für den Klickenden sichtbare Quittung", h.response.type === 5 && h.response.data.flags === 64 && typeof h.work === "function");
next = { status: "ok", already: false };
let res = await h.work();
ok("Anmelden ruft die richtige Funktion", calls[0][0] === "discord_event_signup" && calls[0][1].p_event_id === 9 && calls[0][1].p_role_id === null && calls[0][1].p_discord_id === "340956971819728896");
ok("Antwort bestätigt und Nachricht wird aktualisiert", res.content.includes("Du bist dabei") && res.refresh.type === "event" && res.refresh.id === 9);

next = { status: "ok", role: "Pilot" };
res = await bot.handleInteraction(click("op:role:9", { values: ["42"] }), deps).work();
ok("Rolle wählen", calls.at(-1)[1].p_role_id === 42 && res.content.includes("Pilot"));
ok("Rolle ohne Auswahl abgelehnt", bot.handleInteraction(click("op:role:9", { values: [] }), deps).response.type === 4);
ok("Rolle mit Text statt Zahl abgelehnt", bot.handleInteraction(click("op:role:9", { values: ["1; drop"] }), deps).response.type === 4);

next = { status: "ok", was_signed_up: true };
res = await bot.handleInteraction(click("op:leave:9"), deps).work();
ok("Abmelden", calls.at(-1)[0] === "discord_event_signoff" && res.content.includes("abgemeldet"));

next = { status: "ok", name: "Quantanium" };
res = await bot.handleInteraction(click("loot:claim:4"), deps).work();
ok("Claim setzen", calls.at(-1)[0] === "discord_loot_claim" && res.refresh.type === "loot" && res.content.includes("Quantanium"));
res = await bot.handleInteraction(click("loot:unclaim:4"), deps).work();
ok("Claim zurückziehen", calls.at(-1)[0] === "discord_loot_unclaim" && res.refresh.type === "loot");

next = { status: "no_account" };
res = await bot.handleInteraction(click("op:join:9"), deps).work();
ok("kein Konto: Hinweis mit Link, keine Aktualisierung", res.content.includes("https://vza.example") && !res.refresh);
next = { status: "pending" }; res = await bot.handleInteraction(click("op:join:9"), deps).work();
ok("wartendes Konto", res.content.includes("Freigabe") && !res.refresh);
next = { status: "closed" }; res = await bot.handleInteraction(click("op:join:9"), deps).work();
ok("geschlossene Operation", res.content.includes("nicht mehr") && !res.refresh);
next = { status: "already", name: "X" }; res = await bot.handleInteraction(click("loot:claim:4"), deps).work();
ok("doppelter Claim", res.content.includes("schon geclaimt") && !res.refresh);

const failing = { siteUrl: "x", rpc: async () => ({ data: null, error: { message: "db down" } }) };
res = await bot.handleInteraction(click("op:join:9"), failing).work();
ok("Datenbankfehler: freundliche Meldung, nichts durchgesickert", res.content.includes("nicht geklappt") && !res.content.includes("db down"));

ok("Klick ohne Nutzer abgelehnt", bot.handleInteraction({ type: 3, data: { custom_id: "op:join:1" } }, deps).response.type === 4);
ok("unbekannter Knopf abgelehnt", bot.handleInteraction(click("evil:do:1"), deps).response.type === 4);
ok("Slash-Befehl noch nicht unterstützt", bot.handleInteraction({ type: 2 }, deps).response.type === 4);
ok("Nutzer-ID mit Text abgelehnt", bot.handleInteraction({ type: 3, data: { custom_id: "op:join:1" }, member: { user: { id: "1; drop" } } }, deps).response.type === 4);

// ---------- 6) Nachrichten aus Datenbankzeilen ----------
process.env.SITE_URL = "https://vza.example";
const eventRow = {
  id: 5, title: "Bergbau *Abend*", description: "@everyone Treffpunkt", starts_at: "2026-11-05T19:00:00.000Z", min_players: 2, points: 10, status: "planned",
  discord_channel_id: "111", discord_message_id: "222",
  event_signups: [
    { user_id: "a", role_id: 1, profiles: { username: "Anna", discord_id: "1002" } },
    { user_id: "b", role_id: null, profiles: { username: "Ben_", discord_id: null } },
  ],
  event_ship_requirements: [{ quantity: 2, ships: { name: "Prospector" } }],
  event_role_requirements: [{ id: 1, name: "Pilot", quantity: 2 }, { id: 2, name: "Medic", quantity: 1 }],
};
const db = (row) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }) });
process.env.DISCORD_PING_TARGET = "everyone";
let m = await msg.buildEventMessage(db(eventRow), 5, { ping: true });
const emb = m.payload.embeds[0];
ok("Titel mit Formatierung geschützt? (nur Inhalt escaped)", emb.title.includes("Bergbau"));
ok("Beschreibung: @everyone im Text löst nichts aus (erlaubt nur beim Ping)", m.payload.allowed_mentions.parse[0] === "everyone" && m.payload.content.startsWith("@everyone"));
ok("Teilnehmer als Erwähnung ohne Ping im Embed", emb.fields.some(f => f.value.includes("<@1002>")));
ok("Mitglied ohne Discord-ID mit Namen", emb.fields.some(f => f.value.includes("Ben")));
ok("Rollen mit Zählung", emb.fields.some(f => f.name.includes("Pilot") && f.name.includes("1 von 2")) && emb.fields.some(f => f.name.includes("Medic") && f.name.includes("0 von 1")));
ok("Knöpfe und Menü vorhanden", m.payload.components.length === 2);
ok("Kanal- und Nachrichten-ID gemerkt", m.channelId === "111" && m.messageId === "222");
m = await msg.buildEventMessage(db(eventRow), 5, { ping: false });
ok("Aktualisierung ohne Erwähnung und ohne neuen Text", m.payload.content === undefined && m.payload.allowed_mentions.parse.length === 0);
m = await msg.buildEventMessage(db({ ...eventRow, status: "finished" }), 5);
ok("abgeschlossen: keine Knöpfe mehr", m.payload.components.length === 0 && m.payload.embeds[0].title.startsWith("Abgeschlossen"));
process.env.DISCORD_PING_TARGET = "none";
m = await msg.buildEventMessage(db(eventRow), 5, { ping: true });
ok("Ping abschaltbar", m.payload.content === undefined && m.payload.allowed_mentions.parse.length === 0);
ok("Nicht gefunden = null", (await msg.buildEventMessage(db(null), 5)) === null);

const lootRow = { name: "Quantanium", quantity: 5, status: "released", price_auec: 1000, location: "vizsla_bank", location_note: null, discord_channel_id: "9", discord_message_id: "8",
  events: { title: "Bergbau" }, holder: null, winner: null,
  loot_claims: [{ status: "pending", created_at: "2026-11-01T10:00:00Z", profiles: { username: "Anna", discord_id: "1002" } }, { status: "lost", created_at: "2026-11-01T11:00:00Z", profiles: { username: "Ben", discord_id: "1" } }] };
m = await msg.buildLootMessage(db(lootRow), 3, { ping: true });
ok("Loot: Claim-Knöpfe, nur offene Claims gezählt", m.payload.components.length === 1 && m.payload.embeds[0].fields.some(f => f.name === "Claims (1)"));
ok("Loot: pingt wie alle Channels zunächst alle", String(m.payload.content).startsWith("@everyone"));
process.env.DISCORD_PING_LOOT = "none";
const quiet = await msg.buildLootMessage(db(lootRow), 3, { ping: true });
ok("Loot: Ping pro Channel abschaltbar", quiet.payload.content === undefined);
delete process.env.DISCORD_PING_LOOT;
m = await msg.buildLootMessage(db({ ...lootRow, status: "awarded", winner: { username: "Anna", discord_id: "1002" } }), 3);
ok("Loot zugeteilt: keine Knöpfe, Gewinner genannt", m.payload.components.length === 0 && m.payload.embeds[0].description.includes("<@1002>"));

console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
