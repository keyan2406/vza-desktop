import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "../../../../utils/auth";
import { first, formatAuec, formatDate } from "../../../../utils/format";
import LootStatusBadge, { type LootStatus } from "../../../components/LootStatusBadge";
import PageSkeleton from "../../../components/PageSkeleton";

export const metadata = { title: "Lager-Objekt" };

type Name = { username: string };
type Item = {
  id: number;
  name: string;
  quantity: number;
  status: LootStatus;
  price_auec: number | null;
  location: "player" | "vizsla_bank";
  location_note: string | null;
  released_at: string | null;
  event_id: number | null;
  events: { title: string } | { title: string }[] | null;
  holder: Name | Name[] | null;
  winner: Name | Name[] | null;
  loot_claims:
    | { user_id: string; status: string; created_at: string; profiles: Name | Name[] | null }[]
    | null;
};
type LogRow = {
  id: number;
  action: string;
  detail: string | null;
  created_at: string;
  profiles: Name | Name[] | null;
};

const claimLabel: Record<string, string> = {
  pending: "Offen",
  won: "Gewonnen",
  lost: "Nicht zugeteilt",
};

async function DetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) notFound();

  const { supabase } = await requireProfile();

  const [itemRes, logRes] = await Promise.all([
    supabase
      .from("loot_items")
      .select(
        `id, name, quantity, status, price_auec, location, location_note, released_at, event_id,
         events(title),
         holder:profiles!loot_items_holder_id_fkey(username),
         winner:profiles!loot_items_winner_id_fkey(username),
         loot_claims(user_id, status, created_at, profiles(username))`
      )
      .eq("id", itemId)
      .maybeSingle(),
    supabase
      .from("loot_log")
      .select("id, action, detail, created_at, profiles(username)")
      .eq("item_id", itemId)
      .order("created_at", { ascending: true }),
  ]);

  if (itemRes.error) {
    return (
      <>
        <p role="alert" className="text-hud-danger">
          Das Objekt konnte nicht geladen werden. Bitte versuche es später erneut.
        </p>
      </>
    );
  }
  if (!itemRes.data) notFound();

  const i = itemRes.data as unknown as Item;
  const log = (logRes.data ?? []) as unknown as LogRow[];
  const claims = [...(i.loot_claims ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const where =
    i.location === "vizsla_bank"
      ? "Vizsla Bank Account"
      : `Spieler: ${first(i.holder)?.username ?? "unbekannt"}`;

  return (
    <>
      <Link href="/lager" className="text-hud-muted hover:text-hud-accent">
        ← Zurück zum Lager
      </Link>

      <div className="mt-4">
        <LootStatusBadge status={i.status} />
        <h1 className="hud-h1 mt-3">
          {i.name} <span className="tabular-nums text-hud-accent">×{i.quantity}</span>
        </h1>
      </div>

      <dl className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="hud-panel p-4">
          <dt className="hud-label">Standort</dt>
          <dd className="mt-2">
            {where}
            {i.location_note && <span className="block text-sm text-hud-muted">{i.location_note}</span>}
          </dd>
        </div>
        {i.price_auec !== null && i.status !== "locked" && (
          <div className="hud-panel p-4">
            <dt className="hud-label">Preis</dt>
            <dd className="mt-2 font-display text-2xl font-bold tabular-nums text-hud-amber">
              {formatAuec(i.price_auec)}
            </dd>
          </div>
        )}
        {first(i.events)?.title && (
          <div className="hud-panel p-4">
            <dt className="hud-label">Aus der Operation</dt>
            <dd className="mt-2">
              {i.event_id ? (
                <Link href={`/operationen/${i.event_id}`} className="hover:text-hud-accent">
                  {first(i.events)?.title}
                </Link>
              ) : (
                first(i.events)?.title
              )}
            </dd>
          </div>
        )}
        {first(i.winner)?.username && (
          <div className="hud-panel p-4">
            <dt className="hud-label">{i.status === "sold" ? "Gekauft von" : "Zugeteilt an"}</dt>
            <dd className="mt-2">{first(i.winner)?.username}</dd>
          </div>
        )}
      </dl>

      {claims.length > 0 && (
        <section className="mt-8 max-w-3xl">
          <h2 className="hud-h2 mb-3">Claims</h2>
          <ul className="hud-panel divide-y divide-hud-line">
            {claims.map((c) => (
              <li key={c.user_id} className="flex items-center justify-between gap-4 px-4 py-2">
                <span>{first(c.profiles)?.username ?? "Unbekannt"}</span>
                <span className="text-sm text-hud-muted">
                  {claimLabel[c.status] ?? c.status} · {formatDate(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 max-w-3xl">
        <h2 className="hud-h2 mb-3">Protokoll</h2>
        {log.length === 0 ? (
          <p className="text-hud-muted">Noch keine Einträge.</p>
        ) : (
          <ol className="hud-panel divide-y divide-hud-line">
            {log.map((l) => (
              <li key={l.id} className="px-4 py-3">
                <p>{l.detail ?? l.action}</p>
                <p className="mt-1 text-sm text-hud-muted">
                  {formatDate(l.created_at)}
                  {first(l.profiles)?.username ? ` · ${first(l.profiles)?.username}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

export default function LootDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DetailContent params={params} />
    </Suspense>
  );
}
