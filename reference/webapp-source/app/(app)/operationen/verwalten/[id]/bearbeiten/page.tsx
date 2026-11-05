import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOfficer } from "../../../../../../utils/auth";
import { first, toBerlinLocalInput } from "../../../../../../utils/format";
import NewEventForm, { type EditInit } from "../../../../../components/NewEventForm";
import PageSkeleton from "../../../../../components/PageSkeleton";

export const metadata = { title: "Operation bearbeiten" };

type Ship = { id: number; name: string; manufacturer: string };

async function BearbeitenContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) notFound();

  const { supabase } = await requireOfficer();

  const [evRes, shipRes, roleRes] = await Promise.all([
    supabase
      .from("events")
      .select(
        `id, title, description, starts_at, min_players, points, status,
         event_ship_requirements(quantity, ships(id, name, manufacturer)),
         event_role_requirements!event_role_requirements_event_id_fkey(name, quantity)`
      )
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("ships").select("id, name, manufacturer").order("name"),
    supabase.from("event_role_requirements").select("name").limit(500),
  ]);

  if (!evRes.data) notFound();
  const e = evRes.data as unknown as {
    id: number;
    title: string;
    description: string | null;
    starts_at: string;
    min_players: number;
    points: number;
    status: string;
    event_ship_requirements: { quantity: number; ships: Ship | Ship[] | null }[] | null;
    event_role_requirements: { name: string; quantity: number }[] | null;
  };

  if (e.status !== "planned") {
    return (
      <>
        <h1 className="hud-h1">Operation bearbeiten</h1>
        <p className="mt-6 max-w-xl text-hud-muted">
          Nur geplante Operationen lassen sich bearbeiten. Diese ist bereits gestartet, beendet oder abgesagt.{" "}
          <Link href="/operationen/verwalten" className="text-hud-accent underline">
            Zurück zur Verwaltung
          </Link>
        </p>
      </>
    );
  }

  const shipCatalog = (shipRes.data ?? []) as Ship[];
  const seen = new Map<string, string>();
  for (const r of (roleRes.data ?? []) as { name: string }[]) {
    const key = r.name.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, r.name.trim());
  }
  const roleSuggestions = [...seen.values()].sort((x, y) => x.localeCompare(y, "de"));

  const init: EditInit = {
    eventId: e.id,
    title: e.title,
    description: e.description ?? "",
    startsAtLocal: toBerlinLocalInput(e.starts_at),
    minPlayers: e.min_players,
    points: e.points,
    ships: (e.event_ship_requirements ?? [])
      .map((s) => ({ ship: first(s.ships), qty: s.quantity }))
      .filter((s): s is { ship: Ship; qty: number } => s.ship !== null),
    roles: (e.event_role_requirements ?? []).map((r) => ({ name: r.name, qty: r.quantity })),
  };

  return (
    <>
      <Link href="/operationen/verwalten" className="text-hud-muted hover:text-hud-accent">
        ← Zurück zur Verwaltung
      </Link>
      <h1 className="hud-h1 mt-4">Operation bearbeiten</h1>
      <p className="mt-4 max-w-2xl text-hud-muted">
        Bestehende Rollen behalten ihre Anmeldungen. Entfernst du eine Rolle, bleiben die Angemeldeten dabei,
        haben dann aber keine Rolle mehr. Bei einem neuen Beginn bekommt der Channel eine Meldung.
      </p>
      <div className="mt-8">
        <NewEventForm ships={shipCatalog} roleSuggestions={roleSuggestions} edit={init} />
      </div>
    </>
  );
}

export default function BearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BearbeitenContent params={params} />
    </Suspense>
  );
}
