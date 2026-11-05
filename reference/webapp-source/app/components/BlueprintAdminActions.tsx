"use client";

import { useState, useTransition } from "react";
import { deleteBlueprint, renameBlueprint, setBlueprintCategory } from "../(app)/blueprints/actions";
import { diagnoseBlueprint } from "../(app)/blueprints/extra-actions";
import { CATEGORIES, categoryLabel } from "../../utils/blueprint-category";

// Nur für Officer und Admins: Namen korrigieren oder einen Katalog-Eintrag löschen.
export default function BlueprintAdminActions({
  id,
  name,
  owners,
  auto,
  override,
}: {
  id: number;
  name: string;
  owners: number;
  auto: string;
  override: string | null;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [diag, setDiag] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-hud-muted hover:text-hud-text">
        Bearbeiten
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`bp-name-${id}`} className="hud-label mb-1">Name</label>
            <input
              id={`bp-name-${id}`}
              value={value}
              maxLength={120}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              className="hud-input"
            />
          </div>
          <button
            disabled={pending || value.trim() === "" || value.trim() === name}
            onClick={() =>
              startTransition(async () => {
                const res = await renameBlueprint(id, value);
                setError(res.error);
                setSaved(!res.error);
              })
            }
            className="hud-btn hud-btn-sm"
          >
            Umbenennen
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-hud-danger">{error}</p>}
        {saved && <p role="status" className="text-sm text-hud-accent">Gespeichert.</p>}

        <div>
          <button
            type="button"
            disabled={pending}
            className="hud-btn-ghost hud-btn-sm"
            onClick={() =>
              startTransition(async () => {
                setDiag(["Frage die Wiki-Datenbank …"]);
                const res = await diagnoseBlueprint(id);
                setDiag(res.error ? [res.error] : res.lines);
              })
            }
          >
            Abfrage testen
          </button>
          {diag && (
            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap border border-hud-line bg-black/30 p-3 text-xs text-hud-muted">
              {diag.join("\n")}
            </pre>
          )}
        </div>

        <div>
          <label htmlFor={`bp-cat-${id}`} className="hud-label mb-1">Kategorie</label>
          <select
            id={`bp-cat-${id}`}
            defaultValue={override ?? ""}
            disabled={pending}
            onChange={(e) =>
              startTransition(async () => {
                const res = await setBlueprintCategory(id, e.target.value || null);
                setError(res.error);
                setSaved(!res.error);
              })
            }
            className="hud-input w-auto"
          >
            <option value="">Automatisch ({categoryLabel(auto)})</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <form
          action={deleteBlueprint}
          onSubmit={(e) => {
            if (
              !window.confirm(
                `„${name}“ aus dem Katalog löschen? Die Blaupause wird bei ${owners} ${owners === 1 ? "Mitglied" : "Mitgliedern"} entfernt.`
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="blueprint_id" value={id} />
          <button className="hud-btn-ghost hud-btn-sm">Aus dem Katalog löschen</button>
        </form>
      </div>
    </details>
  );
}
