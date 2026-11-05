import { Suspense } from "react";
import Link from "next/link";
import { requireOfficer } from "../../../../utils/auth";
import { formatDate } from "../../../../utils/format";
import ConfirmSubmit from "../../../components/ConfirmSubmit";
import NewEventForm from "../../../components/NewEventForm";
import StatusBadge, { type EventStatus } from "../../../components/StatusBadge";
import { cancelEvent, deleteEvent, startEvent } from "./actions";
import PageSkeleton from "../../../components/PageSkeleton";
import Tabs from "../../../components/Tabs";

export const metadata = { title: "Operationen verwalten" };

type Row = {
  id: number;
  title: string;
  starts_at: string;
  points: number;
  status: EventStatus;
  event_signups: { user_id: string }[] | null;
};

function IdField({ id }: { id: number }) {
  return <input type="hidden" name="event_id" value={id} />;
}

async function VerwaltenContent() {
  const { supabase } = await requireOfficer();

  const [evRes, shipRes, roleRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, points, status, event_signups(user_id)")
      .order("starts_at", { ascending: false }),
    supabase.from("ships").select("id, name, manufacturer").order("name"),
    supabase.from("event_role_requirements").select("name").limit(500),
  ]);

  const events = (evRes.data ?? []) as unknown as Row[];
  const ships = (shipRes.data ?? []) as { id: number; name: string; manufacturer: string }[];
  // Schon benutzte Rollennamen als Vorschlag, ohne Doppelte (Groß/Klein egal)
  const seen = new Map<string, string>();
  for (const r of (roleRes.data ?? []) as { name: string }[]) {
    const key = r.name.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, r.name.trim());
  }
  const roleSuggestions = [...seen.values()].sort((x, y) => x.localeCompare(y, "de"));

  return (
    <>
      <h1 className="hud-h1">Operationen verwalten</h1>

      <Tabs initial={events.length === 0 ? "neu" : "alle"} tabs={[
          { id: "alle", label: "Alle Operationen", badge: events.length, content: (<div className="space-y-6">
        
        {events.length === 0 ? (
          <p className="text-hud-muted">Noch keine Operationen angelegt.</p>
        ) : (
          <ul className="hud-stagger grid max-w-3xl gap-3">
            {events.map((e) => (
              <li key={e.id} className="hud-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StatusBadge status={e.status} />
                    <p className="mt-2 font-display text-xl font-semibold tracking-wide">
                      <Link href={`/operationen/${e.id}`} className="hover:text-hud-accent">
                        {e.title}
                      </Link>
                    </p>
                    <p className="text-sm text-hud-muted">
                      {formatDate(e.starts_at)} · {(e.event_signups ?? []).length} angemeldet · +{e.points} Punkte
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {e.status === "planned" && (
                      <form action={startEvent}>
                        <IdField id={e.id} />
                        <button className="hud-btn hud-btn-sm">Starten</button>
                      </form>
                    )}
                    {e.status === "planned" && (
                      <Link
                        href={`/operationen/verwalten/${e.id}/bearbeiten`}
                        className="hud-btn-ghost hud-btn-sm"
                      >
                        Bearbeiten
                      </Link>
                    )}
                    {(e.status === "planned" || e.status === "running") && (
                      <Link
                        href={`/operationen/verwalten/${e.id}`}
                        className="hud-btn hud-btn-sm"
                      >
                        Abschließen
                      </Link>
                    )}
                    {(e.status === "planned" || e.status === "running") && (
                      <form action={cancelEvent}>
                        <IdField id={e.id} />
                        <ConfirmSubmit
                          message="Operation wirklich absagen?"
                          className="hud-btn-ghost hud-btn-sm"
                        >
                          Absagen
                        </ConfirmSubmit>
                      </form>
                    )}
                    {(e.status === "planned" || e.status === "cancelled") && (
                      <form action={deleteEvent}>
                        <IdField id={e.id} />
                        <ConfirmSubmit
                          message="Operation endgültig löschen?"
                          className="hud-btn-ghost hud-btn-sm"
                        >
                          Löschen
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>) },
          { id: "neu", label: "Neue Operation", content: (<div className="space-y-6">
        
        <NewEventForm ships={ships} roleSuggestions={roleSuggestions} />
      </div>) },
        ]} />
    </>
  );
}

export default function VerwaltenPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VerwaltenContent />
    </Suspense>
  );
}
