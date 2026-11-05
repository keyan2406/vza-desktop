import * as v from "../utils/auth-validate.ts";
import * as c from "../utils/auth-codes.ts";
import { createHash } from "node:crypto";
let fails = 0; const ok = (n, cond) => { if (!cond) fails++; console.log(cond ? "OK   " : "FEHLER", n); };

// ---- Passwort ----
ok("9 Zeichen zu kurz, 10 reichen", !v.validatePassword("123456789").ok && v.validatePassword("1234567890").ok);
ok("72 Zeichen erlaubt, 73 nicht", v.validatePassword("x".repeat(72)).ok && !v.validatePassword("x".repeat(73)).ok);
ok("nur Leerzeichen abgelehnt", !v.validatePassword(" ".repeat(12)).ok);
ok("Passwort bleibt unverändert (keine Kürzung, Leerzeichen zählen)", v.validatePassword("  geheim 1234  ").value === "  geheim 1234  ");
ok("fehlendes Passwort", !v.validatePassword(undefined).ok && !v.validatePassword(null).ok);
ok("Umlaute und Emojis zählen als Zeichen", v.validatePassword("Pässwörter-sind-gut").ok);

// ---- Benutzername ----
const n = (x) => v.validateLoginName(x);
ok("Benutzername: klein geschrieben gespeichert, Schreibweise der Eingabe bleibt als Anzeigename", JSON.stringify(n("  Keyan ")) === '{"ok":true,"value":"keyan","display":"Keyan"}');
for (const good of ["abc", "a1b", "keyan", "Max.Mustermann", "max_m-2", "x".repeat(24), "007", "a.b", "k-3"]) if (!n(good).ok) { fails++; console.log("FEHLER sollte gehen:", good, n(good).error); }
ok("gültige Namen werden angenommen (9 Fälle)", true);
for (const bad of ["", "  ", "ab", "x".repeat(25), "max muster", "jörg", "maß", ".max", "-max", "_max", "max.", "max-", "ma..x", "ma_-x", "<b>x</b>", "max@x.de", "max;drop", "名前名前", "ma\u0000x", "ma\nx", null, undefined, 42, "a'b", 'a"b', "a/b", "a\\b"]) {
  if (n(bad).ok) { fails++; console.log("FEHLER wurde akzeptiert:", JSON.stringify(bad)); }
}
ok("ungültige Namen werden abgelehnt (26 Fälle: Länge, Leerzeichen, Umlaute, Sonderzeichen, Steuerzeichen, Anfang/Ende)", true);
for (const r of ["admin", "Admin", "ROOT", "system", "vza", "bot", "discord", "everyone", "here", "null", "undefined", "officer", "moderator", "support"]) if (n(r).ok) { fails++; console.log("FEHLER reserviert:", r); }
ok("reservierte Namen sind gesperrt (14 Fälle, auch groß geschrieben)", true);
ok("Fehlermeldungen sind verständlich", n("ab").error.includes("3 bis 24") && n("max muster").error.includes("Erlaubt sind") && n("admin").error.includes("nicht nehmen") && n("").error.includes("Bitte gib"));
ok("Anmelde-Adresse ohne echte E-Mail: name@vza.invalid, Endung einstellbar", v.toAuthEmail("keyan") === "keyan@vza.invalid" && v.toAuthEmail("keyan", "vza.example") === "keyan@vza.example" && v.AUTH_DOMAIN_DEFAULT === "vza.invalid");

