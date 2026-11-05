"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // In den Vercel-Logs lässt sich der Fehler über diese Nummer wiederfinden
  useEffect(() => {
    console.error("Seitenfehler", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="hud-panel w-full max-w-md p-8 text-center">
        <p className="hud-label">Fehler</p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[0.12em] text-hud-danger">
          Da ist etwas schiefgelaufen
        </h1>
        <p className="mt-4 text-hud-muted">
          Bitte versuche es noch einmal. Hilft das nicht, melde dich bei einem Admin.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-hud-muted">Fehlernummer: {error.digest}</p>}
        <button onClick={reset} className="hud-btn mt-6">
          Erneut versuchen
        </button>
      </div>
    </main>
  );
}
