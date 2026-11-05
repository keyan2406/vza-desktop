import { Suspense } from "react";
import { requireProfile } from "../../../utils/auth";
import { getMyStats } from "../../../utils/stats";
import LevelPanel from "../../components/LevelPanel";
import AccountPanel from "../../components/AccountPanel";
import MotionToggle from "../../components/MotionToggle";
import ProfileForm from "../../components/ProfileForm";
import PageSkeleton from "../../components/PageSkeleton";

export const metadata = { title: "Profil" };

const roleLabel = { member: "Mitglied", officer: "Offizier", admin: "Admin" } as const;

async function ProfilContent() {
  const { supabase, user, username, role, discordLinked, loginName } = await requireProfile();
  const stats = await getMyStats(supabase, user.id);

  return (
    <>
      <h1 className="hud-h1">Profil</h1>

      <section className="mt-8">
        <h2 className="hud-h2 mb-4">Anzeigename</h2>
        <ProfileForm current={username} />
      </section>

      <div className="mt-10">
        <AccountPanel loginName={loginName} discordLinked={discordLinked} />
      </div>

      <section className="mt-10">
        <h2 className="hud-h2 mb-4">Darstellung</h2>
        <MotionToggle />
      </section>

      <section className="mt-10">
        <h2 className="hud-h2 mb-4">Dein Konto</h2>
        <p className="mb-4 text-hud-muted">
          Rolle: <span className="text-hud-amber">{roleLabel[role]}</span>. Die
          Rolle vergibt ein Admin.
        </p>
        <LevelPanel stats={stats} />
      </section>
    </>
  );
}

export default function ProfilPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfilContent />
    </Suspense>
  );
}
