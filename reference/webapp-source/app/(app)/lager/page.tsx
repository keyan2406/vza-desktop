import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "../../../utils/auth";
import { first, formatAuec } from "../../../utils/format";
import ClaimButton from "../../components/ClaimButton";
import LootStatusBadge, { type LootStatus } from "../../components/LootStatusBadge";
import PageSkeleton from "../../components/PageSkeleton";
import Tabs from "../../components/Tabs";

export const metadata = { title: "Lager & Claims" };

type Name = { username: string };
type ItemRow = {
  id: number;
  name: string;
  quantity: number;
  status: LootStatus;
  price_auec: number | null;
  location: "player" | "vizsla_bank";
  location_note: string | null;
  released_at: string | null;
  winner_id: string | null;
  event_id: number | null;
  events: { title: string } | { title: string }[] | null;
  holder: Name | Name[] | null;
  winner: Name | Name[] | null;
  loot_claims:
    | { user_id: string; status: string; created_at: string; profiles: Name | Name[] | null }[]
    | null;
};

function locationText(i: ItemRow) {
  const base =
    i.location === "vizsla_bank"
      ? "Vizsla Bank Account"
      : `Spieler: ${first(i.holder)?.username ?? "unbekannt"}`;
  return i.location_note ? `${base} (${i.location_note})` : base;
}

