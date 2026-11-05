import Link from "next/link";
import { BRAND } from "../../utils/brand";
import Monogram from "../components/Monogram";

export const metadata = { title: "Passwort vergessen" };

export default function PasswortVergessenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="hud-panel w-full max-w-md p-8 text-center">
        <div className="flex justify-center">
          <Monogram size={64} />
        </div>
        <p className="hud-label mt-4">{BRAND.clan}</p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[0.12em] text-hud-accent">Passwort vergessen</h1>
        <div className="mt-6 space-y-5 text-left">
          <div>
            <p className="font-display text-lg font-semibold tracking-wide">Mit Discord (am schnellsten)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              <li>
                Schreibe in unserem Discord-Server <code className="text-hud-accent">/passwort</code>.
              </li>
              <li>Der Bot antwortet nur dir mit einem Link. Er gilt 15 Minuten und nur einmal.</li>
              <li>Öffne den Link und lege ein neues Passwort fest.</li>
            </ol>
            <p className="mt-2 text-xs text-hud-muted">Das geht, wenn du dein Discord im Profil verknüpft hast.</p>
          </div>
          <div>
            <p className="font-display text-lg font-semibold tracking-wide">Ohne Discord</p>
            <p className="mt-2 text-sm">Bitte einen Admin deiner Org um einen Link. Er erzeugt ihn in der Benutzerverwaltung für dich.</p>
          </div>
          <Link href="/" className="inline-block text-hud-accent underline">
            Zurück zur Anmeldung
          </Link>
        </div>
      </div>
    </main>
  );
}
