import { Suspense } from "react";
import { requireAdmin } from "../../../utils/auth";
import DiscordTest from "../../components/DiscordTest";
import RegisterCommands from "../../components/RegisterCommands";
import BlockedUsers, { type Blocked } from "../../components/BlockedUsers";
import PendingRequests, { type Pending } from "../../components/PendingRequests";
import UserTable, { type UserRow } from "../../components/UserTable";
import { CHANNELS, CHANNEL_LABEL, isConfigured } from "../../../utils/discord";
import InviteCodes, { type InviteRow } from "../../components/InviteCodes";
import PageSkeleton from "../../components/PageSkeleton";
import { nowMs } from "../../../utils/time";
import AccountCheck from "../../components/AccountCheck";
import BackupPanel from "../../components/BackupPanel";
import SpeedCheck from "../../components/SpeedCheck";
import Tabs from "../../components/Tabs";

export const metadata = { title: "Benutzerverwaltung" };

type Profile = {
  id: string;
  discord_id: string | null;
  login_name: string | null;
  approved: boolean;
  blocked: boolean;
  username: string;
  role: "member" | "officer" | "admin";
  created_at: string;
};
type Stat = { user_id: string; level: number; total_points: number; ops_count: number };

const date = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeZone: "Europe/Berlin",
});

async function BenutzerContent() {
  const { supabase, user } = await requireAdmin();

  const [profRes, statRes, inviteRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, discord_id, login_name, approved, blocked, username, role, created_at")
      .order("username"),
    supabase.from("player_stats").select("user_id, level, total_points, ops_count"),
    supabase
      .from("invite_codes")
      .select("code, note, uses, max_uses, expires_at, revoked, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const invites: InviteRow[] = (
    (inviteRes.data ?? []) as {
      code: string;
      note: string | null;
      uses: number;
      max_uses: number;
      expires_at: string | null;
      revoked: boolean;
      created_at: string;
    }[]
  ).map((r) => ({
    code: r.code,
    note: r.note,
    uses: r.uses,
    maxUses: r.max_uses,
    expiresAt: r.expires_at,
    revoked: r.revoked,
    createdAt: r.created_at,
  }));
  const siteUrl = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "") || "";
  const activeInvites = invites.filter(
    (r) => !r.revoked && r.uses < r.maxUses && (!r.expiresAt || new Date(r.expiresAt).getTime() > nowMs())
  ).length;

  const stats = new Map(
    ((statRes.data ?? []) as Stat[]).map((s) => [s.user_id, s])
  );
  const profiles = (profRes.data ?? []) as Profile[];
  const pending: Pending[] = profiles
    .filter((p) => !p.approved && !p.blocked)
    .map((p) => ({
      id: p.id,
      username: p.username,
      discordId: p.discord_id,
      since: date.format(new Date(p.created_at)),
    }));
  const blocked: Blocked[] = profiles
    .filter((p) => p.blocked)
    .map((p) => ({
      id: p.id,
      username: p.username,
      discordId: p.discord_id,
      since: date.format(new Date(p.created_at)),
    }));
  const missingLogin = profiles.filter((p) => p.approved && !p.blocked && !p.login_name).length;
  const users: UserRow[] = profiles.filter((p) => p.approved).map((p) => ({
    id: p.id,
    username: p.username,
    role: p.role,
    level: stats.get(p.id)?.level ?? 1,
    points: stats.get(p.id)?.total_points ?? 0,
    ops: stats.get(p.id)?.ops_count ?? 0,
    joined: date.format(new Date(p.created_at)),
    discordLinked: !!p.discord_id,
    hasLoginName: !!p.login_name,
  }));

  return (
    <>
      <h1 className="hud-h1">Benutzerverwaltung</h1>
      <p className="mt-4 max-w-2xl text-hud-muted">
        Hier vergibst du Rollen. <strong>Offiziere</strong> legen Operationen an,
        geben Loot frei und entscheiden über Claims. <strong>Admins</strong>{" "}
        verwalten zusätzlich die Benutzer. Neue Mitglieder erscheinen automatisch,
        sobald sie sich zum ersten Mal mit Discord oder mit einem Konto per Benutzername anmelden.
      </p>
      <Tabs initial={pending.length > 0 ? "anfragen" : "mitglieder"} tabs={[
          { id: "anfragen", label: "Anfragen", badge: pending.length, content: (<div className="space-y-6">
        
        <p className="mb-4 max-w-2xl text-hud-muted">
          Wer sich zum ersten Mal anmeldet (mit Discord oder Benutzername), sieht nichts, bis du ihn
          freigibst. Prüfe den Namen, bevor du freigibst.
        </p>
        <PendingRequests items={pending} />
      </div>) },
          { id: "mitglieder", label: "Mitglieder", badge: users.length, content: (<div className="space-y-6">
        {missingLogin > 0 && (
          <p role="status" className="max-w-3xl border border-hud-amber/60 p-4 text-sm text-hud-muted">
            <span className="text-hud-amber">{missingLogin} {missingLogin === 1 ? "Mitglied hat" : "Mitglieder haben"} noch keinen Benutzernamen</span> (in der Liste
            markiert). Die Anmeldung mit Discord gibt es nicht mehr: Wer sich abmeldet, kommt ohne Benutzernamen nicht mehr hinein. Sie sollen unter „Profil“
            Benutzername und Passwort festlegen, oder du erzeugst ihnen einen „Passwort-Link“.
          </p>
        )}
        <div className="max-w-5xl">
          <UserTable users={users} selfId={user.id} />
        </div>
      </div>) },
          { id: "einladungen", label: "Einladungen", badge: activeInvites, content: <InviteCodes rows={invites} siteUrl={siteUrl} /> },
          { id: "gesperrt", label: "Gesperrt", badge: blocked.length, content: (<div className="space-y-6">
        <p className="mb-4 max-w-2xl text-hud-muted">
          Gesperrte Mitglieder können sich nicht mehr nutzen. Ihre Punkte und ihr Verlauf bleiben erhalten, bis du sie
          endgültig löschst oder wieder freigibst.
        </p>
        <BlockedUsers items={blocked} />
      </div>) },
          { id: "sicherung", label: "Datensicherung", content: (<BackupPanel />) },
          { id: "discord", label: "Discord", content: (<div className="space-y-6">
        
        <p className="mb-4 max-w-2xl text-hud-muted">
          Neue Operationen, freigegebener Loot, Claims und Zahlungen werden automatisch in
          Discord gemeldet. Mit dem Test prüfst du, ob ein Channel erreichbar ist.
        </p>
        <RegisterCommands />
        <DiscordTest
          rows={CHANNELS.map((c) => ({
            channel: c,
            label: CHANNEL_LABEL[c],
            configured: isConfigured(c),
          }))}
        />
      </div>) },
          { id: "system", label: "System", content: (<div className="space-y-6">
        <p className="mb-4 max-w-2xl text-hud-muted">
          Hier prüfst du, ob die Anmeldung mit Benutzername eingerichtet ist und ob die Seite schnell läuft.
        </p>
        <AccountCheck />
        <SpeedCheck />
      </div>) },
        ]} />
    </>
  );
}

export default function BenutzerPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BenutzerContent />
    </Suspense>
  );
}
