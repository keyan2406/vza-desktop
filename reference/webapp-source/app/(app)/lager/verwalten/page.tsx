import { Suspense } from "react";
import Link from "next/link";
import { requireOfficer } from "../../../../utils/auth";
import { first, formatAuec, formatDate } from "../../../../utils/format";
import ConfirmSubmit from "../../../components/ConfirmSubmit";
import LootStatusBadge, { type LootStatus } from "../../../components/LootStatusBadge";
import MoveForm from "../../../components/MoveForm";
import ReleaseForm from "../../../components/ReleaseForm";
import { awardLoot, cancelAward, confirmPayment } from "./actions";
import PageSkeleton from "../../../components/PageSkeleton";
import Tabs from "../../../components/Tabs";

export const metadata = { title: "Lager verwalten" };

type Name = { username: string };
type Item = {
  id: number;
  name: string;
  quantity: number;
  status: LootStatus;
  price_auec: number | null;
  location: "player" | "vizsla_bank";
  location_note: string | null;
  holder_id: string | null;
  events: { title: string } | { title: string }[] | null;
  holder: Name | Name[] | null;
  winner: Name | Name[] | null;
  loot_claims:
    | { user_id: string; status: string; created_at: string; profiles: Name | Name[] | null }[]
    | null;
};

function where(i: Item) {
  return i.location === "vizsla_bank"
    ? "Vizsla Bank Account"
    : `Spieler: ${first(i.holder)?.username ?? "unbekannt"}`;
}

function Title({ i }: { i: Item }) {
  const event = first(i.events)?.title;
  return (
    <div className="min-w-0">
      <LootStatusBadge status={i.status} />
      <p className="mt-2 font-display text-xl font-semibold tracking-wide">
        <Link href={`/lager/${i.id}`} className="hover:text-hud-accent">
          {i.name}
        </Link>{" "}
        <span className="tabular-nums text-hud-accent">×{i.quantity}</span>
      </p>
      <p className="text-sm text-hud-muted">
        {event ? `Aus: ${event} · ` : ""}Standort: {where(i)}
      </p>
    </div>
  );
}

