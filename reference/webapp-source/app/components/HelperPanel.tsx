"use client";

import { useState, useTransition } from "react";
import { revokeImportHelper } from "../(app)/blueprints/helper-actions";

export type HelperStatus = { created_at: string; last_used_at: string | null; use_count: number } | null;

const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const FILENAME = "VZA-Blaupausen-Helfer.cmd";

export default function HelperPanel({ status }: { status: HelperStatus }) {
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [revoking, startRevoke] = useTransition();

  async function download() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/import/helper", { method: "POST", credentials: "same-origin" });
      if (!res.ok) {
        setError((await res.text()).slice(0, 200) || "Das hat nicht geklappt. Bitte versuche es noch einmal.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = FILENAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDownloaded(true);
      setRevoked(false);
    } catch {
      setError("Keine Verbindung zur Seite. Bitte versuche es noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  const hasKey = (!!status || downloaded) && !revoked;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-hud-muted">
        Der PC-Helfer ist ein kleines Programm für <strong className="text-hud-text">Windows</strong>. Er liest deine Spielprotokolle direkt von der
        Festplatte, auch aus <code className="text-hud-text">C:\Program Files</code>, wo der Browser sperrt, und trägt neue Blaupausen automatisch
        ein, solange sein Fenster offen ist. Er braucht keine Installation.
      </p>

      <ol className="max-w-3xl space-y-5">
        <li className="flex gap-4">
          <span aria-hidden className="font-display text-2xl font-bold text-hud-accent">1</span>
          <div className="space-y-2">
            <p className="font-medium">Helfer herunterladen</p>
            <button onClick={download} disabled={busy} className="hud-btn">
              {busy ? "Erstelle …" : hasKey ? "Neu herunterladen" : `${FILENAME} herunterladen`}
            </button>
            <p className="text-sm text-hud-muted">
              Die Datei enthält deinen persönlichen Schlüssel. Gib sie nicht weiter. Lädst du sie neu herunter, wird die alte ungültig.
            </p>
            {downloaded && (
              <p role="status" className="text-sm text-hud-accent">
                Heruntergeladen. Du findest die Datei im Ordner „Downloads“.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-hud-danger">
                {error}
              </p>
            )}
          </div>
        </li>

        <li className="flex gap-4">
          <span aria-hidden className="font-display text-2xl font-bold text-hud-accent">2</span>
          <div className="space-y-2">
            <p className="font-medium">Datei doppelklicken</p>
            <p className="text-sm text-hud-muted">Es öffnet sich ein schwarzes Fenster. Der Helfer sucht dein Spiel selbst und trägt alles ein, was in den Logs steht.</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-hud-amber">Chrome oder Windows warnt mich</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-hud-muted">
                <li>
                  <strong className="text-hud-text">Chrome/Edge beim Download</strong> („Diese Datei kann schädlich sein“): auf „Behalten“ bzw. „Trotzdem
                  behalten“ klicken. Das kommt bei jeder Skript-Datei.
                </li>
                <li>
                  <strong className="text-hud-text">Windows beim Öffnen</strong> („Der Computer wurde durch Windows geschützt“): auf „Weitere Informationen“
                  und dann „Trotzdem ausführen“ klicken. Die Datei ist nicht digital signiert, deshalb fragt Windows nach.
                </li>
                <li>Du kannst die Datei vorher mit Rechtsklick → „Bearbeiten“ im Editor ansehen. Der ganze Programmtext steht lesbar darin.</li>
              </ul>
            </details>
          </div>
        </li>

        <li className="flex gap-4">
          <span aria-hidden className="font-display text-2xl font-bold text-hud-accent">3</span>
          <div className="space-y-2">
            <p className="font-medium">Fenster offen lassen</p>
            <p className="text-sm text-hud-muted">
              Danach sieht der Helfer alle 30 Sekunden nach und trägt neue Blaupausen sofort ein („Neue Blaupause: …“). Fenster schließen = Helfer aus.
              Beim nächsten Spielen einfach die Datei wieder doppelklicken.
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer text-hud-amber">Soll er mit Windows automatisch starten?</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-hud-muted">
                <li>
                  Drücke <strong className="text-hud-text">Windows-Taste + R</strong>, tippe <code className="text-hud-text">shell:startup</code> und drücke Enter.
                </li>
                <li>Ziehe die Datei (mit gedrückter <strong className="text-hud-text">Alt-Taste</strong> für eine Verknüpfung) in den Ordner, der sich öffnet.</li>
                <li>Beim nächsten Windows-Start öffnet sich das Fenster von selbst. Es kann minimiert bleiben.</li>
              </ol>
            </details>
          </div>
        </li>
      </ol>

      {status && !revoked && (
        <div role="status" className="max-w-3xl space-y-1 border border-hud-line-strong p-4 text-sm">
          <p>
            Schlüssel erstellt: <span className="text-hud-text">{when.format(new Date(status.created_at))} Uhr</span>
          </p>
          <p>
            Zuletzt vom Helfer benutzt:{" "}
            <span className="text-hud-text">
              {status.last_used_at ? `${when.format(new Date(status.last_used_at))} Uhr (${status.use_count}× eingetragen)` : "noch nie"}
            </span>
          </p>
        </div>
      )}
      {revoked && (
        <p role="status" className="text-sm text-hud-accent">
          Der Schlüssel ist widerrufen. Die heruntergeladene Datei trägt nichts mehr ein.
        </p>
      )}

      <details className="max-w-3xl text-sm">
        <summary className="cursor-pointer font-medium text-hud-amber">Was macht der Helfer genau, und ist das sicher?</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-hud-muted">
          <li>Er liest nur deine Star-Citizen-Logs (<code>Game.log</code> und <code>logbackups</code>) und sucht die Zeilen „Blaupause erhalten“.</li>
          <li>Übertragen werden <strong className="text-hud-text">nur die Namen der Blaupausen und der Zeitpunkt</strong>, verschlüsselt an diese Seite. Die Log-Dateien selbst verlassen deinen PC nicht.</li>
          <li>Der Schlüssel darf ausschließlich Blaupausen in deine eigene Sammlung eintragen, sonst nichts. Hier siehst du, wann er zuletzt benutzt wurde.</li>
          <li>Der Helfer ändert nichts am Spiel und an keiner Datei. Er merkt sich nur deinen Spielordner (unter <code>%LOCALAPPDATA%\VZA-Helfer</code>).</li>
        </ul>
        {hasKey && (
          <div className="mt-3">
            <button
              disabled={revoking}
              className="hud-btn-ghost hud-btn-sm"
              onClick={() => {
                if (!window.confirm("Schlüssel widerrufen? Die heruntergeladene Datei trägt danach nichts mehr ein.")) return;
                startRevoke(async () => {
                  const res = await revokeImportHelper();
                  if (res.error) setError(res.error);
                  else {
                    setRevoked(true);
                    setDownloaded(false);
                  }
                });
              }}
            >
              {revoking ? "Widerrufe …" : "Schlüssel widerrufen"}
            </button>
          </div>
        )}
      </details>

      <details className="max-w-3xl text-sm">
        <summary className="cursor-pointer font-medium text-hud-amber">Probleme?</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-hud-muted">
          <li>
            <strong className="text-hud-text">„Ich habe deinen Star-Citizen-Ordner nicht gefunden“:</strong> Der Helfer fragt dann nach dem Pfad. Öffne im Explorer den
            Ordner <code>StarCitizen\LIVE</code>, klicke in die Adressleiste, kopiere den Pfad (Strg+C) und füge ihn im schwarzen Fenster ein (Rechtsklick).
          </li>
          <li>
            <strong className="text-hud-text">„Der Schlüssel ist ungültig“:</strong> Du hast einen neueren Helfer heruntergeladen oder den Schlüssel widerrufen. Lade den Helfer neu herunter.
          </li>
          <li>
            <strong className="text-hud-text">„Die Seite ist nicht erreichbar“:</strong> Prüfe deine Internetverbindung. Der Helfer versucht es von selbst weiter.
          </li>
          <li>
            <strong className="text-hud-text">Nichts passiert nach dem Doppelklick:</strong> Rechtsklick auf die Datei → „Als Administrator ausführen“ ist nicht nötig. Prüfe, ob Windows die Datei gesperrt
            hat (Rechtsklick → Eigenschaften → unten „Zulassen“ ankreuzen).
          </li>
        </ul>
      </details>
    </div>
  );
}
