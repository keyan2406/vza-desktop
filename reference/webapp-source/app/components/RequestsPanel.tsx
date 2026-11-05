"use client";

import { useState, useTransition } from "react";
import { closeCraftRequest, takeCraftRequest } from "../(app)/blueprints/extra-actions";

export type RequestRow = {
  id: number;
  qty: number;
  note: string | null;
  status: "open" | "taken";
  blueprintName: string;
  requester: string;
  taker: string | null;
  createdAt: string;
  canTake: boolean; // du besitzt die Blaupause und bist nicht der Anfragende
  isRequester: boolean;
  isTaker: boolean;
  isStaff: boolean;
};

const day = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

function Row({ r }: { r: RequestRow }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const res = await fn();
      setError(res.error);
    });

  return (
    <li className="hud-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-wide">
            {r.qty}× {r.blueprintName}
          </p>
          <p className="text-sm text-hud-muted">
            Angefragt von {r.requester} am {day.format(new Date(r.createdAt))}
            {r.taker ? ` · übernommen von ${r.taker}` : ""}
          </p>
          {r.note && <p className="mt-1 text-sm">„{r.note}“</p>}
        </div>
        <span
          className={`border px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-widest ${
            r.status === "open" ? "border-hud-accent/60 text-hud-accent" : "border-hud-amber/60 text-hud-amber"
          }`}
        >
          {r.status === "open" ? "Offen" : "Übernommen"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {r.status === "open" && r.canTake && (
          <button disabled={busy} className="hud-btn hud-btn-sm" onClick={() => run(() => takeCraftRequest(r.id))}>
            Übernehmen
          </button>
        )}
        {r.status === "taken" && (r.isTaker || r.isRequester || r.isStaff) && (
          <button disabled={busy} className="hud-btn hud-btn-sm" onClick={() => run(() => closeCraftRequest(r.id, "done"))}>
            Erledigt
          </button>
        )}
        {r.status === "taken" && r.isTaker && (
          <button disabled={busy} className="hud-btn-ghost hud-btn-sm" onClick={() => run(() => closeCraftRequest(r.id, "release"))}>
            Zurückgeben
          </button>
        )}
        {(r.isRequester || r.isStaff) && (
          <button
            disabled={busy}
            className="hud-btn-ghost hud-btn-sm"
            onClick={() => {
              if (window.confirm("Diese Anfrage abbrechen?")) run(() => closeCraftRequest(r.id, "cancel"));
            }}
          >
            Abbrechen
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-hud-danger">
          {error}
        </p>
      )}
    </li>
  );
}

export default function RequestsPanel({ rows }: { rows: RequestRow[] }) {
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-hud-muted">
        Hier stehen offene Herstellungs-Anfragen. Eine Anfrage stellst du in der Org-Suche bei der Blaupause (Knopf
        „Anfragen“) oder in Discord mit <code className="text-hud-text">/blaupause anfragen</code>.
      </p>
      {rows.length === 0 ? (
        <p className="text-hud-muted">Zurzeit gibt es keine offenen Anfragen.</p>
      ) : (
        <ul className="hud-stagger grid max-w-3xl gap-3">
          {rows.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
