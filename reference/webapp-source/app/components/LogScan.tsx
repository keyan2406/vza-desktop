"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createScanner, scanBlob, type Found, type Scanner } from "../../utils/log-scan";
import { liveChecks, type Perm } from "../../utils/import-checks";
import { importBlueprints, type ImportResult } from "../(app)/blueprints/actions";
import { collectLogFiles, type Dropped, type FsEntry } from "../../utils/drop-files";
import { explainFolderError, explainReadError } from "../../utils/import-errors";
import ImportHelp from "./ImportHelp";

// ---------- Ordner-Zugriff merken (IndexedDB), damit man ihn nur einmal auswählen muss ----------

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: "read" }) => Promise<Perm>;
  requestPermission?: (o: { mode: "read" }) => Promise<Perm>;
};
type Entry = { kind: "file" | "directory"; name: string };
type LogFile = { label: string; handle: FileSystemFileHandle; current: boolean };

const DB = "vza-log";
const STORE = "handles";
const KEY = "sc-folder";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(): Promise<DirHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve((r.result as DirHandle) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function idbSet(h: DirHandle | null) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      if (h) tx.objectStore(STORE).put(h, KEY);
      else tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Merken ist nur eine Bequemlichkeit
  }
}

const entries = (d: FileSystemDirectoryHandle) =>
  (d as unknown as { values(): AsyncIterable<FileSystemHandle & Entry> }).values();

// Sucht Game.log und die gesicherten Logs (logbackups), auch wenn man den Ordner StarCitizen oder LIVE gewählt hat.
async function listLogFiles(root: FileSystemDirectoryHandle): Promise<LogFile[]> {
  const out: LogFile[] = [];
  async function walk(dir: FileSystemDirectoryHandle, depth: number, label: string) {
    for await (const e of entries(dir)) {
      if (e.kind === "file" && /\.log$/i.test(e.name)) {
        out.push({
          label: label + e.name,
          handle: e as unknown as FileSystemFileHandle,
          current: e.name.toLowerCase() === "game.log",
        });
      } else if (e.kind === "directory" && depth < 2 && /^(logbackups|live|ptu|eptu|hotfix)$/i.test(e.name)) {
        await walk(e as unknown as FileSystemDirectoryHandle, depth + 1, `${label}${e.name}/`);
      }
    }
  }
  await walk(root, 0, "");
  return out;
}

