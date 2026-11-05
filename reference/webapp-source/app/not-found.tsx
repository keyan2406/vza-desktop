import Link from "next/link";
import Monogram from "./components/Monogram";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="hud-panel w-full max-w-md p-8 text-center">
        <div className="flex justify-center">
          <Monogram size={64} />
        </div>
        <p className="hud-label mt-4">Fehler 404</p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[0.12em] text-hud-accent">
          Seite nicht gefunden
        </h1>
        <p className="mt-4 text-hud-muted">
          Diese Seite gibt es nicht oder sie wurde verschoben.
        </p>
        <p className="mt-2 font-display text-sm uppercase tracking-[0.25em] text-hud-amber">This is not the way</p>
        <Link href="/dashboard" className="hud-btn mt-6">
          Zum Dashboard
        </Link>
      </div>
    </main>
  );
}
