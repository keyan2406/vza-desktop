"use client";

import { useMemo, useState, useTransition } from "react";
import { addShip } from "../(app)/hangar/actions";

type Ship = { id: number; name: string; manufacturer: string };

export default function AddShipForm({ ships }: { ships: Ship[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Ship | null>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"ingame" | "pledge">("ingame");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ships.slice(0, 8);
    return ships
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.manufacturer.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, ships]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) {
      setError("Bitte ein Schiff aus der Liste wählen.");
      return;
    }
    const fd = new FormData();
    fd.set("ship_id", String(selected.id));
    fd.set("source", source);
    fd.set("pledge_value", value);

    startTransition(async () => {
      const res = await addShip(fd);
      if (res.error) {
        setError(res.error);
      } else {
        setError(null);
        setQuery("");
        setSelected(null);
        setValue("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="relative max-w-md">
        <label htmlFor="ship-search" className="hud-label mb-1">
          Schiff suchen
        </label>
        <input
          id="ship-search"
          type="text"
          autoComplete="off"
          value={query}
          placeholder="z. B. Cutlass oder Drake"
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="hud-input"
        />
        {open && matches.length > 0 && (
          <ul
            role="listbox"
            className="hud-panel absolute z-10 mt-1 max-h-72 w-full overflow-auto"
          >
            {matches.map((s) => (
              <li key={s.id} role="option" aria-selected={selected?.id === s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSelected(s);
                    setQuery(`${s.name} (${s.manufacturer})`);
                    setOpen(false);
                    setError(null);
                  }}
                  className="flex w-full justify-between gap-4 px-3 py-2 text-left hover:bg-hud-accent/10"
                >
                  <span>{s.name}</span>
                  <span className="text-sm text-hud-muted">{s.manufacturer}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && matches.length === 0 && (
          <p className="hud-panel absolute z-10 mt-1 w-full px-3 py-2 text-sm text-hud-muted">
            Kein Schiff gefunden. Ein Officer kann es der Liste hinzufügen.
          </p>
        )}
      </div>

      <fieldset>
        <legend className="hud-label mb-1">Herkunft</legend>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              className="accent-hud-accent"
              name="source"
              checked={source === "ingame"}
              onChange={() => setSource("ingame")}
            />
            Ingame gekauft
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              className="accent-hud-accent"
              name="source"
              checked={source === "pledge"}
              onChange={() => setSource("pledge")}
            />
            Pledge (Storecredit)
          </label>
        </div>
      </fieldset>

      {source === "pledge" && (
        <div className="max-w-xs">
          <label htmlFor="pledge-value" className="hud-label mb-1">
            Pledge-Wert in Euro (optional)
          </label>
          <input
            id="pledge-value"
            type="text"
            inputMode="decimal"
            value={value}
            placeholder="z. B. 75"
            onChange={(e) => setValue(e.target.value)}
            className="hud-input"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-hud-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="hud-btn"
      >
        {pending ? "Speichere …" : "Zum Hangar hinzufügen"}
      </button>
    </form>
  );
}
