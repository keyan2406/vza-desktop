import { HELPER_PS } from "./helper-ps";
import { TOKEN_RE } from "./import-api";

const SITE_RE = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;
export const HELPER_FILENAME = "VZA-Blaupausen-Helfer.cmd";
export const HELPER_MARKER = "#<<PS>>";

// Die Datei ist ein Windows-Stapelprogramm (.cmd), das beim Doppelklick PowerShell startet und den Teil nach der Markierung ausführt.
// So geht es ohne Installation und ohne Einstellungen. Die Zeilenenden sind Windows-typisch (CRLF).
export function buildHelperScript(opts: { site: string; token: string }): string {
  const site = opts.site.trim().replace(/\/+$/, "");
  if (!SITE_RE.test(site)) throw new Error("Ungültige Adresse der Seite");
  if (!TOKEN_RE.test(opts.token)) throw new Error("Ungültiger Schlüssel");

  const header = [
    "@echo off",
    "setlocal",
    "title VZA Blaupausen-Helfer",
    "chcp 65001 >nul",
    'set "VZA_SELF=%~f0"',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $t = [IO.File]::ReadAllText($env:VZA_SELF, [Text.Encoding]::UTF8); $i = $t.LastIndexOf('${HELPER_MARKER}'); Invoke-Expression $t.Substring($i) }"`,
    "echo.",
    "echo Der Helfer wurde beendet. Du kannst dieses Fenster schliessen.",
    "pause >nul",
    "exit /b",
    HELPER_MARKER,
  ].join("\r\n");

  const ps = HELPER_PS.replace("@@SITE@@", site).replace("@@TOKEN@@", opts.token).replace(/\r?\n/g, "\r\n");
  return `${header}\r\n${ps}`;
}
