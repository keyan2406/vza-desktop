import * as l from "./log-scan.ts";
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(c ? "OK   " : "FEHLER", n); };

const canon = '<2026-03-26T17:15:41.684Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Defiance Helmet Tactical: " [23] to queue.';
let f = l.parseLine(canon);
ok("kanonische Zeile: Name und Zeit", f && f.name === "Defiance Helmet Tactical" && f.at === "2026-03-26T17:15:41.684Z");
ok("Anführungszeichen im Namen", l.parseLine('<2026-03-26T12:00:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Parallax "Sunstone" Energy Assault Rifle: " [4] to queue.').name === 'Parallax "Sunstone" Energy Assault Rifle');
ok("Klammern und Zahlen im Namen", l.parseLine('<2026-03-26T12:00:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Parallax Rifle Battery (80 Cap): " [4] to queue.').name === "Parallax Rifle Battery (80 Cap)");
ok("Doppelpunkt im Namen bleibt erhalten", l.parseLine('<2026-03-26T12:00:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Serie 7: Alpha: " [4] to queue.').name === "Serie 7: Alpha");
ok("deutsche Variante", l.parseLine('<2026-03-26T12:00:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Bauplan erhalten: Monde Helm Hiro: " [4] to queue.').name === "Monde Helm Hiro");
ok("Echo-Zeile (UpdateNotificationItem) wird ignoriert", l.parseLine('<2026-03-26T17:15:41.700Z> [Notice] <UpdateNotificationItem> Notification "Received Blueprint: Defiance Helmet Tactical: " [23] updated') === null);
ok("Rückfall ohne Doppelpunkt am Ende", l.parseLine('<2026-03-26T12:00:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Antium Core" [4] to queue.')?.name === "Antium Core");
ok("Zeile ohne Zeitstempel", l.parseLine('Added notification "Received Blueprint: Antium Core: " [4]').at === null);
ok("Windows-Zeilenende", l.parseLine(canon + "\r").name === "Defiance Helmet Tactical");
ok("fremde Zeilen werden ignoriert", l.parseLine("<2026-03-26T12:00:00.000Z> [Notice] <Contract Complete> Mission finished") === null && l.parseLine("") === null);
ok("Erwähnung ohne Namen wird ignoriert", l.parseLine('Added notification "Received Blueprint: : " [1]') === null);
ok("riesige Zeile wird verworfen", l.parseLine("x".repeat(5000) + canon) === null);
ok("zu langer Name wird verworfen", l.parseLine('Added notification "Received Blueprint: ' + "N".repeat(200) + ': " [1]') === null);
ok("Steuerzeichen/Mehrfach-Leerzeichen bereinigt", l.parseLine('Added notification "Received Blueprint:   Antium    Core  : " [1]').name === "Antium Core");

// ---- Sammeln über Blockgrenzen ----
const text = [canon, "irgendwas", canon.replace("17:15:41.684", "09:00:00.000"), '<2026-03-27T10:00:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Antium Core: " [1] to queue.'].join("\n") + "\n";
let s = l.createScanner(); s.feed(text); let r = s.finish();
ok("Doppelte zählen einmal, früheste Zeit gewinnt", r.length === 2 && r.find(x => x.name === "Defiance Helmet Tactical").at === "2026-03-26T09:00:00.000Z");
// Zeile in der Mitte durchschneiden, an jeder möglichen Stelle
let allOk = true;
for (let cut = 1; cut < text.length; cut += 7) { const sc = l.createScanner(); sc.feed(text.slice(0, cut)); sc.feed(text.slice(cut)); const res = sc.finish(); if (res.length !== 2) { allOk = false; break; } }
ok("Zerschneiden an jeder Stelle ergibt dasselbe", allOk);
s = l.createScanner(); s.feed(canon); // ohne Zeilenumbruch am Ende
ok("snapshot ignoriert die noch offene Zeile, finish nimmt sie mit", s.snapshot().length === 0 && s.finish().length === 1);
s = l.createScanner(); s.feed(canon + "\n"); ok("snapshot enthält abgeschlossene Zeilen", s.snapshot().length === 1);

// ---- Große Dateien in Stücken ----
const bigLine = '<2026-03-26T12:00:00.000Z> [Notice] <Something> ' + "x".repeat(150) + "\n";
const parts = []; for (let i = 0; i < 90000; i++) { parts.push(bigLine); if (i % 30000 === 0) parts.push(canon.replace("Defiance Helmet Tactical", "Test " + i) + "\n"); }
const blob = new Blob(parts); // ca. 17 MB
let last = 0; s = l.createScanner();
const t0 = Date.now(); const done = await l.scanBlob(blob, s, { onProgress: (rd, tot) => { last = rd / tot; } }); const ms = Date.now() - t0;
r = s.finish();
ok(`17-MB-Datei gescannt (${ms} ms), 3 Funde, Fortschritt 100 %`, done && r.length === 3 && Math.abs(last - 1) < 1e-9);
const stop = { aborted: false }; s = l.createScanner();
const cancelled = await l.scanBlob(blob, s, { signal: stop, onProgress: () => { stop.aborted = true; } });
ok("Abbrechen funktioniert", cancelled === false);
// Fortsetzen ab einer Stelle (für die Live-Überwachung)
const first = new Blob(["noch nichts\n", canon.slice(0, 40)]); const rest = new Blob([canon.slice(40) + "\n"]);
s = l.createScanner(); await l.scanBlob(first, s); await l.scanBlob(rest, s);
ok("Zeile über zwei Lesevorgänge hinweg wird erkannt", s.finish().length === 1);
// UTF-8: Umlaute und Zeichen über Blockgrenzen
s = l.createScanner(); const u = '<2026-03-26T12:00:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Rüstung Süd: " [1] to queue.\n';
await l.scanBlob(new Blob([u]), s); ok("Umlaute", s.finish()[0].name === "Rüstung Süd");
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
