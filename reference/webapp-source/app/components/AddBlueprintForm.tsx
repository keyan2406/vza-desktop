"use client";

import { useMemo, useState, useTransition } from "react";
import { addBlueprintByName } from "../(app)/blueprints/actions";

export default function AddBlueprintForm({ catalog }: { catalog: string[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [query, catalog]);

  const exact = catalog.some((n) => n.toLowerCase() === query.trim().toLowerCase());

  function add(name: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await addBlueprintByName(name);
      if (res.error) {
        setMessage({ type: "error", text: res.error });
      } else if (res.result && res.result.added === 0) {
        setMessage({ type: "ok", text: `„${name}“ hattest du schon.` });
        setQuery("");
      } else {
        setMessage({ type: "ok", text: `„${name}“ wurde eingetragen.` });
        setQuery("");
      }
    });
  }

  return (
    <div className="max-w-md">
      <label htmlFor="bp-add" className="hud-label mb-1">
        Blaupause von Hand eintragen
      </label>
      <div className="relative">
        <input
          id="bp-add"
          autoComplete="off"
          value={query}
          maxLength={120}
          placeholder="Name suchen, z. B. Antium Core"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="hud-input"
        />
        {open && query.trim() !== "" && (
          <ul role="listbox" className="hud-panel absolute z-10 mt-1 max-h-72 w-full overflow-auto">
            {matches.map((n) => (
              <li key={n} role="option" aria-selected={false}>
                <button
                  type="button"
                  disabled={pending}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    add(n);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-hud-accent/10"
                >
                  {n}
                </button>
              </li>
            ))}
            {!exact && (
              <li role="option" aria-selected={false}>
                <button
                  type="button"
                  disabled={pending}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    add(query.trim());
                  }}
                  className="w-full border-t border-hud-line px-3 py-2 text-left text-hud-amber hover:bg-hud-amber/10"
                >
                  Neu eintragen: „{query.trim()}“
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={`mt-2 text-sm ${message.type === "error" ? "text-hud-danger" : "text-hud-accent"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
