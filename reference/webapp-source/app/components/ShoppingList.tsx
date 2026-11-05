"use client";

import { useMemo, useState, useTransition } from "react";
import { clearShopping, removeShopping, setShoppingQty } from "../(app)/blueprints/extra-actions";
import { amountOf, toText, totals, type ShopRow } from "../../utils/shopping";

export default function ShoppingList({ rows }: { rows: ShopRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();
  const sums = useMemo(() => totals(rows), [rows]);

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const res = await fn();
      setError(res.error);
    });

  async function copy() {
    try {
      await navigator.clipboard.writeText(toText(rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Kopieren ist hier nicht erlaubt. Markiere die Liste und kopiere sie von Hand.");
    }
  }

  if (rows.length === 0) {
    return (
      <p className="max-w-2xl text-hud-muted">
        Deine Einkaufsliste ist leer. Bei jeder Blaupause in der Org-Suche gibt es den Knopf „Einkaufsliste“. Die Seite
        zählt dann alle Zutaten für dich zusammen. In Discord geht das auch mit{" "}
        <code className="text-hud-text">/einkaufsliste</code>.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="hud-h2">Herzustellen</h2>
        <ul className="hud-panel max-w-2xl divide-y divide-hud-line">
          {rows.map((r) => (
            <li key={r.blueprintId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
              <p className="min-w-0 font-medium">{r.name}</p>
              <div className="flex items-center gap-2">
                <button
                  aria-label={`Weniger ${r.name}`}
                  disabled={busy || r.qty <= 1}
                  className="hud-btn-ghost hud-btn-sm"
                  onClick={() => run(() => setShoppingQty(r.blueprintId, r.qty - 1))}
                >
                  −
                </button>
                <span className="w-10 text-center tabular-nums" aria-label={`${r.qty} Stück`}>
                  {r.qty}×
                </span>
                <button
                  aria-label={`Mehr ${r.name}`}
                  disabled={busy || r.qty >= 99}
                  className="hud-btn-ghost hud-btn-sm"
                  onClick={() => run(() => setShoppingQty(r.blueprintId, r.qty + 1))}
                >
                  +
                </button>
                <button
                  disabled={busy}
                  className="hud-btn-ghost hud-btn-sm"
                  onClick={() => run(() => removeShopping(r.blueprintId))}
                >
                  Entfernen
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="hud-h2">Zutaten gesamt</h2>
        {sums.totals.length === 0 ? (
          <p className="text-hud-muted">Für diese Blaupausen ist noch kein Rezept geladen.</p>
        ) : (
          <ul className="hud-panel max-w-md divide-y divide-hud-line">
            {sums.totals.map((t) => (
              <li key={t.name} className="flex items-baseline justify-between gap-4 px-4 py-2">
                <span>{t.name}</span>
                <span className="tabular-nums text-hud-amber">{amountOf(t) || "–"}</span>
              </li>
            ))}
          </ul>
        )}
        {sums.withoutRecipe.length > 0 && (
          <p className="max-w-2xl text-sm text-hud-muted">
            Ohne bekanntes Rezept (fehlt in der Summe): {sums.withoutRecipe.join(", ")}.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="hud-btn" onClick={copy}>
          {copied ? "Kopiert" : "Als Text kopieren"}
        </button>
        <button
          disabled={busy}
          className="hud-btn-ghost"
          onClick={() => {
            if (window.confirm("Die ganze Einkaufsliste leeren?")) run(() => clearShopping());
          }}
        >
          Liste leeren
        </button>
        <span className="text-sm text-hud-muted">In Discord: /einkaufsliste zeigen</span>
      </div>
      {error && (
        <p role="alert" className="text-hud-danger">
          {error}
        </p>
      )}
    </div>
  );
}