async function VerwaltenContent() {
  const { supabase } = await requireOfficer();

  const [itemsRes, memRes] = await Promise.all([
    supabase
      .from("loot_items")
      .select(
        `id, name, quantity, status, price_auec, location, location_note, holder_id,
         events(title),
         holder:profiles!loot_items_holder_id_fkey(username),
         winner:profiles!loot_items_winner_id_fkey(username),
         loot_claims(user_id, status, created_at, profiles(username))`
      )
      .neq("status", "sold")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("profiles").select("id, username").eq("approved", true).order("username"),
  ]);

  const items = (itemsRes.data ?? []) as unknown as Item[];
  const members = (memRes.data ?? []) as { id: string; username: string }[];
  const locked = items.filter((i) => i.status === "locked");
  const released = items.filter((i) => i.status === "released");
  const awarded = items.filter((i) => i.status === "awarded");

  return (
    <>
      <h1 className="hud-h1">Lager verwalten</h1>
      <p className="mt-4">
        <Link href="/kassenbuch" className="text-hud-accent underline">
          Zum Kassenbuch
        </Link>
      </p>

      <Tabs initial={released.some((i) => (i.loot_claims ?? []).some((c) => c.status === "pending")) ? "claims" : locked.length > 0 ? "freigabe" : awarded.length > 0 ? "zahlung" : "claims"} tabs={[
          { id: "claims", label: "Claims entscheiden", badge: released.length, content: (<div className="space-y-6">
        
        {released.length === 0 ? (
          <p className="text-hud-muted">Es ist nichts zum Claimen freigegeben.</p>
        ) : (
          <ul className="hud-stagger grid max-w-3xl gap-4">
            {released.map((i) => {
              const claims = (i.loot_claims ?? [])
                .filter((c) => c.status === "pending")
                .sort((x, y) => x.created_at.localeCompare(y.created_at));
              return (
                <li key={i.id} className="hud-panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <Title i={i} />
                    <div className="text-right">
                      <span className="hud-label">Preis</span>
                      <p className="font-display text-2xl font-bold tabular-nums text-hud-amber">
                        {formatAuec(i.price_auec)}
                      </p>
                    </div>
                  </div>
                  {claims.length === 0 ? (
                    <p className="mt-3 text-sm text-hud-muted">Noch kein Claim gesetzt.</p>
                  ) : (
                    <ul className="mt-4 divide-y divide-hud-line border border-hud-line">
                      {claims.map((c) => {
                        const name = first(c.profiles)?.username ?? "Unbekannt";
                        return (
                          <li
                            key={c.user_id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-2"
                          >
                            <span>
                              {name}{" "}
                              <span className="text-sm text-hud-muted">
                                · {formatDate(c.created_at)}
                              </span>
                            </span>
                            <form action={awardLoot}>
                              <input type="hidden" name="item_id" value={i.id} />
                              <input type="hidden" name="user_id" value={c.user_id} />
                              <ConfirmSubmit
                                message={`„${i.name}“ an ${name} zuteilen? Die anderen Claims werden abgelehnt.`}
                                className="hud-btn hud-btn-sm"
                              >
                                Zuteilen
                              </ConfirmSubmit>
                            </form>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>) },
          { id: "freigabe", label: "Zur Freigabe", badge: locked.length, content: (<div className="space-y-6">
        
        {locked.length === 0 ? (
          <p className="text-hud-muted">Nichts wartet auf Freigabe.</p>
        ) : (
          <ul className="hud-stagger grid max-w-3xl gap-4">
            {locked.map((i) => (
              <li key={i.id} className="hud-panel p-5">
                <Title i={i} />
                <ReleaseForm itemId={i.id} />
              </li>
            ))}
          </ul>
        )}
      </div>) },
          { id: "zahlung", label: "Zahlung offen", badge: awarded.length, content: (<div className="space-y-6">
        
        {awarded.length === 0 ? (
          <p className="text-hud-muted">Keine offenen Zahlungen.</p>
        ) : (
          <ul className="hud-stagger grid max-w-3xl gap-4">
            {awarded.map((i) => (
              <li key={i.id} className="hud-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <Title i={i} />
                  <div className="text-right">
                    <span className="hud-label">Käufer</span>
                    <p className="font-medium">{first(i.winner)?.username ?? "Unbekannt"}</p>
                    <p className="font-display text-2xl font-bold tabular-nums text-hud-amber">
                      {formatAuec(i.price_auec)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={confirmPayment}>
                    <input type="hidden" name="item_id" value={i.id} />
                    <ConfirmSubmit
                      message={`Zahlungseingang von ${formatAuec(i.price_auec)} bestätigen? Das Objekt wird ausgebucht.`}
                      className="hud-btn hud-btn-sm"
                    >
                      Zahlung bestätigt
                    </ConfirmSubmit>
                  </form>
                  <form action={cancelAward}>
                    <input type="hidden" name="item_id" value={i.id} />
                    <ConfirmSubmit
                      message="Zuteilung aufheben? Das Objekt ist danach wieder frei."
                      className="hud-btn-ghost hud-btn-sm"
                    >
                      Zuteilung aufheben
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>) },
          { id: "standort", label: "Standort ändern", badge: items.length, content: (<div className="space-y-6">
        
        {items.length === 0 ? (
          <p className="text-hud-muted">Das Lager ist leer.</p>
        ) : (
          <ul className="hud-stagger grid max-w-3xl gap-3">
            {items.map((i) => (
              <li key={i.id} className="hud-panel p-4">
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-display text-lg font-semibold tracking-wide">
                      {i.name} ×{i.quantity}
                    </span>{" "}
                    <span className="text-sm text-hud-muted">· {where(i)}</span>
                  </summary>
                  <MoveForm
                    itemId={i.id}
                    members={members}
                    current={{
                      location: i.location,
                      holderId: i.holder_id,
                      note: i.location_note ?? "",
                    }}
                  />
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>) },
        ]} />
    </>
  );
}

export default function LagerVerwaltenPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VerwaltenContent />
    </Suspense>
  );
}
