"use client";

import { useState, useTransition } from "react";
import { moveLoot } from "../(app)/lager/verwalten/actions";

type Member = { id: string; username: string };

export default function MoveForm({
  itemId,
  members,
  current,
}: {
  itemId: number;
  members: Member[];
  current: { location: "player" | "vizsla_bank"; holderId: string | null; note: string };
}) {
  const [location, setLocation] = useState(current.location);
  const [holderId, setHolderId] = useState(current.holderId ?? "");
  const [note, setNote] = useState(current.note);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    startTransition(async () => {
      const res = await moveLoot({
        itemId,
        location,
        holderId: holderId || null,
        note,
      });
      setError(res.error);
      setDone(!res.error);
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`mv-loc-${itemId}`} className="hud-label mb-1">Lagerort</label>
          <select
            id={`mv-loc-${itemId}`}
            value={location}
            onChange={(e) => setLocation(e.target.value as "player" | "vizsla_bank")}
            className="hud-input"
          >
            <option value="player">Beim Spieler</option>
            <option value="vizsla_bank">Vizsla Bank Account</option>
          </select>
        </div>
        <div>
          <label htmlFor={`mv-holder-${itemId}`} className="hud-label mb-1">
            Liegt bei {location === "vizsla_bank" && "(optional)"}
          </label>
          <select
            id={`mv-holder-${itemId}`}
            value={holderId}
            onChange={(e) => setHolderId(e.target.value)}
            className="hud-input"
          >
            <option value="">– niemand ausgewählt –</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.username}</option>
            ))}
          </select>
        </div>
      </div>
      <input
        value={note}
        maxLength={200}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notiz zum Ort (optional)"
        aria-label="Notiz zum Ort"
        className="hud-input"
      />
      {error && <p role="alert" className="text-sm text-hud-danger">{error}</p>}
      {done && <p role="status" className="text-sm text-hud-accent">Standort gespeichert.</p>}
      <button type="submit" disabled={pending} className="hud-btn hud-btn-sm">
        {pending ? "Speichere …" : "Standort speichern"}
      </button>
    </form>
  );
}
