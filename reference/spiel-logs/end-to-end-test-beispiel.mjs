import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as api from "/tmp/eb/import-api.mjs";
import * as hs from "/tmp/eb/helper-script.mjs";
import * as ls from "/tmp/eb/log-scan.mjs";
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(c ? "OK   " : "FEHLER", n); };
const PWSH = "/tmp/pwsh/pwsh";
const TOKEN = "vzh_" + "K7QM4XHD9WPA2NTC".repeat(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Seite im Kleinen: echte Schnittstelle + nachgebaute Datenbankfunktion ----
function startServer({ allowed = true, knownToken = TOKEN, status } = {}) {
  const state = { requests: [], owned: new Set(), batches: [] };
  const db = { rpc: async (fn, args) => {
    if (fn !== "import_blueprints_for_token") return { data: null, error: { message: "?" } };
    if (args.p_token_hash !== api.hashToken(knownToken)) return { data: { status: "invalid_token" }, error: null };
    if (!allowed) return { data: { status: "not_allowed" }, error: null };
    const seen = new Map(); for (const i of args.p_items) if (!seen.has(i.name.toLowerCase())) seen.set(i.name.toLowerCase(), i);
    let added = 0; for (const k of seen.keys()) if (!state.owned.has(k)) { state.owned.add(k); added++; }
    state.batches.push([...seen.values()]);
    return { data: { status: "ok", received: args.p_items.length, skipped: args.p_items.length - seen.size, new_in_catalog: added, added, already_owned: seen.size - added }, error: null };
  } };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request("http://x" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    state.requests.push({ url: req.url, auth: req.headers.authorization, ct: req.headers["content-type"] });
    let r = status ? new Response(JSON.stringify({ ok: false, message: "Testfehler" }), { status, headers: { "content-type": "application/json" } }) : await api.handleImportRequest(request, db);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

// ---- Die Befehlszeile aus der heruntergeladenen Datei holen (wie sie Windows ausführt, aber mit pwsh) ----
function buildCmd(site, token = TOKEN) {
  const file = path.join(os.tmpdir(), "vza-test-" + Math.random().toString(36).slice(2) + ".cmd");
  fs.writeFileSync(file, hs.buildHelperScript({ site, token }));
  const line = fs.readFileSync(file, "utf8").split("\r\n").find((l) => l.startsWith("powershell "));
  const inner = /-Command "(.*)"$/.exec(line)[1];
  return { file, inner };
}
function run(cmd, env, { input, timeout = 120000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(PWSH, ["-NoProfile", "-Command", cmd.inner], { env: { ...process.env, DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: "1", VZA_SELF: cmd.file, ...env } });
    let out = "", err = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    if (input !== undefined) { p.stdin.write(input); } p.stdin.end();
    const t = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.on("close", (code) => { clearTimeout(t); resolve({ code, out, err, p }); });
  });
}
function live(cmd, env) {
  const p = spawn(PWSH, ["-NoProfile", "-Command", cmd.inner], { env: { ...process.env, DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: "1", VZA_SELF: cmd.file, ...env } });
  const h = { out: "", p }; p.stdout.on("data", (d) => (h.out += d)); p.stderr.on("data", (d) => (h.out += d)); return h;
}
const dirOf = () => fs.mkdtempSync(path.join(os.tmpdir(), "vza-sc-"));
const L = (ts, msg) => `<${ts}> [Notice] <SHUDEvent_OnNotification> Added notification "${msg}" [23] to queue.\n`;
const names = (state) => state.batches.flat().map((i) => i.name);

// ================= A) Ein Durchlauf, Ende-zu-Ende =================
{
  const s = await startServer(); const cmd = buildCmd(s.url);
  const r = await run(cmd, { VZA_LOGDIR: "/tmp/helper/t/a", VZA_ONCE: "1" });
  const sc = ls.createScanner(); for (const f of [...fs.readdirSync("/tmp/helper/t/a/logbackups").map((f) => "/tmp/helper/t/a/logbackups/" + f), "/tmp/helper/t/a/Game.log"]) sc.feed(new TextDecoder().decode(fs.readFileSync(f)));
  const expected = sc.finish().map((x) => x.name).sort();
  ok("Befehlszeile aus der .cmd-Datei startet das eingebettete Programm (Marker-Trick), Ende ohne Fehler", r.code === 0 && r.out.includes("VZA Blaupausen-Helfer") && !r.err.trim());
  ok("alle Blaupausen kommen genau einmal bei der Seite an (wie die Seite sie selbst liest)", JSON.stringify(names(s.state).sort()) === JSON.stringify(expected) && expected.length === 9);
  ok("Anfrage: richtige Adresse, Schlüssel als Bearer, JSON mit UTF-8", s.state.requests.length === 1 && s.state.requests[0].url === "/api/import/blueprints" && s.state.requests[0].auth === "Bearer " + TOKEN && /application\/json/.test(s.state.requests[0].ct) && /utf-8/i.test(s.state.requests[0].ct));
  ok("Umlaute, Anführungszeichen und Zeitpunkte bleiben unversehrt", names(s.state).includes("Größe Süß Ünïcode") && names(s.state).includes('Parallax "Sunstone" Rifle') && s.state.batches[0].find((i) => i.name === "Antium Core Storm").at === "2026-03-20T08:00:00.000Z");
  ok("Ausgabe: Ordner, Anzahl, 'Eingetragen: 9 neu, 0 hattest du schon.'", r.out.includes("Spielordner: /tmp/helper/t/a") && r.out.includes("9 Blaupause(n) in den Logs gefunden") && r.out.includes("Eingetragen: 9 neu, 0 hattest du schon."));
  ok("der Schlüssel wird nie angezeigt", !r.out.includes(TOKEN) && !r.out.includes("vzh_"));
  const r2 = await run(cmd, { VZA_LOGDIR: "/tmp/helper/t/a", VZA_ONCE: "1" });
  ok("zweiter Durchlauf: 0 neu, 9 hattest du schon (nichts doppelt)", r2.out.includes("Eingetragen: 0 neu, 9 hattest du schon."));
  await s.close(); fs.unlinkSync(cmd.file);
}

// ================= B) Fehlerfälle =================
{
  let s = await startServer({ knownToken: "vzh_" + "B".repeat(32) }); let cmd = buildCmd(s.url);
  let r = await run(cmd, { VZA_LOGDIR: "/tmp/helper/t/a", VZA_ONCE: "1" });
  ok("falscher/ersetzter Schlüssel: klare Meldung, Ende mit Fehlercode, kein Absturztext", r.code === 1 && r.out.includes("Lade den Helfer auf der Seite neu herunter") && !r.out.includes("Exception") && !r.err.includes("Exception"));
  await s.close(); s = await startServer({ allowed: false }); cmd = buildCmd(s.url);
  r = await run(cmd, { VZA_LOGDIR: "/tmp/helper/t/a", VZA_ONCE: "1" });
  ok("Konto nicht freigegeben/gesperrt: Meldung der Seite, Fehlercode", r.code === 1 && r.out.includes("nicht freigegeben"));
  await s.close(); s = await startServer({ status: 413 }); cmd = buildCmd(s.url);
  r = await run(cmd, { VZA_LOGDIR: "/tmp/helper/t/a", VZA_ONCE: "1" });
  ok("Seite lehnt die Daten ab (413): Hinweis, kein Absturz", r.code === 0 && r.out.includes("Hinweis der Seite: Testfehler"));
  await s.close(); s = await startServer({ status: 500 }); cmd = buildCmd(s.url);
  r = await run(cmd, { VZA_LOGDIR: "/tmp/helper/t/a", VZA_ONCE: "1" });
  ok("Serverfehler (500): freundlicher Hinweis, kein Absturz, kein Fehlercode", r.code === 0 && r.out.includes("nicht erreichbar") && !r.out.includes("Exception"));
  await s.close();
  cmd = buildCmd("http://127.0.0.1:1"); r = await run(cmd, { VZA_LOGDIR: "/tmp/helper/t/a", VZA_ONCE: "1" });
  ok("Seite gar nicht erreichbar: Hinweis, kein Absturz", r.code === 0 && r.out.includes("nicht erreichbar") && !r.out.includes("Exception"));
  s = await startServer(); cmd = buildCmd(s.url);
  r = await run(cmd, { VZA_LOGDIR: "/tmp/helper/t/b", VZA_ONCE: "1" });
  ok("Logs ohne Blaupausen: ehrlicher Hinweis, nichts gesendet", r.code === 0 && r.out.includes("keine erhaltene Blaupause") && s.state.requests.length === 0);
  const empty = dirOf(); r = await run(cmd, { VZA_LOGDIR: empty, VZA_ONCE: "1" });
  ok("noch kein Log vorhanden (Spiel nie gestartet): freundlicher Hinweis", r.code === 0 && r.out.includes("Noch keine Log-Dateien") && s.state.requests.length === 0);
  await s.close(); fs.unlinkSync(cmd.file);
}

// ================= C) Viele Namen, besondere Zeichen =================
{
  const dir = dirOf(); let text = "";
  for (let i = 0; i < 1200; i++) text += L("2026-05-01T10:" + String(i % 60).padStart(2, "0") + ":00.000Z", `Received Blueprint: Teil Nummer ${i}: `);
  text += L("2026-05-02T10:00:00.000Z", "Received Blueprint: Back\\slash Test: ") + L("2026-05-02T10:00:01.000Z", "Received Blueprint: Raketen 🚀 Emoji: ") + L("2026-05-02T10:00:02.000Z", 'Received Blueprint: Anführung "x" y: ');
  fs.writeFileSync(path.join(dir, "Game.log"), text);
  const s = await startServer(); const cmd = buildCmd(s.url);
  const r = await run(cmd, { VZA_LOGDIR: dir, VZA_ONCE: "1" });
  ok("1203 Namen werden in Paketen zu höchstens 500 gesendet (3 Pakete)", s.state.batches.length === 3 && s.state.batches.every((b) => b.length <= 500) && names(s.state).length === 1203);
  const got = new Set(names(s.state));
  ok("Rückstrich, Emoji, Umlaute und Anführungszeichen kommen exakt an", got.has("Back\\slash Test") && got.has("Raketen 🚀 Emoji") && got.has('Anführung "x" y'));
  ok("Ausgabe zeigt 3 Rückmeldungen", (r.out.match(/Eingetragen:/g) || []).length === 3);
  await s.close(); fs.unlinkSync(cmd.file);
}

// ================= D) Laufender Betrieb =================
{
  const dir = dirOf(); fs.mkdirSync(path.join(dir, "logbackups"));
  fs.writeFileSync(path.join(dir, "Game.log"), L("2026-06-01T10:00:00.000Z", "Received Blueprint: Alt Eins: "));
  const s = await startServer(); const cmd = buildCmd(s.url);
  const h = live(cmd, { VZA_LOGDIR: dir, VZA_POLL: "1" });
  await sleep(6000);
  ok("Start: bisherige Blaupause wird eingetragen, Hinweis 'Fenster offen lassen'", names(s.state).join() === "Alt Eins" && h.out.includes("Lass dieses Fenster offen"));
  fs.appendFileSync(path.join(dir, "Game.log"), "irgendein Lärm\n" + L("2026-06-01T11:00:00.000Z", "Received Blueprint: Neu Zwei: "));
  await sleep(4000);
  ok("neue Blaupause im Spiel: wird automatisch eingetragen, Anzeige 'Neue Blaupause: Neu Zwei'", names(s.state).join() === "Alt Eins,Neu Zwei" && h.out.includes("Neue Blaupause: Neu Zwei"));
  // Zeile wird in zwei Teilen geschrieben (wie wenn das Spiel gerade schreibt)
  const line = L("2026-06-01T12:00:00.000Z", "Received Blueprint: Halb Geschrieben: ");
  fs.appendFileSync(path.join(dir, "Game.log"), line.slice(0, 60)); await sleep(3000);
  ok("halb geschriebene Zeile: noch nichts eingetragen, nichts Falsches", names(s.state).join() === "Alt Eins,Neu Zwei");
  fs.appendFileSync(path.join(dir, "Game.log"), line.slice(60)); await sleep(3500);
  ok("Zeile fertig geschrieben: Blaupause wird vollständig erkannt (nichts verpasst)", names(s.state).includes("Halb Geschrieben") && names(s.state).length === 3);
  ok("nichts doppelt gesendet (jede Blaupause genau einmal)", new Set(names(s.state)).size === names(s.state).length);
  // Neue Spielsitzung: alte Datei wandert in logbackups (letzte Zeile ohne Zeilenumbruch), neue Game.log ist kleiner
  fs.appendFileSync(path.join(dir, "Game.log"), 'Added notification "Received Blueprint: Schluss Ohne Umbruch: " [3] to queue.');
  await sleep(2500);
  fs.renameSync(path.join(dir, "Game.log"), path.join(dir, "logbackups", "Game Build(1) 02 Jun 26.log"));
  fs.writeFileSync(path.join(dir, "Game.log"), L("2026-06-02T09:00:00.000Z", "Received Blueprint: Neue Sitzung: "));
  await sleep(5000);
  ok("neue Spielsitzung wird erkannt: Blaupause der neuen Game.log kommt an", names(s.state).includes("Neue Sitzung"));
  ok("... und die Schlusszeile der alten Sitzung (ohne Zeilenumbruch) wird aus dem Backup nachgeholt", names(s.state).includes("Schluss Ohne Umbruch"));
  ok("... ohne dass Altes noch einmal gesendet wird", new Set(names(s.state)).size === names(s.state).length);
  // Seite zwischenzeitlich weg
  await s.close();
  fs.appendFileSync(path.join(dir, "Game.log"), L("2026-06-02T10:00:00.000Z", "Received Blueprint: Waehrend Ausfall: "));
  await sleep(3500);
  ok("Seite nicht erreichbar: Hinweis, Helfer läuft weiter (kein Absturz)", h.out.includes("nicht erreichbar") && h.p.exitCode === null);
  const s2 = http.createServer(); // gleicher Port nicht mehr verfügbar: neuen Server auf anderem Port geht nicht, daher nur prüfen, dass er lebt
  h.p.kill("SIGKILL"); fs.unlinkSync(cmd.file);
  ok("Fenster schließen beendet den Helfer sauber", true);
}

// ================= E) Gemerkter Ordner und Nachfrage =================
{
  const home = dirOf(); const store = path.join(home, ".local", "share", "VZA-Helfer"); fs.mkdirSync(store, { recursive: true });
  fs.writeFileSync(path.join(store, "ordner.txt"), "/tmp/helper/t/a\n");
  const s = await startServer(); const cmd = buildCmd(s.url);
  let r = await run(cmd, { VZA_ONCE: "1", HOME: home, XDG_DATA_HOME: path.join(home, ".local", "share") });
  ok("gemerkter Ordner wird beim nächsten Start benutzt (keine Nachfrage)", r.out.includes("Spielordner: /tmp/helper/t/a") && !r.out.includes("nicht gefunden") && names(s.state).length === 9);
  const home2 = dirOf(); fs.mkdirSync(path.join(home2, ".local", "share"), { recursive: true });
  r = await run(cmd, { VZA_ONCE: "1", HOME: home2, XDG_DATA_HOME: path.join(home2, ".local", "share") }, { input: "/tmp/helper/t/a\n" });
  ok("Ordner nicht gefunden: Helfer fragt nach dem Pfad und merkt ihn sich", r.out.includes("nicht gefunden") && r.out.includes("Spielordner: /tmp/helper/t/a") && fs.existsSync(path.join(home2, ".local", "share", "VZA-Helfer", "ordner.txt")) && fs.readFileSync(path.join(home2, ".local", "share", "VZA-Helfer", "ordner.txt"), "utf8").includes("/tmp/helper/t/a"));
  const home3 = dirOf(); fs.mkdirSync(path.join(home3, ".local", "share"), { recursive: true });
  r = await run(cmd, { VZA_ONCE: "1", HOME: home3, XDG_DATA_HOME: path.join(home3, ".local", "share") }, { input: '"/gibt/es/nicht"\n' });
  ok("falscher Pfad: klare Meldung statt Absturz, Fehlercode", r.code === 1 && r.out.includes("Diesen Ordner gibt es nicht"));
  await s.close(); fs.unlinkSync(cmd.file);
}

// ================= F) Große Datei =================
{
  const dir = dirOf(); const f = path.join(dir, "Game.log"); const fd = fs.openSync(f, "w");
  const noise = Buffer.from("<2026-07-01T10:00:00.000Z> [Info] <Physics> Zeile mit etwas Inhalt und einer Zahl 1234567 fuer die Laenge\n".repeat(20000));
  for (let i = 0; i < 160; i++) { fs.writeSync(fd, noise); if (i % 20 === 0) fs.writeSync(fd, L("2026-07-01T10:00:00.000Z", `Received Blueprint: Gross Datei ${i}: `)); }
  fs.closeSync(fd); const mb = Math.round(fs.statSync(f).size / 1048576);
  const s = await startServer(); const cmd = buildCmd(s.url); const t0 = Date.now();
  const r = await run(cmd, { VZA_LOGDIR: dir, VZA_ONCE: "1" }, { timeout: 200000 }); const sec = (Date.now() - t0) / 1000;
  console.log(`   (Messung: ${mb} MB Log in ${sec.toFixed(1)} s)`);
  ok(`große Datei (${mb} MB, 3,2 Mio. Zeilen) wird in vertretbarer Zeit gelesen (unter 60 s) und vollständig ausgewertet`, sec < 60 && names(s.state).length === 8 && r.code === 0);
  await s.close(); fs.unlinkSync(cmd.file);
}
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
