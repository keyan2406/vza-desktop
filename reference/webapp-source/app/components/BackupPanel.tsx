"use client";

import { useState, useSyncExternalStore } from "react";

const KEY = "vza-last-backup";
const DAY = 24 * 3600 * 1000;

// Der Zeitpunkt der letzten Sicherung wird nur in diesem Browser gemerkt, als Erinnerung
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("vza-backup", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("vza-backup", cb);
  };
};
const snapshot = () => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export default function BackupPanel() {
  const last = useSyncExternalStore(subscribe, snapshot, () => null);
  const [now] = useState(() => Date.now());
  const days = last ? Math.floor((now - Number(last)) / DAY) : null;
  const old = last === null || (days !== null && days >= 30);

  return (
    <div className="hud-panel max-w-2xl space-y-3 p-5">
      <p className="font-display text-lg font-semibold tracking-wide">Datensicherung</p>
      <p className="text-sm text-hud-muted">
        Lädt alle wichtigen Daten (Mitglieder, Operationen, Lager, Kassenbuch, Blaupausen, Anfragen) als eine Datei herunter. Der kostenlose
        Supabase-Tarif legt keine herunterladbaren Backups an. Mache das am besten einmal im Monat und hebe die Datei an einem sicheren Ort auf.
        Sie enthält persönliche Daten, gib sie nicht weiter.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <a
          href="/api/export"
          download
          className="hud-btn hud-btn-sm"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, String(Date.now()));
              window.dispatchEvent(new Event("vza-backup"));
            } catch {
              // Die Erinnerung ist nur eine Zugabe
            }
          }}
        >
          Sicherung herunterladen
        </a>
        <p role="status" className={`text-sm ${old ? "text-hud-amber" : "text-hud-muted"}`}>
          {last === null ? "In diesem Browser wurde noch keine Sicherung geladen." : days === 0 ? "Letzte Sicherung: heute." : `Letzte Sicherung: vor ${days} ${days === 1 ? "Tag" : "Tagen"}.`}
        </p>
      </div>
    </div>
  );
}
