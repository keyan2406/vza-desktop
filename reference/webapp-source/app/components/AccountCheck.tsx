"use client";

import { useState, useTransition } from "react";
import { testAccountSetup, type CheckStep } from "../(app)/benutzer/system-actions";

// Für Admins: Probelauf der Anmeldung mit Benutzername (Testkonto anlegen, anmelden, löschen)
export default function AccountCheck() {
  const [steps, setSteps] = useState<CheckStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const allOk = steps !== null && steps.length > 0 && steps.every((s) => s.ok);

  return (
    <div className="hud-panel max-w-2xl space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-wide">Anmeldung testen</p>
          <p className="text-sm text-hud-muted">
            Legt ein Testkonto an, meldet es an und löscht es wieder. So weißt du vor der ersten Einladung, dass die Anmeldung
            mit Benutzername und Passwort eingerichtet ist.
          </p>
        </div>
        <button
          disabled={busy}
          className="hud-btn hud-btn-sm"
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await testAccountSetup();
              if (res.error) setError(res.error);
              else setSteps(res.steps);
            })
          }
        >
          {busy ? "Teste …" : steps ? "Noch einmal testen" : "Jetzt testen"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-hud-danger">
          {error}
        </p>
      )}
      {steps && (
        <div role="status" aria-live="polite" className="space-y-3">
          <ul className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className={`flex gap-3 text-sm ${s.ok ? "text-hud-text" : "text-hud-danger"}`}>
                <span aria-hidden className={`font-bold ${s.ok ? "text-hud-accent" : "text-hud-danger"}`}>{s.ok ? "✓" : "✕"}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
          {allOk && <p className="text-hud-accent">Alles in Ordnung. Du kannst Einladungscodes verteilen.</p>}
        </div>
      )}
    </div>
  );
}
