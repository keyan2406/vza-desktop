"use client";

import { useState, useTransition } from "react";
import { createCraftRequest, removeShopping, setShoppingQty } from "../(app)/blueprints/extra-actions";
import type { Recipe } from "../../utils/item-info";
import RecipeBody, { type RecipeState } from "./RecipePanel";

type Panel = "recipe" | "list" | "request" | null;

function ToolButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-expanded={active}
      onClick={onClick}
      className={`border px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition-colors duration-200 ${
        active
          ? "border-hud-accent bg-hud-accent/10 text-hud-accent"
          : "border-hud-line-strong text-hud-muted hover:border-hud-accent/60 hover:text-hud-text"
      }`}
    >
      {children}
    </button>
  );
}

// Drei kleine Knöpfe unter jeder Blaupause: Rezept, Einkaufsliste, Anfragen. Der gewählte Bereich klappt darunter auf.
export default function BlueprintTools({
  id,
  recipe,
  recipeState,
  ownerCount,
  canRequest,
  inList,
}: {
  id: number;
  recipe: Recipe | null;
  recipeState: RecipeState;
  ownerCount: number;
  canRequest: boolean; // nur bei fremden Blaupausen, die jemand besitzt
  inList: number; // Stückzahl auf der Einkaufsliste, 0 = nicht drauf
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [qty, setQty] = useState(inList || 1);
  const [reqQty, setReqQty] = useState(1);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  const toggle = (p: Exclude<Panel, null>) => {
    setPanel((cur) => (cur === p ? null : p));
    setMsg(null);
  };
  const clampQty = (v: number) => Math.min(99, Math.max(1, Math.round(v) || 1));

  return (
    <div className="mt-3 border-t border-hud-line pt-3">
      <div className="flex flex-wrap gap-2">
        <ToolButton active={panel === "recipe"} onClick={() => toggle("recipe")}>
          Rezept
        </ToolButton>
        <ToolButton active={panel === "list"} onClick={() => toggle("list")}>
          {inList > 0 ? `Auf der Liste (${inList}×)` : "Einkaufsliste"}
        </ToolButton>
        {canRequest && (
          <ToolButton active={panel === "request"} onClick={() => toggle("request")}>
            Anfragen
          </ToolButton>
        )}
      </div>

      {panel && (
        <div className="mt-3 text-sm">
          {panel === "recipe" && <RecipeBody recipe={recipe} state={recipeState} />}

          {panel === "list" && (
            <div className="space-y-3">
              <p className="text-hud-muted">
                Setze die Blaupause auf deine Einkaufsliste. Dort zählt die Seite alle Zutaten für dich zusammen.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  Stück
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={qty}
                    onChange={(e) => setQty(clampQty(Number(e.target.value)))}
                    className="hud-input w-20 py-1"
                  />
                </label>
                <button
                  disabled={busy}
                  className="hud-btn hud-btn-sm"
                  onClick={() =>
                    start(async () => {
                      const res = await setShoppingQty(id, qty);
                      setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: inList > 0 ? "Menge aktualisiert." : "Auf der Einkaufsliste." });
                    })
                  }
                >
                  {inList > 0 ? "Menge ändern" : "Hinzufügen"}
                </button>
                {inList > 0 && (
                  <button
                    disabled={busy}
                    className="hud-btn-ghost hud-btn-sm"
                    onClick={() =>
                      start(async () => {
                        const res = await removeShopping(id);
                        setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Von der Liste entfernt." });
                      })
                    }
                  >
                    Entfernen
                  </button>
                )}
              </div>
            </div>
          )}

          {panel === "request" && (
            <div className="space-y-3">
              <p className="text-hud-muted">
                Alle, die diese Blaupause besitzen ({ownerCount}), werden in Discord erwähnt und können die Herstellung
                übernehmen.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-2">
                  Stück
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={reqQty}
                    onChange={(e) => setReqQty(clampQty(Number(e.target.value)))}
                    className="hud-input w-20 py-1"
                  />
                </label>
                <label className="min-w-48 flex-1">
                  <span className="hud-label mb-1 block">Notiz (optional)</span>
                  <input
                    value={note}
                    maxLength={200}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="z. B. bis Freitag"
                    className="hud-input py-1"
                  />
                </label>
                <button
                  disabled={busy}
                  className="hud-btn hud-btn-sm"
                  onClick={() =>
                    start(async () => {
                      const res = await createCraftRequest(id, reqQty, note);
                      if (res.error) setMsg({ ok: false, text: res.error });
                      else {
                        setMsg({ ok: true, text: res.message ?? "Anfrage gesendet." });
                        setNote("");
                      }
                    })
                  }
                >
                  {busy ? "Sende …" : "Anfrage senden"}
                </button>
              </div>
            </div>
          )}

          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={`mt-3 ${msg.ok ? "text-hud-accent" : "text-hud-danger"}`}>
              {msg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
