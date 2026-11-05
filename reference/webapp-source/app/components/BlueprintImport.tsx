"use client";

import { useRef, useState, useTransition } from "react";
import { importBlueprints, type ImportItem, type ImportResult } from "../(app)/blueprints/actions";

const MAX_BYTES = 5 * 1024 * 1024;

// Liest die JSON-Datei aus dem SC Desktop Launcher (Export "Erspielte als JSON").
function parseLauncherFile(text: string): { items: ImportItem[]; ignoredMarks: number } {
  const data = JSON.parse(text.replace(/^\uFEFF/, ""));
  const list: unknown = Array.isArray(data) ? data : data?.blueprints;
  if (!Array.isArray(list)) throw new Error("Format");

  const items: ImportItem[] = [];
  let ignoredMarks = 0;
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    const entry = e as Record<string, unknown>;
    if (typeof entry.key !== "string" || entry.key.trim() === "") continue;
    // Nur erspielte Baupläne zählen. "Vorgemerkte" sind nur eine Merkliste.
    if (entry.isDone !== true) {
      if (entry.isMarked === true) ignoredMarks++;
      continue;
    }
    items.push({
      name: entry.key.trim(),
      ini: typeof entry.ini === "string" ? entry.ini : null,
      at: typeof entry.atTime === "string" ? entry.atTime : null,
    });
  }
  return { items, ignoredMarks };
}

export default function BlueprintImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [ignoredMarks, setIgnoredMarks] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    setError(null);
    setItems([]);
    setFileName(null);
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setError("Die Datei ist zu groß (maximal 5 MB).");
      return;
    }
    try {
      const parsed = parseLauncherFile(await file.text());
      if (parsed.items.length === 0) {
        setError("In der Datei wurden keine erspielten Blaupausen gefunden.");
        return;
      }
      if (parsed.items.length > 2000) {
        setError("Die Datei enthält mehr als 2000 Einträge. Bitte teile sie auf.");
        return;
      }
      setFileName(file.name);
      setItems(parsed.items);
      setIgnoredMarks(parsed.ignoredMarks);
    } catch {
      setError(
        "Diese Datei konnte nicht gelesen werden. Bitte nimm die JSON-Datei aus dem Launcher (Export „Erspielte als JSON“)."
      );
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await importBlueprints(items);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res.result);
      setItems([]);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="hud-panel max-w-2xl space-y-4 p-5">
      <div>
        <label htmlFor="bp-file" className="hud-label mb-1">
          JSON-Datei aus dem SC Desktop Launcher
        </label>
        <input
          ref={inputRef}
          id="bp-file"
          type="file"
          accept=".json,application/json"
          onChange={onFile}
          className="block w-full text-sm text-hud-muted file:mr-4 file:cursor-pointer file:border file:border-hud-accent file:bg-hud-accent/10 file:px-4 file:py-2 file:font-display file:text-sm file:font-semibold file:uppercase file:tracking-wider file:text-hud-accent"
        />
        <p className="mt-2 text-sm text-hud-muted">
          Im Launcher oder auf der Baupläne-Datenbank: Export → „Erspielte als
          JSON“. Es werden nur neue Einträge ergänzt, nichts wird überschrieben.
        </p>
      </div>

      {items.length > 0 && (
        <div role="status">
          <p>
            <span className="font-display text-xl font-bold text-hud-accent">
              {items.length}
            </span>{" "}
            erspielte Blaupausen in <span className="text-hud-muted">{fileName}</span> erkannt.
            {ignoredMarks > 0 && (
              <span className="text-hud-muted"> {ignoredMarks} Vorgemerkte werden ignoriert.</span>
            )}
          </p>
          <button onClick={submit} disabled={pending} className="hud-btn mt-3">
            {pending ? "Importiere …" : "Jetzt importieren"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-hud-danger">
          {error}
        </p>
      )}

      {result && (
        <div role="status" className="border border-hud-accent/50 bg-hud-accent/5 p-4">
          <p className="font-display text-lg font-semibold uppercase tracking-wider text-hud-accent">
            Import abgeschlossen
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>{result.added} neu in deiner Sammlung</li>
            <li>{result.already_owned} hattest du schon</li>
            {result.new_in_catalog > 0 && (
              <li>{result.new_in_catalog} davon neu im Org-Katalog</li>
            )}
            {result.skipped > 0 && (
              <li className="text-hud-muted">
                {result.skipped} übersprungen (Doppelte oder keine Blaupausen, z. B. Personennamen aus dem Log)
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
