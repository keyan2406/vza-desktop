"use client";

import { useState } from "react";

const TYPICAL = "C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE";

function CopyPath({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="hud-btn-ghost hud-btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Kopiert" : label}
    </button>
  );
}

// Schritt für Schritt, wenn der Browser den Spielordner sperrt (zum Beispiel unter C:\Program Files)
export default function ImportHelp({ open, onToggle, onHelper }: { open: boolean; onToggle: (open: boolean) => void; onHelper?: () => void }) {
  return (
    <details open={open} onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)} className="max-w-3xl border border-hud-line-strong">
      <summary className="cursor-pointer px-4 py-3 font-display text-sm font-semibold uppercase tracking-wider text-hud-amber">
        Ordner gesperrt oder lässt sich nicht öffnen? So geht es trotzdem
      </summary>
      <div className="space-y-5 border-t border-hud-line px-4 py-4 text-sm">
        <p className="text-hud-muted">
          Chrome und Edge sperren Systemordner wie <code className="text-hud-text">C:\Program Files</code>. Dort liegt Star Citizen
          normalerweise. Das betrifft nur die Ordner-Auswahl. Die folgenden Wege umgehen die Sperre.
        </p>

        <div>
          <p className="font-display text-base font-semibold tracking-wide">Weg 1: „Dateien auswählen“ (zwei Durchgänge)</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              Klicke auf <strong>„Dateien auswählen“</strong>. Es öffnet sich das normale Windows-Fenster.
            </li>
            <li>
              Klicke oben in die <strong>Adressleiste</strong> des Fensters (über der Dateiliste), füge diesen Pfad ein und drücke Enter:{" "}
              <code className="break-all text-hud-text">{TYPICAL}</code> <CopyPath text={TYPICAL} label="Pfad kopieren" />
            </li>
            <li>
              Klicke die Datei <strong>Game.log</strong> an und dann auf <strong>Öffnen</strong>. Die Seite liest sie und trägt ein.
            </li>
            <li>
              Klicke noch einmal auf „Dateien auswählen“, gib in der Adressleiste <code className="text-hud-text">…\LIVE\logbackups</code> ein,
              drücke <strong>Strg+A</strong> (alles markieren) und dann <strong>Öffnen</strong>. Das sind die älteren Sitzungen.
            </li>
          </ol>
          <p className="mt-2 text-hud-muted">Nichts wird doppelt eingetragen, du kannst es beliebig oft wiederholen.</p>
        </div>

        <div>
          <p className="font-display text-base font-semibold tracking-wide">Weg 2: Ordner auf das Feld ziehen</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              Öffne den Windows-Explorer und gehe zu <code className="text-hud-text">…\Roberts Space Industries\StarCitizen</code>.
            </li>
            <li>
              Ziehe den ganzen Ordner <strong>LIVE</strong> mit gedrückter linker Maustaste auf das gestrichelte Feld auf dieser Seite und lass los.
              Die Seite findet Game.log und logbackups selbst.
            </li>
          </ol>
        </div>

        <div>
          <p className="font-display text-base font-semibold tracking-wide">Du weißt nicht, wo dein Spiel liegt?</p>
          <p className="mt-1">
            Im RSI Launcher findest du den Installationsordner in den Einstellungen (Zahnrad). Er liegt je nach Laufwerk zum Beispiel unter{" "}
            <code className="text-hud-text">D:\Games\StarCitizen</code>. In diesem Ordner ist <strong>LIVE</strong> der richtige.
          </p>
        </div>

        <div className="border-t border-hud-line pt-4">
          <p className="font-display text-base font-semibold tracking-wide">Weg 3: PC-Helfer (am einfachsten, auch dauerhaft)</p>
          <p className="mt-1">
            Ein kleines Programm für Windows liest die Logs direkt und braucht keine Ordner-Freigabe im Browser. Es läuft auch bei laufendem Spiel
            und trägt neue Blaupausen automatisch ein.
          </p>
          {onHelper && (
            <button type="button" className="hud-btn hud-btn-sm mt-3" onClick={onHelper}>
              PC-Helfer öffnen
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