async function permissionOf(h: DirHandle | null): Promise<Perm> {
  if (!h) return "unknown";
  try {
    return (await h.queryPermission?.({ mode: "read" })) ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function ensureRead(h: DirHandle, ask: boolean) {
  if ((await permissionOf(h)) === "granted") return true;
  if (!ask) return false;
  return (await h.requestPermission?.({ mode: "read" })) === "granted";
}

// ---------- Kleine Bausteine ----------

const ICON = { ok: "✓", todo: "○", fail: "✕", unknown: "…" } as const;
const ICON_COLOR = { ok: "text-hud-accent", todo: "text-hud-muted", fail: "text-hud-danger", unknown: "text-hud-muted" } as const;

function ResultBox({ result, found, files }: { result: ImportResult; found: number; files: number }) {
  return (
    <div role="status" className="border border-hud-accent/50 bg-hud-accent/5 p-4">
      <p className="font-display text-lg font-semibold uppercase tracking-wider text-hud-accent">Eingetragen</p>
      <ul className="mt-2 space-y-1 text-sm">
        <li>
          {found} {found === 1 ? "Blaupause" : "Blaupausen"} in {files} {files === 1 ? "Datei" : "Dateien"} gefunden
        </li>
        <li>{result.added} neu in deiner Sammlung</li>
        <li>{result.already_owned} hattest du schon</li>
        {result.new_in_catalog > 0 && <li>{result.new_in_catalog} davon neu im Org-Katalog</li>}
      </ul>
    </div>
  );
}

const NONE_FOUND =
  "Es wurde keine erhaltene Blaupause gefunden. Die Spiel-Logs enthalten nur die letzten Spielsitzungen. Ältere Blaupausen holst du mit der Launcher-Datei.";

export type ImportMode = "live" | "once";

export default function LogImport({ mode, onSwitch }: { mode: ImportMode; onSwitch?: (m: "once" | "helper") => void }) {
  // Kann der Browser einen Ordner dauerhaft lesen? Auf dem Server unbekannt (null), im Browser sofort richtig.
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function",
    () => null
  );
  const [handle, setHandle] = useState<DirHandle | null>(null);
  const [permission, setPermission] = useState<Perm>("unknown");
  const [phase, setPhase] = useState<"idle" | "scanning" | "importing">("idle");
  const [progress, setProgress] = useState<{ file: string; pct: number } | null>(null);
  const [outcome, setOutcome] = useState<{ result: ImportResult; found: number; files: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const stop = useRef({ aborted: false });
  const known = useRef<Set<string>>(new Set());
  const liveRef = useRef<{ file: LogFile; offset: number; scanner: Scanner } | null>(null);

  useEffect(() => {
    idbGet().then(async (h) => {
      if (h) {
        setHandle(h);
        setPermission(await permissionOf(h));
      }
    });
  }, []);

  useEffect(() => () => void (stop.current.aborted = true), []);

  // ---------- Dateien lesen ----------

  const scanFiles = useCallback(async (files: { label: string; read: () => Promise<File> }[]) => {
    stop.current = { aborted: false };
    setPhase("scanning");
    setError(null);
    setNotice(null);
    setOutcome(null);
    const scanner = createScanner();
    try {
      const blobs: { label: string; file: File }[] = [];
      for (const f of files) blobs.push({ label: f.label, file: await f.read() });
      const total = blobs.reduce((n, b) => n + b.file.size, 0) || 1;
      let done = 0;
      for (const b of blobs) {
        const ok = await scanBlob(b.file, scanner, {
          signal: stop.current,
          onProgress: (read) => setProgress({ file: b.label, pct: Math.min(100, Math.round(((done + read) / total) * 100)) }),
        });
        if (!ok) return null;
        done += b.file.size;
      }
      return { found: scanner.finish(), files: blobs.length };
    } catch (e) {
      setError(explainReadError((e as { name?: string })?.name));
      setHelpOpen(true);
      return null;
    } finally {
      setProgress(null);
    }
  }, []);

  // ---------- Eintragen ----------

  async function submit(items: Found[]) {
    const res = await importBlueprints(items.map((f) => ({ name: f.name, ini: null, at: f.at })));
    if (res.error) {
      setError(res.error);
      return null;
    }
    for (const f of items) known.current.add(f.name.toLowerCase());
    return res.result;
  }

  // Lesen und sofort eintragen: der "Ein Klick"-Weg
  async function scanAndImport(files: { label: string; read: () => Promise<File> }[]) {
    const scanned = await scanFiles(files);
    if (!scanned) {
      setPhase("idle");
      return;
    }
    if (scanned.found.length === 0) {
      setNotice(NONE_FOUND);
      setPhase("idle");
      return;
    }
    setPhase("importing");
    const result = await submit(scanned.found);
    setPhase("idle");
    if (result) setOutcome({ result, found: scanned.found.length, files: scanned.files });
  }

  // ---------- Ordner verbinden ----------

  async function pickFolder(): Promise<DirHandle | null> {
    try {
      const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
      const h = await picker({ id: "sc-live", mode: "read" });
      setHandle(h);
      setPermission(await permissionOf(h));
      await idbSet(h);
      return h;
    } catch (e) {
      const text = explainFolderError((e as { name?: string })?.name);
      if (text) {
        setError(text);
        setHelpOpen(true);
      }
      return null;
    }
  }

  async function forgetFolder() {
    stopLive();
    setHandle(null);
    setPermission("unknown");
    await idbSet(null);
  }

  async function filesOf(h: DirHandle) {
    if (!(await ensureRead(h, true))) {
      setPermission(await permissionOf(h));
      setError("Ohne Erlaubnis kann ich den Ordner nicht lesen.");
      return null;
    }
    setPermission("granted");
    const files = await listLogFiles(h);
    if (files.length === 0) {
      setError("In diesem Ordner habe ich keine .log-Dateien gefunden. Wähle den Ordner StarCitizen\\LIVE.");
      return null;
    }
    return files;
  }

  // ---------- Einmal auslesen ----------

  async function onceFromFolder() {
    setError(null);
    const h = handle ?? (await pickFolder());
    if (!h) return;
    const files = await filesOf(h);
    if (!files) return;
    await scanAndImport(files.map((f) => ({ label: f.label, read: () => f.handle.getFile() })));
  }

  // Dateien oder Ordner, die aus dem Explorer auf das Feld gezogen werden (umgeht die Ordner-Sperre des Browsers)
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dt = e.dataTransfer;
    if (!dt || busy) return;
    // Die Einträge müssen sofort, noch vor jedem await, gelesen werden
    const entries = [...(dt.items ?? [])]
      .map((i) => ((i as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.() ?? null) as FsEntry | null)
      .filter((x): x is FsEntry => x !== null);
    const plain = [...(dt.files ?? [])];
    let files: Dropped[] = [];
    if (entries.length) files = await collectLogFiles(entries);
    else files = plain.filter((f) => /\.(log|txt)$/i.test(f.name)).map((f) => ({ label: f.name, read: async () => f }));
    if (files.length === 0) {
      setError("In dem, was du abgelegt hast, habe ich keine .log-Dateien gefunden. Ziehe den Ordner LIVE oder die Dateien Game.log und logbackups auf das Feld.");
      setHelpOpen(true);
      return;
    }
    await scanAndImport(files);
  }

  function onPickedFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = [...list].filter((f) => /\.(log|txt)$/i.test(f.name));
    if (files.length === 0) {
      setError("Bitte wähle .log-Dateien (Game.log oder die Dateien im Ordner logbackups).");
      return;
    }
    void scanAndImport(files.map((f) => ({ label: f.name, read: async () => f })));
  }

  // ---------- Live-Überwachung der aktuellen Game.log ----------

  function stopLive() {
    setLive(false);
    liveRef.current = null;
  }

  async function startLive() {
    setError(null);
    setNotice(null);
    const h = handle ?? (await pickFolder());
    if (!h) return;
    const files = await filesOf(h);
    if (!files) return;
    const current = files.find((f) => f.current);
    if (!current) {
      setError("Die aktuelle Game.log wurde nicht gefunden. Wähle den Ordner StarCitizen\\LIVE.");
      return;
    }
    // Alles bisher Gelesene zuerst eintragen, danach nur noch Neues
    setPhase("scanning");
    const scanner = createScanner();
    try {
      const file = await current.handle.getFile();
      await scanBlob(file, scanner);
      const first = scanner.snapshot();
      setPhase("importing");
      const r = first.length ? await submit(first) : null;
      liveRef.current = { file: current, offset: file.size, scanner };
      setLive(true);
      setEvents([
        r
          ? `Überwachung gestartet. ${first.length} Blaupausen in der aktuellen Game.log gefunden, ${r.added} davon neu für dich.`
          : "Überwachung gestartet. In der aktuellen Game.log steht noch keine Blaupause.",
      ]);
      setLastCheck(new Date().toLocaleTimeString("de-DE"));
    } catch (e) {
      setError(explainReadError((e as { name?: string })?.name));
    } finally {
      setPhase("idle");
    }
  }

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      const st = liveRef.current;
      if (!st) return;
      try {
        const file = await st.file.handle.getFile();
        setLastCheck(new Date().toLocaleTimeString("de-DE"));
        if (file.size < st.offset) {
          // Neue Spielsitzung: die Datei wurde neu angelegt
          st.offset = 0;
          st.scanner = createScanner();
        }
        if (file.size === st.offset) return;
        await scanBlob(file.slice(st.offset), st.scanner);
        st.offset = file.size;
        const fresh = st.scanner.snapshot().filter((f) => !known.current.has(f.name.toLowerCase()));
        if (fresh.length === 0) return;
        const r = await submit(fresh);
        if (r) {
          const time = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
          setEvents((ev) => [...fresh.map((f) => `${time} Uhr: neue Blaupause „${f.name}“`), ...ev].slice(0, 6));
        }
      } catch {
        // Datei gerade gesperrt oder weg: beim nächsten Durchlauf erneut versuchen
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [live]);

  // ---------- Anzeige ----------

  if (supported === null) return null;
  const busy = phase !== "idle";

  const progressBox = phase === "scanning" && progress && (
    <div role="status" aria-live="polite">
      <p className="text-sm">
        Lese <span className="text-hud-accent">{progress.file}</span> … {progress.pct} %
      </p>
      <div className="mt-2 h-2 bg-hud-line" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-hud-accent transition-[width] duration-200" style={{ width: `${progress.pct}%` }} />
      </div>
      <button onClick={() => (stop.current.aborted = true)} className="mt-3 text-sm text-hud-muted underline hover:text-hud-text">
        Abbrechen
      </button>
    </div>
  );
  const importingBox = phase === "importing" && <p role="status" className="text-sm text-hud-accent">Trage ein …</p>;
  const errorBox = error && (
    <p role="alert" className="text-hud-danger">
      {error}
    </p>
  );

  // ================= Live-Update =================
  if (mode === "live") {
    const env = { supported, connected: !!handle, permission, live };
    const checks = liveChecks(env);
    return (
      <div className="space-y-5">
        <div className="border border-hud-amber/50 bg-hud-amber/5 p-4 text-sm">
          <p className="font-display font-semibold uppercase tracking-wider text-hud-amber">Das klappt nur unter diesen Bedingungen</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-hud-text">
            <li>Du nutzt <strong>Chrome oder Edge am Computer</strong>. Firefox, Safari und Handys gehen nicht.</li>
            <li>Diese Seite bleibt <strong>in einem Tab offen</strong>, und der Computer ist an. Ohne offene Seite wird nichts mitgelesen.</li>
            <li>Du hast den Spielordner <strong>einmal verbunden</strong> und dem Browser das Lesen erlaubt. Nach einem Browser-Neustart fragt er einmal erneut.</li>
            <li>
              Der Browser lässt den Ordner zu. Systemordner sind gesperrt, zum Beispiel unter <code>C:\Program Files</code> (der Browser
              meldet dann „Ordner enthält Systemdateien“). Dann nimm den <strong>PC-Helfer</strong>: Er liest auch dort und läuft dauerhaft mit.
            </li>
            <li>Liegt der Tab im Hintergrund, bremst der Browser: Neues erscheint dann nach etwa einer Minute statt nach 30 Sekunden.</li>
          </ul>
        </div>

        <div>
          <p className="hud-label mb-2">Voraussetzungen bei dir</p>
          <ul className="space-y-1.5 text-sm">
            {checks.map((c) => (
              <li key={c.id}>
                <span className="flex items-start gap-2">
                  <span aria-hidden className={`w-4 shrink-0 text-center font-bold ${ICON_COLOR[c.state]}`}>{ICON[c.state]}</span>
                  <span>
                    {c.label}
                    <span className="sr-only">: {c.state === "ok" ? "erfüllt" : c.state === "fail" ? "nicht möglich" : "offen"}</span>
                  </span>
                </span>
                {c.hint && c.state !== "ok" && <span className="ml-6 block text-hud-muted">{c.hint}</span>}
              </li>
            ))}
          </ul>
        </div>

        {supported === false ? (
          <div className="flex flex-wrap gap-3">
            <button onClick={() => onSwitch?.("helper")} className="hud-btn">
              PC-Helfer öffnen
            </button>
            <button onClick={() => onSwitch?.("once")} className="hud-btn-ghost">
              Stattdessen „Einmal auslesen“ öffnen
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {!live ? (
              <button onClick={startLive} disabled={busy} className="hud-btn">
                {handle ? "Live-Überwachung starten" : "Spielordner verbinden und starten"}
              </button>
            ) : (
              <button onClick={stopLive} className="hud-btn-ghost">
                Überwachung beenden
              </button>
            )}
            {handle && (
              <button onClick={forgetFolder} className="text-sm text-hud-muted underline hover:text-hud-text">
                Anderen Ordner wählen
              </button>
            )}
          </div>
        )}

        {live && (
          <div role="status" aria-live="polite" className="space-y-2 border border-hud-accent/50 bg-hud-accent/5 p-3 text-sm">
            <p className="text-hud-accent">
              Überwachung läuft{lastCheck ? ` · letzte Prüfung ${lastCheck} Uhr` : ""}. Alle 30 Sekunden wird nachgesehen.
            </p>
            <ul className="space-y-1">
              {events.map((e, i) => (
                <li key={i} className={i === 0 ? "text-hud-text" : "text-hud-muted"}>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
        {progressBox}
        {importingBox}
        {errorBox}
        {error && (
          <button onClick={() => onSwitch?.("helper")} className="hud-btn-ghost hud-btn-sm">
            Stattdessen den PC-Helfer benutzen
          </button>
        )}
      </div>
    );
  }

  // ================= Einmal auslesen =================
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-hud-muted">
        Ein Klick, und die Seite liest deine <code className="text-hud-text">Game.log</code> samt gesicherter Logs und trägt
        alles ein, was darin steht. Das funktioniert wie das Auslesen im SC Desktop Launcher. Die Dateien bleiben auf deinem
        Rechner, es gehen nur die Namen der Blaupausen an die Seite.
      </p>

      {supported && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={onceFromFolder} disabled={busy} className="hud-btn">
              {handle ? "Jetzt auslesen" : "Spielordner wählen und auslesen"}
            </button>
            {handle && (
              <button onClick={forgetFolder} className="text-sm text-hud-muted underline hover:text-hud-text">
                Anderen Ordner wählen
              </button>
            )}
          </div>
          <p className="max-w-2xl text-sm text-hud-muted">
            Wähle den Ordner <code className="text-hud-text">StarCitizen\LIVE</code>. Die Seite merkt ihn sich. Beim
            nächsten Mal genügt der Klick auf „Jetzt auslesen“. Chrome und Edge.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="log-files" className="hud-label mb-1">
          {supported ? "Oder Dateien auswählen (geht in jedem Browser)" : "Log-Dateien auswählen (geht in jedem Browser)"}
        </label>
        <input
          id="log-files"
          type="file"
          multiple
          accept=".log,.txt"
          disabled={busy}
          onChange={(e) => {
            onPickedFiles(e.target.files);
            e.target.value = "";
          }}
          className="block w-full text-sm text-hud-muted file:mr-4 file:cursor-pointer file:border file:border-hud-accent file:bg-hud-accent/10 file:px-4 file:py-2 file:font-display file:text-sm file:font-semibold file:uppercase file:tracking-wider file:text-hud-accent"
        />
        <p className="mt-1 max-w-2xl text-sm text-hud-muted">
          Markiere <code className="text-hud-text">Game.log</code> und die Dateien aus{" "}
          <code className="text-hud-text">StarCitizen\LIVE\logbackups</code> (mehrere gehen auf einmal). Das hilft auch, wenn
          der Browser deinen Spielordner sperrt, zum Beispiel unter <code>C:\Program Files</code>.
        </p>
      </div>

      <div
        role="region"
        aria-label="Dateien oder Ordner hier ablegen"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`max-w-2xl border-2 border-dashed p-6 text-center text-sm transition-colors ${
          dragging ? "border-hud-accent bg-hud-accent/10 text-hud-text" : "border-hud-line-strong text-hud-muted"
        }`}
      >
        <p className="font-display text-base font-semibold uppercase tracking-wider text-hud-text">Oder hierher ziehen</p>
        <p className="mt-1">
          Ziehe den Ordner <code className="text-hud-text">LIVE</code> (oder die Dateien <code className="text-hud-text">Game.log</code> und{" "}
          <code className="text-hud-text">logbackups</code>) aus dem Explorer auf dieses Feld. Das geht auch aus „Program Files“, wo der
          Browser die Ordner-Auswahl sperrt.
        </p>
      </div>

      <ImportHelp open={helpOpen} onToggle={setHelpOpen} onHelper={() => onSwitch?.("helper")} />

      {progressBox}
      {importingBox}
      {notice && <p role="status" className="max-w-2xl text-hud-amber">{notice}</p>}
      {outcome && <ResultBox {...outcome} />}
      {errorBox}
    </div>
  );
}
