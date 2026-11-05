"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishEvent, type LootInput } from "../(app)/operationen/verwalten/actions";

type Member = { id: string; username: string; signedUp: boolean };
type LootRow = {
  key: number;
  name: string;
  qty: string;
  holderId: string;
  location: "player" | "vizsla_bank";
  note: string;
};

let nextKey = 1;
const newLootRow = (): LootRow => ({
  key: nextKey++,
  name: "",
  qty: "1",
  holderId: "",
  location: "player",
  note: "",
});

export default function AttendanceForm({
  eventId,
  points,
  members,
  itemSuggestions,
}: {
  eventId: number;
  points: number;
  members: Member[];
  itemSuggestions: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(members.filter((m) => m.signedUp).map((m) => m.id))
  );
  const [query, setQuery] = useState("");
  const [lootRows, setLootRows] = useState<LootRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((m) => m.username.toLowerCase().includes(q)) : members;
  }, [members, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function patchLoot(key: number, patch: Partial<LootRow>) {
    setLootRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function finish() {
    const loot: LootInput[] = [];
    for (const [i, r] of lootRows.entries()) {
      const name = r.name.trim();
      const qty = Number(r.qty);
      if (!name) return setError(`Loot ${i + 1}: Bitte einen Namen eintragen.`);
      if (!Number.isInteger(qty) || qty < 1) {
        return setError(`Loot „${name}“: Die Menge muss mindestens 1 sein.`);
      }
      if (r.location === "player" && !r.holderId) {
        return setError(`Loot „${name}“: Bitte wählen, bei wem es liegt.`);
      }
      loot.push({
        name,
        quantity: qty,
        holderId: r.holderId || null,
        location: r.location,
        note: r.note,
      });
    }

    const msg =
      `Operation abschließen?\n\n${selected.size} Teilnehmer erhalten je ${points} Punkte.\n` +
      `${loot.length} Loot-Einträge werden angelegt.\n\nDas lässt sich nicht rückgängig machen.`;
    if (!window.confirm(msg)) return;

    setError(null);
    startTransition(async () => {
      const res = await finishEvent(eventId, [...selected], loot);
      if (res.error) setError(res.error);
      else router.push(`/operationen/${eventId}`);
    });
  }

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h3 className="hud-h2 mb-3">Teilnehmer</h3>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Mitglied suchen"
          aria-label="Mitglied suchen"
          className="hud-input mb-3"
        />
        <ul className="hud-panel max-h-96 divide-y divide-hud-line overflow-y-auto">
          {visible.map((m) => (
            <li key={m.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-hud-accent/5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-hud-accent"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                <span className="flex-1">{m.username}</span>
                {m.signedUp && (
                  <span className="font-display text-xs font-semibold uppercase tracking-widest text-hud-accent">
                    Angemeldet
                  </span>
                )}
              </label>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-4 py-6 text-center text-hud-muted">Keine Treffer.</li>
          )}
        </ul>
        <p className="mt-3 text-hud-muted" aria-live="polite">
          {selected.size} Teilnehmer ausgewählt, je{" "}
          <span className="text-hud-amber">+{points} Punkte</span>
        </p>
      </section>

      <section>
        <h3 className="hud-h2 mb-3">Erbeuteter Loot</h3>
        <p className="mb-4 text-hud-muted">
          Jedes Objekt einzeln eintragen, mit Menge, bei wem es liegt und wo. Kein
          Loot erbeutet? Dann lass die Liste leer.
        </p>
        <datalist id="loot-suggestions">
          {itemSuggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="space-y-3">
          {lootRows.map((r, i) => (
            <div key={r.key} className="hud-panel space-y-3 p-4">
              <div className="flex items-start gap-2">
                <input
                  value={r.name}
                  list="loot-suggestions"
                  maxLength={100}
                  onChange={(e) => patchLoot(r.key, { name: e.target.value })}
                  placeholder="Objekt, z. B. Quantanium"
                  aria-label={`Loot ${i + 1}: Objekt`}
                  className="hud-input min-w-0 flex-1"
                />
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  value={r.qty}
                  onChange={(e) => patchLoot(r.key, { qty: e.target.value })}
                  aria-label={`Loot ${i + 1}: Menge`}
                  className="hud-input w-24"
                />
                <button
                  type="button"
                  onClick={() => setLootRows((rows) => rows.filter((x) => x.key !== r.key))}
                  aria-label={`Loot ${i + 1} entfernen`}
                  className="hud-btn-ghost hud-btn-sm"
                >
                  ×
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="hud-label mb-1" htmlFor={`loot-loc-${r.key}`}>Lagerort</label>
                  <select
                    id={`loot-loc-${r.key}`}
                    value={r.location}
                    onChange={(e) =>
                      patchLoot(r.key, { location: e.target.value as LootRow["location"] })
                    }
                    className="hud-input"
                  >
                    <option value="player">Beim Spieler</option>
                    <option value="vizsla_bank">Vizsla Bank Account</option>
                  </select>
                </div>
                <div>
                  <label className="hud-label mb-1" htmlFor={`loot-holder-${r.key}`}>
                    Liegt bei {r.location === "vizsla_bank" && "(optional)"}
                  </label>
                  <select
                    id={`loot-holder-${r.key}`}
                    value={r.holderId}
                    onChange={(e) => patchLoot(r.key, { holderId: e.target.value })}
                    className="hud-input"
                  >
                    <option value="">– niemand ausgewählt –</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.username}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <input
                value={r.note}
                maxLength={200}
                onChange={(e) => patchLoot(r.key, { note: e.target.value })}
                placeholder="Notiz zum Ort (optional), z. B. Hangar in Area18"
                aria-label={`Loot ${i + 1}: Notiz zum Ort`}
                className="hud-input"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setLootRows((rows) => [...rows, newLootRow()])}
          className="hud-btn-ghost hud-btn-sm mt-3"
        >
          + Loot hinzufügen
        </button>
      </section>

      {error && (
        <p role="alert" className="text-hud-danger">{error}</p>
      )}

      <button onClick={finish} disabled={pending} className="hud-btn">
        {pending ? "Schließe ab …" : "Abschließen und Punkte vergeben"}
      </button>
    </div>
  );
}