function ItemCard({
  i,
  children,
}: {
  i: ItemRow;
  children?: React.ReactNode;
}) {
  const eventTitle = first(i.events)?.title;
  return (
    <li className="hud-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <LootStatusBadge status={i.status} />
          <h3 className="mt-2 font-display text-2xl font-semibold tracking-wide">
            <Link href={`/lager/${i.id}`} className="hover:text-hud-accent">
              {i.name}
            </Link>{" "}
            <span className="tabular-nums text-hud-accent">×{i.quantity}</span>
          </h3>
          {eventTitle && (
            <p className="mt-1 text-sm text-hud-muted">Aus: {eventTitle}</p>
          )}
        </div>
        {i.price_auec !== null && i.status !== "locked" && (
          <div className="text-right">
            <span className="hud-label">Preis</span>
            <p className="font-display text-2xl font-bold tabular-nums text-hud-amber">
              {formatAuec(i.price_auec)}
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-hud-muted">Standort: {locationText(i)}</p>
      {children}
    </li>
  );
}

async function LagerContent() {
  const { supabase, user } = await requireProfile();

  const itemsRes = await supabase
    .from("loot_items")
    .select(
      `id, name, quantity, status, price_auec, location, location_note,
       released_at, winner_id, event_id,
       events(title),
       holder:profiles!loot_items_holder_id_fkey(username),
       winner:profiles!loot_items_winner_id_fkey(username),
       loot_claims(user_id, status, created_at, profiles(username))`
    )
    .order("created_at", { ascending: false })
    .limit(300);

  const items = (itemsRes.data ?? []) as unknown as ItemRow[];

  const released = items
    .filter((i) => i.status === "released")
    .sort((a, b) => (a.released_at ?? "").localeCompare(b.released_at ?? ""));
  const mine = items.filter((i) => i.status === "awarded" && i.winner_id === user.id);
  const othersAwarded = items.filter((i) => i.status === "awarded" && i.winner_id !== user.id);
  const locked = items.filter((i) => i.status === "locked");
  const sold = items.filter((i) => i.status === "sold").slice(0, 20);
  const owed = mine.reduce((sum, i) => sum + Number(i.price_auec ?? 0), 0);

  return (
    <>
      <h1 className="hud-h1">Lager &amp; Claims</h1>
      <p className="mt-4 max-w-2xl text-hud-muted">
        Erbeuteter Org-Loot. Jeder kann bei freigegebenen Objekten einen Claim
        setzen. Ein Offizier entscheidet danach, wer das Objekt bekommt.
      </p>

      {mine.length > 0 && (
        <div className="mt-6 max-w-3xl border border-hud-amber/50 bg-hud-amber/5 p-4">
          Bitte überweise <strong className="text-hud-amber">{formatAuec(owed)}</strong> an den
          Vizsla Bank Account. Ein Officer bestätigt den Eingang und bucht das Objekt aus.
        </div>
      )}

      <Tabs
        initial={mine.length > 0 ? "mine" : "claim"}
        tabs={[
          {
            id: "claim",
            label: "Zum Claimen",
            badge: released.length,
            content:
              released.length === 0 ? (
                <p className="text-hud-muted">Zurzeit ist nichts zum Claimen freigegeben.</p>
              ) : (
                <ul className="hud-stagger grid max-w-3xl gap-4">
                  {released.map((i) => {
                    const claims = (i.loot_claims ?? []).filter((c) => c.status === "pending");
                    const mineClaim = claims.some((c) => c.user_id === user.id);
                    const names = claims
                      .sort((x, y) => x.created_at.localeCompare(y.created_at))
                      .map((c) => first(c.profiles)?.username ?? "Unbekannt");
                    return (
                      <ItemCard key={i.id} i={i}>
                        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                          <div className="max-w-md text-sm">
                            <p>
                              {claims.length === 0
                                ? "Noch kein Claim gesetzt."
                                : `${claims.length} ${claims.length === 1 ? "Claim" : "Claims"}: ${names.join(", ")}`}
                            </p>
                            {mineClaim && (
                              <p className="mt-1 text-hud-accent">Dein Claim ist gesetzt. Ein Offizier entscheidet.</p>
                            )}
                          </div>
                          <ClaimButton itemId={i.id} mine={mineClaim} />
                        </div>
                      </ItemCard>
                    );
                  })}
                </ul>
              ),
          },
          {
            id: "mine",
            label: "Meine Zuteilungen",
            badge: mine.length,
            content:
              mine.length === 0 ? (
                <p className="text-hud-muted">Dir ist zurzeit nichts zugeteilt.</p>
              ) : (
                <ul className="hud-stagger grid max-w-3xl gap-4">
                  {mine.map((i) => (
                    <ItemCard key={i.id} i={i} />
                  ))}
                </ul>
              ),
          },
          {
            id: "awarded",
            label: "Zugeteilt",
            badge: othersAwarded.length,
            content:
              othersAwarded.length === 0 ? (
                <p className="text-hud-muted">Keine offenen Zuteilungen.</p>
              ) : (
                <ul className="hud-stagger grid max-w-3xl gap-4">
                  {othersAwarded.map((i) => (
                    <ItemCard key={i.id} i={i}>
                      <p className="mt-3 text-sm">
                        Zugeteilt an{" "}
                        <span className="text-hud-amber">{first(i.winner)?.username ?? "Unbekannt"}</span>
                      </p>
                    </ItemCard>
                  ))}
                </ul>
              ),
          },
          {
            id: "locked",
            label: "Gesperrt",
            badge: locked.length,
            content:
              locked.length === 0 ? (
                <p className="text-hud-muted">Nichts wartet auf Freigabe.</p>
              ) : (
                <ul className="hud-stagger grid max-w-3xl gap-4">
                  {locked.map((i) => (
                    <ItemCard key={i.id} i={i} />
                  ))}
                </ul>
              ),
          },
          {
            id: "sold",
            label: "Verkauft",
            badge: sold.length,
            content:
              sold.length === 0 ? (
                <p className="text-hud-muted">Noch nichts verkauft.</p>
              ) : (
                <ul className="hud-stagger grid max-w-3xl gap-4">
                  {sold.map((i) => (
                    <ItemCard key={i.id} i={i} />
                  ))}
                </ul>
              ),
          },
        ]}
      />
    </>
  );
}

export default function LagerPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LagerContent />
    </Suspense>
  );
}
