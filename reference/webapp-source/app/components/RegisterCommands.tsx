"use client";

import { useState, useTransition } from "react";
import { registerDiscordCommands } from "../(app)/benutzer/discord-actions";

// Für Admins: trägt die Slash-Befehle (/blaupause, /operationen ...) auf dem Discord-Server ein.
export default function RegisterCommands() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="hud-panel max-w-2xl space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-wide">Slash-Befehle</p>
          <p className="text-sm text-hud-muted">
            Befehle wie <code className="text-hud-text">/blaupause</code>, <code className="text-hud-text">/operationen</code>{" "}
            oder <code className="text-hud-text">/rangliste</code> auf deinem Server eintragen. Einmal nach jedem Update mit
            neuen Befehlen.
          </p>
        </div>
        <button
          disabled={busy}
          className="hud-btn hud-btn-sm"
          onClick={() =>
            start(async () => {
              const res = await registerDiscordCommands();
              setMsg(
                res.error
                  ? { ok: false, text: res.error }
                  : { ok: true, text: `${res.count} Befehle eingetragen. In Discord erscheinen sie nach wenigen Sekunden, wenn du „/“ tippst.` }
              );
            })
          }
        >
          {busy ? "Trage ein …" : "Befehle eintragen"}
        </button>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-hud-accent" : "text-hud-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
