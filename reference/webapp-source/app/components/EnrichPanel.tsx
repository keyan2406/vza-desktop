"use client";

import { useEffect, useRef, useState } from "react";
import { enrichBlueprints } from "../(app)/blueprints/actions";
import { retryRecipes } from "../(app)/blueprints/extra-actions";
import { nextStep } from "../../utils/item-info";

type Phase = "idle" | "running" | "waiting" | "done" | "stopped" | "stuck";

const WAIT_SECONDS = 65;

// Für Officer: Beschreibungen (Klasse, Grade, Größe, Typ) aus der Star Citizen Wiki API nachladen.
// Der Knopf arbeitet in Runden, bis alle erledigt sind. Die Seite muss dafür offen bleiben.
export default function EnrichPanel({ pending }: { pending: number }) {
  const [left, setLeft] = useState(pending);
  const [startLeft, setStartLeft] = useState(pending);
  const [found, setFound] = useState(0);
  const [recipes, setRecipes] = useState(0);
  const [unclear, setUnclear] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => () => void (stop.current = true), []);

  if (pending === 0 && left === 0 && phase === "idle") return null;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function run() {
    stop.current = false;
    setError(null);
    setFound(0);
    setRecipes(0);
    setUnclear(0);
    setStartLeft(left);
    setPhase("running");
    let stuck = 0;
    let totalFound = 0;
    let totalRecipes = 0;
    let totalUnclear = 0;

    while (!stop.current) {
      const res = await enrichBlueprints();
      if (res.error || !res.result) {
        setError(res.error ?? "Das hat nicht geklappt.");
        setPhase("stopped");
        return;
      }
      const r = res.result;
      totalFound += r.found;
      totalRecipes += r.withRecipe;
      totalUnclear += r.unreachable;
      setFound(totalFound);
      setRecipes(totalRecipes);
      setUnclear(totalUnclear);
      setLeft(r.remaining);

      const step = nextStep(r, stuck);
      stuck = step.stuckRounds;
      if (step.action === "done") return setPhase("done");
      if (step.action === "stuck") {
        setError(
          "Es geht nicht weiter. Die Datenbank antwortet zurzeit nicht oder bremst. Versuche es später noch einmal."
        );
        return setPhase("stuck");
      }
      if (step.action === "wait") {
        setPhase("waiting");
        for (let s = WAIT_SECONDS; s > 0 && !stop.current; s--) {
          setCountdown(s);
          await sleep(1000);
        }
        if (!stop.current) setPhase("running");
      }
    }
    setPhase("stopped");
  }

  const busy = phase === "running" || phase === "waiting";
  const done = startLeft - left;
  const pct = startLeft > 0 ? Math.min(100, Math.round((done / startLeft) * 100)) : 0;

  return (
    <div className="hud-panel max-w-3xl space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-display text-lg font-bold text-hud-amber">{left}</span> Blaupausen warten auf Beschreibung
          und Rezept (Klasse, Grade, Größe, Zutaten, Herstellzeit).
        </p>
        <div className="flex gap-2">
          {!busy && unclear > 0 && (
            <button
              className="hud-btn-ghost hud-btn-sm"
              onClick={async () => {
                const res = await retryRecipes();
                if (res.error) setError(res.error);
                else {
                  setLeft((l) => l + res.count);
                  setUnclear(0);
                  setPhase("idle");
                }
              }}
            >
              Unklare sofort wiederholen
            </button>
          )}
          {busy ? (
            <button onClick={() => (stop.current = true)} className="hud-btn-ghost hud-btn-sm">
              Stoppen
            </button>
          ) : (
            <button onClick={run} disabled={left === 0} className="hud-btn hud-btn-sm">
              {phase === "stopped" || phase === "stuck" ? "Weitermachen" : "Alle nachladen"}
            </button>
          )}
        </div>
      </div>

      {busy && (
        <div role="status" aria-live="polite">
          <p className="text-sm">
            {phase === "waiting"
              ? `Die Datenbank bremst. Es geht in ${countdown} Sekunden weiter …`
              : `Schlage nach … ${done} von ${startLeft} erledigt, ${found} mit Beschreibung.`}
          </p>
          <div className="mt-2 h-2 bg-hud-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-hud-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-hud-muted">
            Lass diese Seite offen, bis es fertig ist. Das dauert etwa eine Minute pro 50 Blaupausen.
          </p>
        </div>
      )}

      {phase === "done" && (
        <div role="status" className="space-y-2 text-sm">
          <p className="text-hud-accent">
            Fertig. {found} Blaupausen wurden in der Datenbank gefunden, davon {recipes} mit Rezept.
          </p>
          {unclear > 0 && (
            <p className="text-hud-amber">
              Bei {unclear} konnte das Rezept nicht geklärt werden (die Datenbank hat nicht sauber geantwortet). Sie
              werden in einer Stunde automatisch noch einmal versucht. Mit „Abfrage testen“ unter „Bearbeiten“ einer
              Blaupause siehst du, woran es liegt.
            </p>
          )}
        </div>
      )}
      {phase === "stopped" && !error && (
        <p role="status" className="text-sm text-hud-muted">
          Gestoppt. {found} in der Datenbank gefunden, {left} stehen noch aus.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-hud-danger">
          {error}
        </p>
      )}
    </div>
  );
}
