import Count from "../../components/Count";
import { Suspense } from "react";
import { requireProfile } from "../../../utils/auth";
import AddShipForm from "../../components/AddShipForm";
import HangarBrowser, { type HangarRow } from "../../components/HangarBrowser";
import { removeShip } from "./actions";
import PageSkeleton from "../../components/PageSkeleton";
import Tabs from "../../components/Tabs";

export const metadata = { title: "Flotte & Hangare" };

type ShipInfo = { name: string; manufacturer: string };
type RawRow = {
  id: number;
  user_id: string;
  source: "ingame" | "pledge";
  pledge_value_eur: number | string | null;
  ships: ShipInfo | ShipInfo[] | null;
  profiles: { username: string } | { username: string }[] | null;
};

const first = <T,>(x: T | T[] | null): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : x;

const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

async function HangarContent() {
  const { supabase, user } = await requireProfile();

  const [shipsRes, rowsRes] = await Promise.all([
    supabase.from("ships").select("id, name, manufacturer").order("name"),
    supabase
      .from("hangar_ships")
      .select(
        "id, user_id, source, pledge_value_eur, ships(name, manufacturer), profiles(username)"
      )
      .order("created_at", { ascending: false }),
  ]);

  const ships = (shipsRes.data ?? []) as {
    id: number;
    name: string;
    manufacturer: string;
  }[];
  const raw = (rowsRes.data ?? []) as unknown as RawRow[];

  const rows = raw.map((r) => ({
    id: r.id,
    userId: r.user_id,
    player: first(r.profiles)?.username ?? "Unbekannt",
    ship: first(r.ships)?.name ?? "Unbekannt",
    manufacturer: first(r.ships)?.manufacturer ?? "",
    source: r.source,
    value: r.pledge_value_eur === null ? 0 : Number(r.pledge_value_eur),
  }));

  const ingame = rows.filter((r) => r.source === "ingame").length;
  const pledges = rows.filter((r) => r.source === "pledge");
  const pledgeValue = pledges.reduce((sum, r) => sum + r.value, 0);
  const players = new Set(rows.map((r) => r.userId)).size;

  const mine = rows.filter((r) => r.userId === user.id);
  const browserRows: HangarRow[] = rows.map((r) => ({
    id: r.id,
    player: r.player,
    ship: r.ship,
    manufacturer: r.manufacturer,
    source: r.source,
    value: r.value,
  }));

  const stats = [
    { label: "Schiffe Ingame", value: ingame, amber: false },
    { label: "Schiffe als Pledge", value: pledges.length, amber: false },
    { label: "Hangarwert (Pledges)", value: euro.format(pledgeValue), amber: true },
    { label: "Spieler mit Hangar", value: players, amber: false },
  ];

  return (
    <>
      <h1 className="hud-h1">Flotte &amp; Hangare</h1>
      <p className="mt-4 max-w-2xl text-hud-muted">
        Alle Schiffe der Org auf einen Blick. Trage deine eigenen unter &bdquo;Mein Hangar&ldquo; ein.
      </p>

      <dl className="hud-stagger mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="hud-panel p-4">
            <dt className="hud-label">{s.label}</dt>
            <dd
              className={`mt-2 font-display text-3xl font-bold tabular-nums ${
                s.amber ? "text-hud-amber" : "text-hud-accent"
              }`}
            >
              {typeof s.value === "number" ? <Count value={s.value} /> : s.value}
            </dd>
          </div>
        ))}
      </dl>

      <Tabs
        initial={mine.length === 0 ? "mine" : "all"}
        tabs={[
          {
            id: "all",
            label: "Alle Hangare",
            badge: rows.length,
            content: <HangarBrowser rows={browserRows} />,
          },
          {
            id: "mine",
            label: "Mein Hangar",
            badge: mine.length,
            content: (
              <div className="space-y-10">
                <section>
                  <h2 className="hud-h2 mb-4">Schiff hinzufügen</h2>
                  <AddShipForm ships={ships} />
                </section>
                <section>
                  <h2 className="hud-h2 mb-4">Deine Schiffe</h2>
                  {mine.length === 0 ? (
                    <p className="text-hud-muted">Du hast noch keine Schiffe eingetragen.</p>
                  ) : (
                    <ul className="hud-panel max-w-2xl divide-y divide-hud-line">
                      {mine.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div>
                            <p className="font-display text-lg font-semibold tracking-wide">{r.ship}</p>
                            <p className="text-sm text-hud-muted">
                              {r.manufacturer} ·{" "}
                              {r.source === "pledge"
                                ? `Pledge${r.value > 0 ? ` (${euro.format(r.value)})` : ""}`
                                : "Ingame gekauft"}
                            </p>
                          </div>
                          <form action={removeShip}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="hud-btn-ghost hud-btn-sm">Entfernen</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

export default function HangarPage() {
  return (
    <Suspense
      fallback={<PageSkeleton />}
    >
      <HangarContent />
    </Suspense>
  );
}
