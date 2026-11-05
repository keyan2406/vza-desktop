"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createEvent, updateEvent } from "../(app)/operationen/verwalten/actions";
import ShipPicker, { type Ship } from "./ShipPicker";

type ShipRow = { key: number; query: string; ship: Ship | null; qty: string };
type RoleRow = { key: number; name: string; qty: string };

let nextKey = 1;
const newShipRow = (): ShipRow => ({ key: nextKey++, query: "", ship: null, qty: "1" });
const newRoleRow = (): RoleRow => ({ key: nextKey++, name: "", qty: "1" });

export type EditInit = {
  eventId: number;
  title: string;
  description: string;
  startsAtLocal: string; // "2026-11-05T20:00" in deutscher Zeit
  minPlayers: number;
  points: number;
  ships: { ship: Ship; qty: number }[];
  roles: { name: string; qty: number }[];
};

// Formular zum Anlegen. Mit "edit" bearbeitet es eine bestehende, noch geplante Operation.
export default function NewEventForm({
  ships,
  roleSuggestions,
  edit,
}: {
  ships: Ship[];
  roleSuggestions: string[];
  edit?: EditInit;
}) {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [shipRows, setShipRows] = useState<ShipRow[]>(() =>
    edit && edit.ships.length > 0
      ? edit.ships.map((s) => ({
          key: nextKey++,
          query: `${s.ship.name} (${s.ship.manufacturer})`,
          ship: s.ship,
          qty: String(s.qty),
        }))
      : [newShipRow()]
  );
  const [roleRows, setRoleRows] = useState<RoleRow[]>(() =>
    edit && edit.roles.length > 0
      ? edit.roles.map((r) => ({ key: nextKey++, name: r.name, qty: String(r.qty) }))
      : [newRoleRow()]
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function patchShip(key: number, patch: Partial<ShipRow>) {
    setShipRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function patchRole(key: number, patch: Partial<RoleRow>) {
    setRoleRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setDone(false);

    if (shipRows.some((r) => r.query.trim() !== "" && !r.ship)) {
      setError("Bitte jedes Schiff aus der Vorschlagsliste auswählen.");
      return;
    }

    const input = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      startsAt: String(fd.get("starts_at") ?? ""),
      minPlayers: Number(fd.get("min_players") || 1),
      points: Number(fd.get("points") || 10),
      ships: shipRows
        .filter((r) => r.ship)
        .map((r) => ({ shipId: r.ship!.id, quantity: Number(r.qty || 1) })),
      roles: roleRows
        .filter((r) => r.name.trim() !== "")
        .map((r) => ({ name: r.name.trim(), quantity: Number(r.qty || 1) })),
    };

    startTransition(async () => {
      const res = edit ? await updateEvent(edit.eventId, input) : await createEvent(input);
      if (res.error) {
        setError(res.error);
      } else if (edit) {
        setError(null);
        router.push("/operationen/verwalten");
      } else {
        setError(null);
        setDone(true);
        setShipRows([newShipRow()]);
        setRoleRows([newRoleRow()]);
        setFormKey((k) => k + 1);
      }
    });
  }

  return (
    <form key={formKey} onSubmit={submit} className="max-w-2xl space-y-6">
      <div>
        <label htmlFor="ev-title" className="hud-label mb-1">Titel</label>
        <input id="ev-title" name="title" required maxLength={100} defaultValue={edit?.title} className="hud-input" placeholder="z. B. Bergbau-Abend Aaron Halo" />
      </div>

      <div>
        <label htmlFor="ev-desc" className="hud-label mb-1">Beschreibung (optional)</label>
        <textarea id="ev-desc" name="description" rows={4} defaultValue={edit?.description} className="hud-input" placeholder="Treffpunkt, Ablauf, was mitzubringen ist" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor="ev-start" className="hud-label mb-1">Beginn (deutsche Zeit)</label>
          <input id="ev-start" name="starts_at" type="datetime-local" required defaultValue={edit?.startsAtLocal} className="hud-input" />
        </div>
        <div>
          <label htmlFor="ev-min" className="hud-label mb-1">Mindestspielerzahl</label>
          <input id="ev-min" name="min_players" type="number" min={0} max={500} defaultValue={edit?.minPlayers ?? 1} className="hud-input" />
        </div>
        <div>
          <label htmlFor="ev-points" className="hud-label mb-1">Punkte pro Teilnahme</label>
          <input id="ev-points" name="points" type="number" min={0} max={1000} defaultValue={edit?.points ?? 10} className="hud-input" />
        </div>
      </div>

      <fieldset>
        <legend className="hud-label mb-2">Benötigte Schiffe</legend>
        <div className="space-y-3">
          {shipRows.map((r, i) => (
            <div key={r.key} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ShipPicker
                  ships={ships}
                  query={r.query}
                  value={r.ship}
                  label={`Schiff ${i + 1}`}
                  onChange={(query, ship) => patchShip(r.key, { query, ship })}
                />
              </div>
              <input
                type="number"
                min={1}
                max={100}
                value={r.qty}
                onChange={(e) => patchShip(r.key, { qty: e.target.value })}
                aria-label={`Anzahl Schiff ${i + 1}`}
                className="hud-input w-20"
              />
              <button
                type="button"
                onClick={() => setShipRows((rows) => (rows.length > 1 ? rows.filter((x) => x.key !== r.key) : [newShipRow()]))}
                aria-label={`Schiff ${i + 1} entfernen`}
                className="hud-btn-ghost hud-btn-sm"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setShipRows((rows) => [...rows, newShipRow()])} className="hud-btn-ghost hud-btn-sm mt-3">
          + Schiff hinzufügen
        </button>
      </fieldset>

      <fieldset>
        <legend className="hud-label mb-2">Benötigte Rollen</legend>
        <datalist id="role-suggestions">
          {roleSuggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="space-y-3">
          {roleRows.map((r, i) => (
            <div key={r.key} className="flex items-start gap-2">
              <input
                value={r.name}
                list="role-suggestions"
                maxLength={60}
                onChange={(e) => patchRole(r.key, { name: e.target.value })}
                placeholder="Rolle, z. B. Pilot, Medic, Turmschütze"
                aria-label={`Rolle ${i + 1}`}
                className="hud-input min-w-0 flex-1"
              />
              <input
                type="number"
                min={1}
                max={100}
                value={r.qty}
                onChange={(e) => patchRole(r.key, { qty: e.target.value })}
                aria-label={`Anzahl Rolle ${i + 1}`}
                className="hud-input w-20"
              />
              <button
                type="button"
                onClick={() => setRoleRows((rows) => (rows.length > 1 ? rows.filter((x) => x.key !== r.key) : [newRoleRow()]))}
                aria-label={`Rolle ${i + 1} entfernen`}
                className="hud-btn-ghost hud-btn-sm"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRoleRows((rows) => [...rows, newRoleRow()])} className="hud-btn-ghost hud-btn-sm mt-3">
          + Rolle hinzufügen
        </button>
      </fieldset>

      {error && (
        <p role="alert" className="text-hud-danger">{error}</p>
      )}
      {done && (
        <p role="status" className="text-hud-accent">Operation angelegt.</p>
      )}

      <button type="submit" disabled={pending} className="hud-btn">
        {pending ? "Speichere …" : edit ? "Änderungen speichern" : "Operation anlegen"}
      </button>
    </form>
  );
}
