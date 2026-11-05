import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "../utils/auth";
import FanNotice from "./components/FanNotice";
import LoginPanel from "./components/LoginPanel";
import ClanLogo from "./components/ClanLogo";
import { BRAND } from "../utils/brand";

type SearchParams = Promise<{ error?: string; info?: string }>;

// Dynamischer Teil: liest die Anmeldung und die Adresse. Läuft im Suspense-Block.
async function LoginOrRedirect({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await getSessionUser();

  if (user) redirect("/dashboard");

  const { error, info } = await searchParams;

  return (
    <>
      {info === "passwort" && (
        <p role="status" className="text-hud-accent">
          Dein neues Passwort ist gespeichert. Melde dich jetzt mit Benutzername und Passwort an.
        </p>
      )}
      {error && (
        <p role="alert" className="text-hud-danger">
          Anmeldung fehlgeschlagen. Melde dich mit deinem Benutzernamen und Passwort an. Eine Anmeldung mit Discord gibt es nicht mehr.
        </p>
      )}
      <LoginPanel />
    </>
  );
}

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="hud-panel hud-stagger p-8 text-center">
          <ClanLogo size={260} />
          <h1 className="sr-only">{BRAND.clan}</h1>
          <p className="mt-2 font-display text-2xl font-bold uppercase tracking-[0.3em] text-hud-accent">
            {BRAND.short}
          </p>
          <p className="mt-1 font-display text-lg font-semibold uppercase tracking-[0.25em] text-hud-amber">
            {BRAND.slogan}
          </p>
          <p className="mt-6 text-hud-muted">
            Operationen, Hangar, Loot und Blaupausen unserer Org an einem Ort. Melde dich mit Benutzername
            und Passwort an.
          </p>
        <div className="mt-8 flex flex-col items-center gap-4 text-left">
          <Suspense fallback={<p className="text-hud-muted">Lade …</p>}>
            <LoginOrRedirect searchParams={searchParams} />
          </Suspense>
          </div>
        </div>
        <FanNotice className="mt-4 text-center" />
      </div>
    </main>
  );
}
