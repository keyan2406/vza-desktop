import { Suspense } from "react";
import Link from "next/link";
import { after } from "next/server";
import { requireProfile } from "../../../utils/auth";
import { getMyStats } from "../../../utils/stats";
import LevelPanel from "../../components/LevelPanel";
import Onboarding from "../../components/Onboarding";
import { BRAND } from "../../../utils/brand";
import PageSkeleton from "../../components/PageSkeleton";

export const metadata = { title: "Dashboard" };

const tiles = [
  {
    href: "/operationen",
    title: "Operationen",
    text: "Anstehende Events ansehen und dich anmelden.",
  },
  {
    href: "/hangar",
    title: "Flotte & Hangare",
    text: "Schiffe eintragen und die Hangare der Org ansehen.",
  },
  {
    href: "/lager",
    title: "Lager & Claims",
    text: "Loot claimen und offene Zuteilungen sehen.",
  },
  {
    href: "/blueprints",
    title: "Blaupausen",
    text: "Eigene Sammlung pflegen und sehen, wer was herstellen kann.",
  },
  {
    href: "/rangliste",
    title: "Rangliste",
    text: "Punkte und Level aller Mitglieder.",
  },
];

async function DashboardContent() {
  const { supabase, user, username, role, discordLinked, loginName } = await requireProfile();
  // Höchstens einmal am Tag: Inaktivitäts-Abzug. Läuft nach der Antwort, der Zeitplan der Datenbank erledigt es nachts.
  after(async () => {
    await supabase.rpc("run_daily_maintenance");
  });

  const count = async (table: string, column: string) =>
    (
      await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, user.id)
    ).count ?? 0;
  const [stats, ships, blueprints, signups, pending] = await Promise.all([
    getMyStats(supabase, user.id),
    count("hangar_ships", "user_id"),
    count("player_blueprints", "user_id"),
    count("event_signups", "user_id"),
    role === "admin"
      ? supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("approved", false)
          .eq("blocked", false)
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  return (
    <>
      <p className="hud-label mb-2">{BRAND.clan} · {BRAND.slogan}</p>
      <h1 className="hud-h1">Willkommen, {username}</h1>

      {pending > 0 && (
        <Link
          href="/benutzer"
          className="mt-6 block max-w-xl border border-hud-amber/60 bg-hud-amber/5 p-4 hover:bg-hud-amber/10"
        >
          <span className="font-display text-lg font-semibold uppercase tracking-wider text-hud-amber">
            {pending} {pending === 1 ? "Anfrage wartet" : "Anfragen warten"} auf Freigabe
          </span>
          <span className="block text-sm text-hud-muted">Zur Benutzerverwaltung</span>
        </Link>
      )}

      {!loginName && (
        <Link href="/profil#anmeldung" className="hud-panel hud-lift mb-4 block max-w-3xl border-hud-amber p-4">
          <span className="font-display text-lg font-semibold uppercase tracking-wider text-hud-amber">Wichtig: Benutzername und Passwort festlegen</span>
          <span className="block text-sm text-hud-muted">
            Die Anmeldung mit Discord gibt es nicht mehr. Lege jetzt unter „Profil“ einen Benutzernamen und ein Passwort fest, sonst kommst du nach dem
            Abmelden nicht mehr hinein. Es dauert eine Minute.
          </span>
        </Link>
      )}

      <Onboarding
        steps={[
          { done: ships > 0, label: "Schiffe in deinen Hangar eintragen", href: "/hangar" },
          { done: blueprints > 0, label: "Blaupausen aus dem Launcher importieren", href: "/blueprints" },
          { done: signups > 0, label: "Dich für eine Operation anmelden", href: "/operationen" },
          { done: discordLinked, label: "Discord verknüpfen (für Erwähnungen und Befehle)", href: "/profil#discord" },
        ]}
      />

      <div className="mt-6">
        <LevelPanel stats={stats} />
      </div>

      <div className="hud-stagger mt-8 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="hud-panel hud-lift block p-5"
          >
            <span className="hud-label">Modul</span>
            <span className="mt-1 block font-display text-2xl font-semibold uppercase tracking-wider">
              {t.title}
            </span>
            <span className="mt-2 block text-sm text-hud-muted">{t.text}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
