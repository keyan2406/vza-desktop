// Führt alle Prüfungen in diesem Ordner aus (npm test). Jede Datei *.test.mjs ist ein eigenes Programm:
// Sie meldet "OK" oder "FEHLER" je Prüfung und beendet sich mit Fehlercode, wenn etwas nicht stimmt.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort();
let total = 0;
let failedFiles = 0;

for (const f of files) {
  const r = spawnSync(process.execPath, ["--import", "tsx", dir + f], { encoding: "utf8", timeout: 120_000 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const ok = (out.match(/^OK /gm) ?? []).length;
  const bad = (out.match(/^FEHLER/gm) ?? []).length;
  total += ok;
  const good = r.status === 0 && bad === 0;
  if (!good) failedFiles++;
  console.log(`${good ? "✓" : "✕"} ${f.replace(".test.mjs", "").padEnd(18)} ${String(ok).padStart(4)} Prüfungen${bad ? `, ${bad} FEHLER` : ""}`);
  if (!good) console.log(out.split("\n").filter((l) => /^FEHLER|Error|error/.test(l)).slice(0, 8).join("\n"));
}
console.log(`\n${total} Prüfungen in ${files.length} Dateien, ${failedFiles === 0 ? "alle bestanden" : failedFiles + " Datei(en) mit Fehlern"}`);
process.exit(failedFiles === 0 ? 0 : 1);
