"use client";

import { useState } from "react";
import BlueprintImport from "./BlueprintImport";
import HelperPanel, { type HelperStatus } from "./HelperPanel";
import LogImport from "./LogScan";

type Way = "helper" | "live" | "once" | "file";

const WAYS: { id: Way; title: string; text: string; badge: string }[] = [
  {
    id: "helper",
    title: "PC-Helfer",
    text: "Ein kleines Programm für Windows: Doppelklick genügt. Liest die Logs direkt (auch aus „Program Files“) und trägt neue Blaupausen automatisch ein.",
    badge: "Empfohlen · Windows",
  },
  {
    id: "live",
    title: "Live-Update",
    text: "Die Seite liest dein Spiel-Log mit und trägt neue Blaupausen automatisch ein, sobald du sie bekommst.",
    badge: "Chrome oder Edge am Computer",
  },
  {
    id: "once",
    title: "Einmal auslesen",
    text: "Ein Klick oder Ordner hineinziehen: Die Seite liest dein Spiel-Log und trägt alles ein, was darin steht.",
    badge: "Jeder Browser",
  },
  {
    id: "file",
    title: "Launcher-Datei",
    text: "Die Datei „Erspielte als JSON“ aus dem SC Desktop Launcher hochladen. Sie enthält auch ältere Blaupausen.",
    badge: "Auch ältere Blaupausen",
  },
];

// Vier Wege zum Import. Die Auswahl klappt darunter auf, so bleibt die Seite aufgeräumt.
export default function ImportChooser({ helper = null }: { helper?: HelperStatus }) {
  const [way, setWay] = useState<Way | null>(null);

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-hud-muted">
        Es gibt vier Wege, deine Blaupausen einzutragen. Am einfachsten ist der PC-Helfer. Du kannst sie mischen, nichts wird doppelt eingetragen und nichts
        überschrieben.
      </p>

      <div role="radiogroup" aria-label="Importweg wählen" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {WAYS.map((w) => {
          const on = way === w.id;
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setWay(on ? null : w.id)}
              className={`flex flex-col items-start gap-2 border p-4 text-left transition-colors duration-200 ${
                on ? "border-hud-accent bg-hud-accent/10" : "border-hud-line-strong hover:border-hud-accent/60"
              }`}
            >
              <span className={`font-display text-xl font-semibold uppercase tracking-wider ${on ? "text-hud-accent" : ""}`}>
                {w.title}
              </span>
              <span className="text-sm text-hud-muted">{w.text}</span>
              <span className="mt-auto border border-hud-line-strong px-2 py-0.5 text-xs uppercase tracking-widest text-hud-muted">
                {w.badge}
              </span>
            </button>
          );
        })}
      </div>

      {way === "helper" && (
        <section className="hud-panel space-y-4 p-5" aria-label="PC-Helfer">
          <HelperPanel status={helper} />
        </section>
      )}
      {way === "live" && (
        <section className="hud-panel space-y-4 p-5" aria-label="Live-Update">
          <LogImport mode="live" onSwitch={(m) => setWay(m)} />
        </section>
      )}
      {way === "once" && (
        <section className="hud-panel space-y-4 p-5" aria-label="Einmal auslesen">
          <LogImport mode="once" onSwitch={(m) => setWay(m)} />
        </section>
      )}
      {way === "file" && (
        <section className="hud-panel space-y-4 p-5" aria-label="Launcher-Datei">
          <p className="max-w-2xl text-sm text-hud-muted">
            Im SC Desktop Launcher exportierst du deine Blaupausen als Datei „Erspielte als JSON“. Lade sie hier hoch.
            Es werden nur neue Einträge ergänzt.
          </p>
          <BlueprintImport />
        </section>
      )}
    </div>
  );
}
