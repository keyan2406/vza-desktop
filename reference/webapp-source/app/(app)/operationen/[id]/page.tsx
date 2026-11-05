import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "../../../../utils/auth";
import { first, formatDate } from "../../../../utils/format";
import RoleButton from "../../../components/RoleButton";
import SignupButton from "../../../components/SignupButton";
import StatusBadge, { type EventStatus } from "../../../components/StatusBadge";
import PageSkeleton from "../../../components/PageSkeleton";

export const metadata = { title: "Operation" };

type Name = { username: string };
type Ship = { name: string; manufacturer: string };
type Detail = {
  id: number;
  title: string;
  description: string | null;
  starts_at: string;
  min_players: number;
  points: number;
  status: EventStatus;
  event_signups:
    | { user_id: string; attended: boolean; role_id: number | null; profiles: Name | Name[] | null }[]
    | null;
  event_ship_requirements:
    | { id: number; quantity: number; ships: Ship | Ship[] | null }[]
    | null;
  event_role_requirements: { id: number; name: string; quantity: number }[] | null;
  loot_items:
    | {
        id: number;
        name: string;
        quantity: number;
        location: "player" | "vizsla_bank";
        location_note: string | null;
        status: "locked" | "released" | "awarded" | "sold";
        holder: Name | Name[] | null;
      }[]
    | null;
};

const lootStatus = {
  locked: "Gesperrt",
  released: "Freigegeben",
  awarded: "Zugeteilt",
  sold: "Verkauft",
} as const;
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "de");

