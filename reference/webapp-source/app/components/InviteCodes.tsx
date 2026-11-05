"use client";

import { useState, useTransition } from "react";
import { createInviteCode, deleteInviteCode, revokeInviteCode } from "../(app)/benutzer/invite-actions";

export type InviteRow = {
  code: string;
  note: string | null;
  uses: number;
  maxUses: number;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
};

const day = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

function statusOf(r: InviteRow): { label: string; tone: "ok" | "muted" } {
  if (r.revoked) return { label: "Gesperrt", tone: "muted" };
  if (r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) return { label: "Abgelaufen", tone: "muted" };
  if (r.uses >= r.maxUses) return { label: "Aufgebraucht", tone: "muted" };
  return { label: "Aktiv", tone: "ok" };
}

export default function InviteCodes({ rows, siteUrl }: { rows: InviteRow[]; siteUrl: string }) {
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(5);
  const [days, setDays] = useState(14);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const text = (code: string) => `Registriere dich hier: ${siteUrl}/registrieren\nDein Einladungscode: ${code}`;
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(text(code));
      setCopied(code);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setError("Kopieren ist hier nicht erlaubt.");
    }
  }

  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-hud-muted">
        Wer sich mit Benutzername und Passwort registrieren will (ohne Discord), braucht einen Einladungscode von dir. Ohne Code geht das nicht.
        Mit Discord anmelden geht weiter ohne Code. Nach der Registrierung musst du das Konto trotzdem noch freigeben.
      </p>

      <section className="hud-panel max-w-2xl space-y-4 p-5">
        <h2 className="hud-h2">Neuen Code anlegen</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-3">
            <span className="hud-label mb-1 block">Notiz (optional, nur für dich)</span>
            <input value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="z. B. für Max" className="hud-input" />
          </label>
          <label>
            <span className="hud-label mb-1 block">Wie oft nutzbar</span>
            <input type="number" min={1} max={500} value={maxUses} onChange={(e) => setMaxUses(Math.round(Number(e.target.value)) || 1)} className="hud-input" />
          </label>
          <label>
            <span className="hud-label mb-1 block">Gültig (Tage, 0 = unbegrenzt)</span>
            <input type="number" min={0} max={365} value={days} onChange={(e) => setDays(Math.max(0, Math.round(Number(e.target.value)) || 0))} className="hud-input" />
          </label>
        </div>
        <button
          disabled={busy}
          className="hud-btn"
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await createInviteCode(note, maxUses, days);
              if (res.error || !res.code) setError(res.error ?? "Das hat nicht geklappt.");
              else {
                setCreated(res.code);
                setNote("");
              }
            })
          }
        >
          {busy ? "Lege an …" : "Code anlegen"}
        </button>
        {created && (
          <div role="status" className="space-y-2 border border-hud-accent/50 bg-hud-accent/5 p-4">
            <p className="text-sm text-hud-muted">Neuer Code:</p>
            <p className="font-mono text-xl text-hud-accent">{created}</p>
            <button className="hud-btn-ghost hud-btn-sm" onClick={() => copy(created)}>
              {copied === created ? "Kopiert" : "Mit Link zum Weitergeben kopieren"}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-hud-danger">
            {error}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="hud-h2">Vorhandene Codes</h2>
        {rows.length === 0 ? (
          <p className="text-hud-muted">Es gibt noch keinen Code. Ohne aktiven Code kann sich niemand mit Benutzername registrieren.</p>
        ) : (
          <ul className="hud-panel max-w-3xl divide-y divide-hud-line">
            {rows.map((r) => {
              const st = statusOf(r);
              return (
                <li key={r.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-lg">{r.code}</p>
                    <p className="text-sm text-hud-muted">
                      {r.note ? `${r.note} · ` : ""}
                      {r.uses} von {r.maxUses} genutzt ·{" "}
                      {r.expiresAt ? `gültig bis ${day.format(new Date(r.expiresAt))}` : "unbegrenzt gültig"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`border px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-widest ${st.tone === "ok" ? "border-hud-accent/60 text-hud-accent" : "border-hud-line-strong text-hud-muted"}`}>
                      {st.label}
                    </span>
                    {st.tone === "ok" && (
                      <>
                        <button className="hud-btn-ghost hud-btn-sm" onClick={() => copy(r.code)}>
                          {copied === r.code ? "Kopiert" : "Kopieren"}
                        </button>
                        <button
                          disabled={busy}
                          className="hud-btn-ghost hud-btn-sm"
                          onClick={() => start(async () => setError((await revokeInviteCode(r.code)).error))}
                        >
                          Sperren
                        </button>
                      </>
                    )}
                    <button
                      disabled={busy}
                      className="hud-btn-ghost hud-btn-sm"
                      onClick={() => {
                        if (window.confirm(`Code ${r.code} löschen?`)) start(async () => setError((await deleteInviteCode(r.code)).error));
                      }}
                    >
                      Löschen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
