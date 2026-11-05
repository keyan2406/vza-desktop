import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../utils/auth";
import { BRAND } from "../../utils/brand";
import { RegisterForm } from "../components/AuthForms";
import Monogram from "../components/Monogram";

export const metadata = { title: "Konto erstellen" };

async function Guard() {
  const { user } = await getSessionUser();
  if (user) redirect("/dashboard");
  return <RegisterForm />;
}

export default function RegistrierenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="hud-panel w-full max-w-md p-8 text-center">
        <div className="flex justify-center">
          <Monogram size={64} />
        </div>
        <p className="hud-label mt-4">{BRAND.clan}</p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[0.12em] text-hud-accent">Konto erstellen</h1>
        <p className="mt-3 text-sm text-hud-muted">
          Mit Benutzername und Passwort statt Discord. Eine E-Mail-Adresse brauchst du nicht. Du bekommst alle Funktionen,
          auch die Erwähnungen und Befehle in Discord, sobald du dein Discord unter „Profil“ verknüpfst. Das brauchst du auch,
          um dein Passwort in Discord zurückzusetzen.
        </p>
        <div className="mt-6">
          <Suspense fallback={<p className="text-hud-muted">Lade …</p>}>
            <Guard />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
