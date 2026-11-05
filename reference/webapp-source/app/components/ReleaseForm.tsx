"use client";

import { useState, useTransition } from "react";
import { releaseLoot } from "../(app)/lager/verwalten/actions";

export default function ReleaseForm({ itemId }: { itemId: number }) {
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(price.replace(/\./g, "").trim());
    if (price.trim() === "" || !Number.isFinite(value)) {
      setError("Bitte einen Preis in aUEC eintragen.");
      return;
    }
    startTransition(async () => {
      const res = await releaseLoot(itemId, value);
      setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`price-${itemId}`} className="hud-label mb-1">
            Preis in aUEC
          </label>
          <input
            id={`price-${itemId}`}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="z. B. 250000"
            className="hud-input w-48"
          />
        </div>
        <button type="submit" disabled={pending} className="hud-btn hud-btn-sm">
          {pending ? "Gebe frei …" : "Freigeben"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-hud-danger">
          {error}
        </p>
      )}
    </form>
  );
}
