"use client";

import { useState, useTransition } from "react";
import { sendDiscordTest } from "../(app)/benutzer/discord-actions";

type Channel = "operationen" | "loot" | "kasse" | "admin";
type Row = { channel: Channel; label: string; configured: boolean };

function TestRow({ row }: { row: Row }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-display text-lg font-semibold tracking-wide">{row.label}</p>
        <p className={`text-sm ${row.configured ? "text-hud-accent" : "text-hud-muted"}`}>
          {row.configured ? "Webhook hinterlegt" : "Noch nicht eingerichtet"}
        </p>
        {result && (
          <p
            role={result.ok ? "status" : "alert"}
            className={`mt-1 text-sm ${result.ok ? "text-hud-accent" : "text-hud-danger"}`}
          >
            {result.text}
          </p>
        )}
      </div>
      <button
        disabled={pending}
        className="hud-btn-ghost hud-btn-sm"
        onClick={() =>
          startTransition(async () => {
            const res = await sendDiscordTest(row.channel);
            setResult(
              res.error
                ? { ok: false, text: res.error }
                : { ok: true, text: "Testnachricht gesendet. Schau in den Channel." }
            );
          })
        }
      >
        {pending ? "Sende …" : "Testnachricht senden"}
      </button>
    </li>
  );
}

export default function DiscordTest({ rows }: { rows: Row[] }) {
  return (
    <ul className="hud-panel max-w-2xl divide-y divide-hud-line">
      {rows.map((r) => (
        <TestRow key={r.channel} row={r} />
      ))}
    </ul>
  );
}
