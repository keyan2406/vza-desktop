import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
import * as sh from "../utils/security-headers.ts";
const manifestModule = await import("../app/manifest.ts");
const manifest = typeof manifestModule.default === "function" ? manifestModule.default : manifestModule.default.default;
import fs from "node:fs";
import { createRequire } from "node:module"; const sharp = createRequire(ROOT + "/")("sharp");
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(c ? "OK   " : "FEHLER", n); };

const h = new Headers({ "x-eigene": "bleibt", "X-Frame-Options": "SAMEORIGIN" }); sh.applySecurityHeaders(h);
ok("alle Sicherheits-Kopfzeilen werden gesetzt", Object.keys(sh.SECURITY_HEADERS).every((k) => h.get(k) === sh.SECURITY_HEADERS[k]) && Object.keys(sh.SECURITY_HEADERS).length === 7);
ok("eine schwächere vorhandene Kopfzeile wird überschrieben, fremde bleiben", h.get("x-frame-options") === "DENY" && h.get("x-eigene") === "bleibt");
ok("doppelt anwenden ändert nichts", (() => { const before = [...h.entries()].join(); sh.applySecurityHeaders(h); return [...h.entries()].join() === before; })());
const csp = sh.SECURITY_HEADERS["Content-Security-Policy"];
ok("Schutz vor fremden Rahmen, Basisadressen und Plug-ins", csp.includes("frame-ancestors 'none'") && csp.includes("base-uri 'self'") && csp.includes("object-src 'none'"));
ok("bewusst KEIN script-src/default-src (würde die Seite lahmlegen) und kein form-action (würde Weiterleitungen blockieren)", !/script-src|default-src|form-action|style-src/.test(csp));
ok("HSTS ohne includeSubDomains (würde auch fremde Unterseiten der Domain betreffen)", sh.SECURITY_HEADERS["Strict-Transport-Security"] === "max-age=63072000");
ok("Kamera, Mikrofon, Standort, Zahlung, USB sind gesperrt", ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"].every((x) => sh.SECURITY_HEADERS["Permissions-Policy"].includes(x)));

const m = manifest();
ok("Manifest: Name, Kurzname, deutsche Sprache, eigenes Fenster", m.name && m.short_name && m.lang === "de" && m.display === "standalone");
ok("Manifest: Start auf dem Dashboard, Geltungsbereich die ganze Seite", m.start_url === "/dashboard" && m.scope === "/");
ok("Manifest: Farben passen zum dunklen Design", m.background_color === "#05090e" && m.theme_color === "#05090e");
ok("Manifest: Symbole 192, 512 und 'maskable' (für Android-Rundungen)", m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512" && i.purpose === "any") && m.icons.some((i) => i.purpose === "maskable"));
for (const i of m.icons) {
  const file = ROOT + "/public" + i.src; const meta = fs.existsSync(file) ? await sharp(file).metadata() : null;
  ok(`Symbol ${i.src}: Datei vorhanden, echte Größe ${i.sizes}, PNG`, !!meta && `${meta.width}x${meta.height}` === i.sizes && meta.format === "png");
}
ok("Symbole sind klein genug (zusammen unter 200 KB)", m.icons.reduce((n, i) => n + fs.statSync(ROOT + "/public" + i.src).size, 0) < 200 * 1024);
const apple = await sharp(ROOT + "/app/apple-icon.png").metadata(); ok("Apple-Symbol 180x180", apple.width === 180 && apple.height === 180);
ok("Verknüpfungen zeigen auf echte Seiten", m.shortcuts.every((s) => fs.existsSync(ROOT + "/app/(app)" + s.url)) && m.shortcuts.length === 3);
ok("Proxy lässt Manifest, Bilder und robots.txt aus (spart Rechenzeit)", /manifest\.webmanifest/.test(fs.readFileSync(ROOT + "/proxy.ts", "utf8")) && /api\/import\/blueprints/.test(fs.readFileSync(ROOT + "/proxy.ts", "utf8")));
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
