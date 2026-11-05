import * as ev from "../utils/discord-events.ts";
import * as bot from "../utils/discord-bot.ts";
import * as msg from "../utils/discord-messages.ts";
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(c ? "OK   " : "FEHLER", n); };
const NOW = Date.UTC(2026, 10, 2, 10, 0, 0);
const plan = { name: "Bergbau Abend", description: "Treffpunkt Aaron Halo", startsAt: "2026-11-05T19:00:00.000Z", durationMin: 120, location: "Star Citizen", image: "data:image/jpeg;base64,AAAA" };

// ---- Inhalt ----
let b = ev.buildScheduledEvent(plan, NOW);
ok("extern: Typ 3 mit Ort", b.entity_type === 3 && b.entity_metadata.location === "Star Citizen" && b.channel_id === undefined);
ok("nur für Servermitglieder", b.privacy_level === 2);
ok("Beginn und Ende (2 Stunden)", b.scheduled_start_time === "2026-11-05T19:00:00.000Z" && b.scheduled_end_time === "2026-11-05T21:00:00.000Z");
ok("Banner wird mitgeschickt", b.image === "data:image/jpeg;base64,AAAA");
b = ev.buildScheduledEvent({ ...plan, voiceChannelId: "123456789012345678" }, NOW);
ok("mit Sprachkanal: Typ 2, kein Ort", b.entity_type === 2 && b.channel_id === "123456789012345678" && b.entity_metadata === undefined);
b = ev.buildScheduledEvent({ ...plan, voiceChannelId: "abc" }, NOW);
ok("ungültige Kanal-ID: Rückfall auf extern", b.entity_type === 3);
ok("Beginn in der Vergangenheit: kein Event", ev.buildScheduledEvent({ ...plan, startsAt: "2026-11-02T09:00:00.000Z" }, NOW) === null);
ok("Beginn in 30 Sekunden: kein Event (Discord verlangt Vorlauf)", ev.buildScheduledEvent({ ...plan, startsAt: new Date(NOW + 30000).toISOString() }, NOW) === null);
ok("ungültiges Datum: kein Event", ev.buildScheduledEvent({ ...plan, startsAt: "kaputt" }, NOW) === null);
b = ev.buildScheduledEvent({ ...plan, name: "N".repeat(300), description: "D".repeat(3000), location: "L".repeat(300) }, NOW);
ok("Längen begrenzt (100/1000/100)", b.name.length === 100 && b.description.length === 1000 && b.entity_metadata.location.length === 100);
ok("leerer Name bekommt Ersatz", ev.buildScheduledEvent({ ...plan, name: "   " }, NOW).name === "Operation");
ok("ohne Banner kein image-Feld", !("image" in ev.buildScheduledEvent({ ...plan, image: undefined }, NOW)));
ok("Dauer: Standard 120, gültig, zu klein, zu groß, Text", ev.eventDurationMin(undefined) === 120 && ev.eventDurationMin("90") === 90 && ev.eventDurationMin("5") === 120 && ev.eventDurationMin("99999") === 120 && ev.eventDurationMin("abc") === 120);
ok("Event-Adresse", ev.eventUrl("111", "222") === "https://discord.com/events/111/222");

// ---- Aufrufe an Discord (mit Test-Antworten) ----
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return calls.mockResponse(url, init); };
calls.mockResponse = () => ({ ok: true, status: 200, json: async () => ({ id: "987654321012345678" }) });
let id = await ev.createScheduledEvent("TOKEN", "555", { name: "x" });
ok("anlegen: richtige Adresse, Methode, Bot-Kopfzeile", id === "987654321012345678" && calls[0].url === "https://discord.com/api/v10/guilds/555/scheduled-events" && calls[0].init.method === "POST" && calls[0].init.headers.Authorization === "Bot TOKEN");
calls.mockResponse = () => ({ ok: false, status: 403, json: async () => ({ message: "Missing Permissions" }) });
ok("anlegen ohne Recht: null statt Absturz", (await ev.createScheduledEvent("T", "555", {})) === null);
calls.mockResponse = () => { throw new Error("netz"); };
ok("Netzwerkfehler: null statt Absturz", (await ev.createScheduledEvent("T", "555", {})) === null);
calls.mockResponse = () => ({ ok: true, status: 200, json: async () => ({}) });
ok("ändern", (await ev.patchScheduledEvent("T", "555", "9", { status: 2 })) === true && calls.at(-1).url.endsWith("/scheduled-events/9") && calls.at(-1).init.method === "PATCH");
calls.mockResponse = () => ({ ok: true, status: 204, json: async () => { throw new Error("leer"); } });
ok("löschen (leere Antwort)", (await ev.deleteScheduledEvent("T", "555", "9")) === true && calls.at(-1).init.method === "DELETE" && calls.at(-1).init.body === undefined);
ok("Status-Werte laut Discord", ev.EVENT_STATUS.active === 2 && ev.EVENT_STATUS.completed === 3 && ev.EVENT_STATUS.canceled === 4);

// ---- Banner ----
calls.mockResponse = () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer });
let img = await ev.loadBanner("https://vza.example");
ok("Banner geladen als data-Adresse", img === "data:image/jpeg;base64,AQIDBA==" && calls.at(-1).url === "https://vza.example/vza-event-banner.jpg");
const before = calls.length; img = await ev.loadBanner("https://vza.example");
ok("Banner wird nur einmal geladen", calls.length === before && img === "data:image/jpeg;base64,AQIDBA==");

// ---- Knopf zum Discord-Event in der Nachricht ----
const comps = bot.eventComponents(5, [], "https://vza.example/o/5", "https://discord.com/events/1/2");
ok("Knopf 'Discord-Event' vorhanden", comps[0].components.some(c => c.label === "Discord-Event" && c.url === "https://discord.com/events/1/2"));
ok("ohne Event kein Knopf", !bot.eventComponents(5, [], "https://x.example")[0]?.components?.some?.(c => c.label === "Discord-Event"));
process.env.SITE_URL = "https://vza.example"; process.env.DISCORD_GUILD_ID = "777";
const row = { id: 5, title: "Bergbau", description: null, starts_at: "2026-11-05T19:00:00.000Z", min_players: 2, points: 10, status: "planned", discord_channel_id: "1", discord_message_id: "2", discord_event_id: "888",
  event_signups: [], event_ship_requirements: [], event_role_requirements: [] };
const db = (r) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: r }) }) }) }) });
let m = await msg.buildEventMessage(db(row), 5);
ok("Nachricht verlinkt das Discord-Event", JSON.stringify(m.payload.components).includes("https://discord.com/events/777/888"));
m = await msg.buildEventMessage(db({ ...row, discord_event_id: null }), 5);
ok("Nachricht ohne Event: kein Link", !JSON.stringify(m.payload.components).includes("discord.com/events"));
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
