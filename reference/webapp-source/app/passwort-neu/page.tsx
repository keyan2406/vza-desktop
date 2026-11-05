import { Suspense } from "react";
import Link from "next/link";
import { peekPasswordReset } from "../../utils/auth-reset";
import { normalizeResetCode } from "../../utils/auth-validate";
import { BRAND } from "../../utils/brand";
import { ResetPasswordForm } from "../components/AuthForms";
import Monogram from "../components/Monogram";

export const metadata = { title: "Neues Passwort", robots: { index: false, follow: false } };

type SearchParams = Promise<{ code?: string | string[] }>;

// Erreichbar nur mit dem Link, den der Discord-Bot (Befehl /passwort) oder ein Admin ausgibt
async function Guard({ searchParams }: { searchParams: SearchParams }) {
  const { code } = await searchParams;
  const raw = typeof code === "string" ? code : "";
  const norm = normalizeResetCode(raw);
  const peek = norm.ok ? await peekPasswordReset(norm.value) : ({ status: "invalid" } as const);

  if (peek.status === "ok" && norm.ok) {
    return <ResetPasswordForm code={norm.value} needsName={!peek.loginName} username={peek.username} />;
  }
  return (
    <div role="alert" className="space-y-4 text-left">
      <p className="text-hud-danger">
        {peek.status === "unavailable"
          ? "Das Zurücksetzen ist gerade nicht möglich. Bitte melde das einem Admin."
          : "Der Link ist ungültig oder abgelaufen. Links gelten 15 Minuten und nur einmal."}
      </p>
      <p className="text-sm text-hud-muted">
        Schreibe in Discord <code className="text-hud-text">/passwort</code>, um einen neuen Link zu bekommen.
      </p>
      <Link href="/" className="text-hud-accent underline">
        Zur Anmeldung
      </Link>
    </div>
  );
}

export default function PasswortNeuPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="hud-panel w-full max-w-md p-8 text-center">
        <div className="flex justify-center">
          <Monogram size={64} />
        </div>
        <p className="hud-label mt-4">{BRAND.clan}</p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[0.12em] text-hud-accent">Neues Passwort</h1>
        <div className="mt-6">
          <Suspense fallback={<p className="text-hud-muted">Lade …</p>}>
            <Guard searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