async function DetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) notFound();

  const { supabase, user } = await requireProfile();

  const { data, error } = await supabase
    .from("events")
    .select(
      `id, title, description, starts_at, min_players, points, status,
       event_signups(user_id, attended, role_id, profiles(username)),
       event_ship_requirements(id, quantity, ships(name, manufacturer)),
       event_role_requirements!event_role_requirements_event_id_fkey(id, name, quantity),
       loot_items(id, name, quantity, location, location_note, status,
                  holder:profiles!loot_items_holder_id_fkey(username))`
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    return (
      <>
        <p role="alert" className="text-hud-danger">
          Die Operation konnte nicht geladen werden. Bitte versuche es später erneut.
        </p>
      </>
    );
  }
  if (!data) notFound();

  const e = data as unknown as Detail;
  const planned = e.status === "planned";
  const finished = e.status === "finished";

  const signups = (e.event_signups ?? [])
    .map((s) => ({
      userId: s.user_id,
      attended: s.attended,
      roleId: s.role_id,
      name: first(s.profiles)?.username ?? "Unbekannt",
    }))
    .sort(byName);
  const me = signups.find((s) => s.userId === user.id);
  const roles = [...(e.event_role_requirements ?? [])].sort(byName);
  const ships = (e.event_ship_requirements ?? [])
    .map((r) => ({
      id: r.id,
      quantity: r.quantity,
      name: first(r.ships)?.name ?? "Unbekannt",
      manufacturer: first(r.ships)?.manufacturer ?? "",
    }))
    .sort(byName);
  const openSignups = signups.filter((s) => s.roleId === null);
  const loot = (e.loot_items ?? [])
    .map((l) => ({ ...l, holderName: first(l.holder)?.username ?? null }))
    .sort(byName);

  return (
    <>
      <Link href="/operationen" className="text-hud-muted hover:text-hud-accent">
        ← Alle Operationen
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <StatusBadge status={e.status} />
          <h1 className="hud-h1 mt-3">{e.title}</h1>
          <p className="mt-3 text-hud-muted">{formatDate(e.starts_at)}</p>
        </div>
        {planned && (
          <div className="flex flex-wrap items-center gap-2">
            <SignupButton eventId={e.id} signedUp={!!me} />
            {me && me.roleId !== null && (
              <RoleButton eventId={e.id} roleId={null} label="Rolle offen lassen" />
            )}
          </div>
        )}
      </div>

      <dl className="mt-6 grid max-w-3xl grid-cols-2 gap-4">
        <div className="hud-panel p-4">
          <dt className="hud-label">Angemeldet</dt>
          <dd className="mt-2 font-display text-3xl font-bold tabular-nums text-hud-accent">
            {signups.length} / {e.min_players}
          </dd>
        </div>
        <div className="hud-panel p-4">
          <dt className="hud-label">Punkte</dt>
          <dd className="mt-2 font-display text-3xl font-bold tabular-nums text-hud-amber">
            +{e.points}
          </dd>
        </div>
      </dl>

      {planned && !me && (
        <p className="mt-4 max-w-3xl text-sm text-hud-muted">
          Noch unentschlossen? Mit &bdquo;Anmelden&ldquo; bist du dabei und kannst
          die Rolle später wählen. Du kannst sie auch gleich unten auswählen.
        </p>
      )}

      {e.description && (
        <section className="mt-8 max-w-3xl">
          <h2 className="hud-h2 mb-3">Beschreibung</h2>
          <p className="whitespace-pre-wrap">{e.description}</p>
        </section>
      )}

      {ships.length > 0 && (
        <section className="mt-8 max-w-3xl">
          <h2 className="hud-h2 mb-3">Benötigte Schiffe</h2>
          <ul className="hud-panel divide-y divide-hud-line">
            {ships.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-2">
                <span>
                  <span className="font-display text-lg font-semibold tabular-nums text-hud-accent">
                    {s.quantity}×
                  </span>{" "}
                  {s.name}
                </span>
                <span className="text-sm text-hud-muted">{s.manufacturer}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 max-w-3xl">
        <h2 className="hud-h2 mb-3">{finished ? "Teilnehmer" : "Anmeldungen"}</h2>

        {roles.length === 0 && signups.length === 0 && (
          <p className="text-hud-muted">Noch niemand angemeldet.</p>
        )}

        <ul className="grid gap-3">
          {roles.map((r) => {
            const members = signups.filter((s) => s.roleId === r.id);
            return (
              <li key={r.id} className="hud-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-display text-xl font-semibold uppercase tracking-wider">
                    {r.name}{" "}
                    <span className="tabular-nums text-hud-amber">
                      {members.length} / {r.quantity}
                    </span>
                  </p>
                  {planned && (
                    <RoleButton
                      eventId={e.id}
                      roleId={r.id}
                      selected={me?.roleId === r.id}
                      label={me ? "Rolle wechseln" : "Mit dieser Rolle anmelden"}
                    />
                  )}
                </div>
                <PeopleList people={members} finished={finished} />
              </li>
            );
          })}

          {(openSignups.length > 0 || roles.length === 0) && signups.length > 0 && (
            <li className="hud-panel p-4">
              <p className="font-display text-xl font-semibold uppercase tracking-wider">
                {roles.length > 0 ? "Rolle offen" : "Angemeldet"}{" "}
                <span className="tabular-nums text-hud-amber">{openSignups.length}</span>
              </p>
              <PeopleList people={openSignups} finished={finished} />
            </li>
          )}
        </ul>
      </section>

      {finished && (
        <section className="mt-8 max-w-3xl">
          <h2 className="hud-h2 mb-3">Erbeuteter Loot</h2>
          {loot.length === 0 ? (
            <p className="text-hud-muted">Für diese Operation wurde kein Loot eingetragen.</p>
          ) : (
            <div className="overflow-x-auto border border-hud-line bg-hud-panel/60">
              <table className="w-full text-left">
                <thead className="bg-hud-accent/5">
                  <tr>
                    {["Objekt", "Menge", "Liegt bei", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loot.map((l) => (
                    <tr key={l.id} className="border-t border-hud-line">
                      <td className="px-4 py-2 font-medium">{l.name}</td>
                      <td className="px-4 py-2 tabular-nums">{l.quantity}</td>
                      <td className="px-4 py-2">
                        {l.location === "vizsla_bank"
                          ? "Vizsla Bank Account"
                          : (l.holderName ?? "Unbekannt")}
                        {l.location_note && (
                          <span className="block text-sm text-hud-muted">{l.location_note}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-display font-semibold uppercase tracking-wider text-hud-amber">
                        {lootStatus[l.status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function PeopleList({
  people,
  finished,
}: {
  people: { userId: string; name: string; attended: boolean }[];
  finished: boolean;
}) {
  if (people.length === 0) {
    return <p className="mt-2 text-sm text-hud-muted">Noch niemand.</p>;
  }
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {people.map((p) => (
        <li key={p.userId} className="border border-hud-line-strong px-2.5 py-1 text-sm">
          <span className={finished && !p.attended ? "text-hud-muted line-through" : ""}>
            {p.name}
          </span>
          {finished && (
            <span className="ml-2 font-display text-xs uppercase tracking-widest text-hud-muted">
              {p.attended ? "dabei" : "nicht erschienen"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function OperationDetailPage({
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
