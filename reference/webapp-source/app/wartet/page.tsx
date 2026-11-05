import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../utils/auth";
import { BRAND } from "../../utils/brand";
import Monogram from "../components/Monogram";

export const metadata = { title: "Warte auf Freigabe" };

async function WartetContent() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, approved, blocked")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.approved) redirect("/dashboard");

  return (
    <div className="hud-panel w-full max-w-md p-8 text-center">
      <div className="flex justify-center">
        <Monogram size={72} />
      </div>
      <p className="hud-label mt-4">{BRAND.clan}</p>
      <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[0.12em] text-hud-accent">
        {profile?.blocked ? "Zugang gesperrt" : "Warte auf Freigabe"}
      </h1>
      <p className="mt-4 text-hud-muted">
        {profile?.blocked
          ? `Hallo ${profile?.username ?? "Pilot"}, dein Zugang wurde gesperrt. Wende dich bei Fragen an einen Admin von ${BRAND.short}.`
          : `Hallo ${profile?.username ?? "Pilot"}, dein Konto ist angelegt. Ein Admin von ${BRAND.short} muss dich noch freischalten. Sag ihm in Discord kurz Bescheid, dann geht es schnell. ${BRAND.slogan}.`}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a href="/dashboard" className="hud-btn">
          Erneut prüfen
        </a>
        <form action="/auth/signout" method="post">
          <button className="hud-btn-ghost">Abmelden</button>
        </form>
      </div>
    </div>
  );
}

export default function WartetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={<p className="text-hud-muted">Lade …</p>}>
        <WartetContent />
      </Suspense>
    </main>
  );
}