// ---- Einladungscode / Verknüpfungscode / Passwort-Code ----
ok("Einladungscode: groß, ohne Leerzeichen", v.normalizeInviteCode("  vza-k7qm-4xhd ").value === "VZA-K7QM-4XHD");
ok("Einladungscode: Leerzeichen mitten drin", v.normalizeInviteCode("vza k7qm 4xhd").value === "VZAK7QM4XHD");
ok("Einladungscode: leer, zu kurz, Sonderzeichen", !v.normalizeInviteCode("").ok && !v.normalizeInviteCode("abc").ok && !v.normalizeInviteCode("vza_k7qm!").ok && !v.normalizeInviteCode("x".repeat(40)).ok);
ok("Verknüpfungscode: 8 Zeichen, Bindestrich und Leerzeichen egal", v.normalizeLinkCode(" k7qm-4xhd ").value === "K7QM4XHD" && !v.normalizeLinkCode("K7QM4XH").ok && !v.normalizeLinkCode("K7QM4XHDX").ok && !v.normalizeLinkCode("K7QM4XH!").ok);
ok("Passwort-Code: 16 Zeichen, mit oder ohne Bindestriche, klein erlaubt", v.normalizeResetCode("k7qm-4xhd-9wpa-2ntc").value === "K7QM4XHD9WPA2NTC" && v.normalizeResetCode("K7QM4XHD9WPA2NTC").ok && v.normalizeResetCode(" K7QM 4XHD 9WPA 2NTC ").ok);
ok("Passwort-Code: zu kurz/lang, verwechselbare Zeichen (0 O 1 I), Sonderzeichen, nichts", ["K7QM-4XHD-9WPA", "K7QM-4XHD-9WPA-2NTC-X", "K7QM-4XHD-9WPA-2NT0", "K7QM-4XHD-9WPA-2NTI", "K7QM-4XHD-9WPA-2NT!", "", null, undefined].every((x) => !v.normalizeResetCode(x).ok));
ok("Passwort-Code: Fehlermeldung nennt /passwort", v.normalizeResetCode("x").error.includes("/passwort"));

// ---- Fehlertexte ----
ok("Fehlertexte auf Deutsch", v.authErrorText("weak_password").includes("zu einfach") && v.authErrorText("over_request_rate_limit").includes("Zu viele") && v.authErrorText("same_password").includes("unterscheiden") && v.authErrorText("session_not_found").includes("abgelaufen") && v.authErrorText(undefined, "Database error: Ungültiger Einladungscode").includes("Einladungscode") && v.authErrorText("xyz").includes("nicht geklappt"));
ok("Keine Fehlermeldung verrät technische Einzelheiten", !v.authErrorText("xyz", "duplicate key value violates unique constraint").includes("duplicate"));

// ---- Codes ----
const inv = new Set(), link = new Set(), reset = new Set();
for (let i = 0; i < 2000; i++) { inv.add(c.newInviteCode()); link.add(c.newLinkCode()); reset.add(c.newResetCode()); }
ok("2000 Einladungscodes: alle verschieden, richtiges Format", inv.size === 2000 && [...inv].every((x) => /^VZA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(x) && v.normalizeInviteCode(x).ok));
ok("2000 Verknüpfungscodes: alle verschieden, 8 Zeichen ohne 0 O 1 I", link.size === 2000 && [...link].every((x) => /^[A-HJ-NP-Z2-9]{8}$/.test(x) && v.normalizeLinkCode(x).ok));
ok("2000 Passwort-Codes: alle verschieden, 4×4 Zeichen, werden von der Prüfung akzeptiert", reset.size === 2000 && [...reset].every((x) => /^([A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/.test(x) && v.normalizeResetCode(x).ok));
const h = c.hashCode("K7QM4XHD9WPA2NTC");
ok("Fingerabdruck: SHA-256 als 64 Hex-Zeichen, stabil, abhängig vom Code", h === createHash("sha256").update("K7QM4XHD9WPA2NTC").digest("hex") && /^[0-9a-f]{64}$/.test(h) && c.hashCode("K7QM4XHD9WPA2NTC") === h && c.hashCode("K7QM4XHD9WPA2NTD") !== h);
ok("Der Fingerabdruck enthält den Code nicht", !h.includes("K7QM") && !h.toLowerCase().includes("k7qm4xhd"));
ok("Schreibweise des Links ändert den Fingerabdruck nicht (erst normalisieren, dann hashen)", c.hashCode(v.normalizeResetCode("k7qm-4xhd-9wpa-2ntc").value) === h);
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);

process.exit(fails === 0 ? 0 : 1);
