"use client";

import { useState, useTransition } from "react";
import { measureSpeed } from "../(app)/benutzer/system-actions";
import { interpretSpeed, regionName, type SpeedResult } from "../../utils/speed";

const LEVEL_STYLE = {
  ok: "border-hud-accent/50 text-hud-accent",
  warn: "border-hud-amber/60 text-hud-amber",
  bad: "border-hud-danger/60 text-hud-danger",
} as const;
const LEVEL_MARK = { ok: "✓", warn: "!", bad: "✕" } as const;

// Für Admins: zeigt, wo die Seite Zeit verliert (Entfernung zur Datenbank, Anmelde-Prüfung).
export default function SpeedCheck() {
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="hud-panel max-w-2xl space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-wide">Geschwindigkeit messen</p>
          <p className="text-sm text-hud-muted">
            Misst vom Server aus, wie lange Datenbank und Anmelde-Prüfung brauchen, und sagt dir, was zu tun ist.
          </p>
        </div>
        <button
          disabled={busy}
          className="hud-btn hud-btn-sm"
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await measureSpeed();
              if (res.error || !res.result) setError(res.error ?? "Die Messung hat nicht geklappt.");
              else setResult(res.result);
            })
          }
        >
          {busy ? "Messe …" : result ? "Noch einmal messen" : "Jetzt messen"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-hud-danger">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4" role="status" aria-live="polite">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="hud-label">Server-Region</dt>
              <dd>{regionName(result.region)}{result.region ? ` (${result.region})` : ""}</dd>
            </div>
            <div>
              <dt className="hud-label">Datenbank je Abfrage</dt>
              <dd className="tabular-nums">{result.dbMedianMs} ms</dd>
            </div>
            <div>
              <dt className="hud-label">Erste Abfrage</dt>
              <dd className="tabular-nums">{result.dbFirstMs} ms</dd>
            </div>
            <div>
              <dt className="hud-label">Anmelde-Prüfung</dt>
              <dd className="tabular-nums">{result.claimsNextMs} ms</dd>
            </div>
            <div>
              <dt className="hud-label">Nachfrage Auth-Server</dt>
              <dd className="tabular-nums">{result.getUserMs} ms</dd>
            </div>
          </dl>
          <ul className="space-y-2">
            {interpretSpeed(result).map((v, i) => (
              <li key={i} className={`flex gap-3 border p-3 text-sm ${LEVEL_STYLE[v.level]}`}>
                <span aria-hidden className="font-bold">{LEVEL_MARK[v.level]}</span>
                <span>
                  <strong className="block">{v.title}</strong>
                  <span className="text-hud-text">{v.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
