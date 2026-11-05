import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOfficer } from "../../../../../utils/auth";
import { formatDate } from "../../../../../utils/format";
import AttendanceForm from "../../../../components/AttendanceForm";
import StatusBadge, { type EventStatus } from "../../../../components/StatusBadge";
import PageSkeleton from "../../../../components/PageSkeleton";

export const metadata = { title: "Operation abschließen" };

type EventRow = {
  id: number;
  title: string;
  starts_at: string;
  points: number;
  status: EventStatus;
  event_signups: { user_id: string }[] | null;
};

async function AbschlussContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) notFound();

  const { supabase } = await requireOfficer();

  const [evRes, memRes, lootRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, points, status, event_signups(user_id)")
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("profiles").select("id, username").eq("approved", true).order("username"),
    supabase.from("loot_items").select("name").limit(1000),
  ]);
  // Bisher benutzte Objektnamen als Vorschlag (verhindert Schreibvarianten)
  const itemSuggestions = [
    ...new Set(((lootRes.data ?? []) as { name: string }[]).map((l) => l.name.trim())),
  ].sort((x, y) => x.localeCompare(y, "de"));

  if (!evRes.data) notFound();
  const e = evRes.data as unknown as EventRow;

  const signedUp = new Set((e.event_signups ?? []).map((s) => s.user_id));
  const members = ((memRes.data ?? []) as { id: string; username: string }[]).map(
    (m) => ({ id: m.id, username: m.username, signedUp: signedUp.has(m.id) })
  );
  const open = e.status === "planned" || e.status === "running";

  return (
    <>
      <Link href="/operationen/verwalten" className="text-hud-muted hover:text-hud-accent">
        ← Zurück zur Verwaltung
      </Link>

      <div className="mt-4">
        <StatusBadge status={e.status} />
        <h1 className="hud-h1 mt-3">{e.title}</h1>
        <p className="mt-3 text-hud-muted">{formatDate(e.starts_at)}</p>
      </div>

      <section className="mt-8">
        <h2 className="hud-h2 mb-2">Operation abschließen</h2>
        {open ? (
          <>
            <p className="mb-4 max-w-2xl text-hud-muted">
              Hake alle ab, die wirklich dabei waren (Angemeldete sind
              vorausgewählt, Spontane kannst du ergänzen) und trage den
              erbeuteten Loot ein.
            </p>
            <AttendanceForm
              eventId={e.id}
              points={e.points}
              members={members}
              itemSuggestions={itemSuggestions}
            />
          </>
        ) : (
          <p className="text-hud-muted">
            Diese Operation ist bereits{" "}
            {e.status === "finished" ? "abgeschlossen" : "abgesagt"}.{" "}
            <Link href={`/operationen/${e.id}`} className="text-hud-accent underline">
              Zur Detailansicht
            </Link>
          </p>
        )}
      </section>
    </>
  );
}

export default function AbschlussPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AbschlussContent params={params} />
    </Suspense>
  );
}
