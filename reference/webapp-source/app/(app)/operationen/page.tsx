import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "../../../utils/auth";
import { first, formatDate } from "../../../utils/format";
import { getMyStats } from "../../../utils/stats";
import LevelPanel from "../../components/LevelPanel";
import SignupButton from "../../components/SignupButton";
import StatusBadge, { type EventStatus } from "../../components/StatusBadge";
import PageSkeleton from "../../components/PageSkeleton";

export const metadata = { title: "Operationen" };

type EventRow = {
  id: number;
  title: string;
  starts_at: string;
  min_players: number;
  required_roles: string | null;
  points: number;
  status: EventStatus;
  event_signups:
    | {
        user_id: string;
        attended: boolean;
        profiles: { username: string } | { username: string }[] | null;
      }[]
    | null;
};

function EventCard({ e, userId }: { e: EventRow; userId: string }) {
  const signups = e.event_signups ?? [];
  const signedUp = signups.some((s) => s.user_id === userId);
  // Bei beendeten Operationen zählen nur die, die wirklich dabei waren.
  const names = signups
    .filter((s) => e.status !== "finished" || s.attended)
    .map((s) => first(s.profiles)?.username ?? "Unbekannt")
    .sort((a, b) => a.localeCompare(b, "de"));

  return (
    <li className="hud-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <StatusBadge status={e.status} />
          <h3 className="mt-2 font-display text-2xl font-semibold tracking-wide">
            <Link href={`/operationen/${e.id}`} className="hover:text-hud-accent">
              {e.title}
            </Link>
          </h3>
          <p className="mt-1 text-hud-muted">{formatDate(e.starts_at)}</p>
        </div>
        {e.status === "planned" && (
          <SignupButton eventId={e.id} signedUp={signedUp} />
        )}
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="hud-label">Angemeldet</dt>
          <dd className="tabular-nums">
            {signups.length} / {e.min_players} min.
          </dd>
        </div>
        <div>
          <dt className="hud-label">Punkte</dt>
          <dd className="text-hud-amber">+{e.points}</dd>
        </div>
        {e.required_roles && (
          <div>
            <dt className="hud-label">Benötigt</dt>
            <dd>{e.required_roles}</dd>
          </div>
        )}
      </dl>
      {names.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer font-display text-sm font-semibold uppercase tracking-wider text-hud-accent">
            {e.status === "finished" ? "Teilnehmer" : "Wer ist dabei?"} ({names.length})
          </summary>
          <ul className="mt-3 flex flex-wrap gap-2">
            {names.map((n, i) => (
              <li key={`${n}-${i}`} className="border border-hud-line px-2 py-0.5 text-sm">
                {n}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

async function OperationenContent() {
  const { supabase, user } = await requireProfile();

  const [stats, res] = await Promise.all([
    getMyStats(supabase, user.id),
    supabase
      .from("events")
      .select(
        "id, title, starts_at, min_players, required_roles, points, status, event_signups(user_id, attended, profiles(username))"
      )
      .order("starts_at", { ascending: true }),
  ]);

  const events = (res.data ?? []) as unknown as EventRow[];
  const active = events.filter((e) => e.status === "planned" || e.status === "running");
  const past = events
    .filter((e) => e.status === "finished" || e.status === "cancelled")
    .reverse();

  return (
    <>
      <h1 className="hud-h1">Operationen</h1>

      <div className="mt-6">
        <LevelPanel stats={stats} />
      </div>

      <section className="mt-10">
        <h2 className="hud-h2 mb-4">Anstehend</h2>
        {active.length === 0 ? (
          <p className="text-hud-muted">Zurzeit sind keine Operationen geplant.</p>
        ) : (
          <ul className="hud-stagger grid max-w-3xl gap-4">
            {active.map((e) => (
              <EventCard key={e.id} e={e} userId={user.id} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="hud-h2 mb-4">Vergangen</h2>
          <ul className="hud-stagger grid max-w-3xl gap-4">
            {past.map((e) => (
              <EventCard key={e.id} e={e} userId={user.id} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function OperationenPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OperationenContent />
    </Suspense>
  );
}
