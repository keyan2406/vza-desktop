import ConfirmSubmit from "./ConfirmSubmit";
import { deleteMember, unblockUser } from "../(app)/benutzer/actions";

export type Blocked = { id: string; username: string; discordId: string | null; since: string };

export default function BlockedUsers({ items }: { items: Blocked[] }) {
  if (items.length === 0) {
    return <p className="text-hud-muted">Niemand ist gesperrt.</p>;
  }
  return (
    <ul className="hud-panel max-w-3xl divide-y divide-hud-line">
      {items.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold tracking-wide">{p.username}</p>
            <p className="text-sm text-hud-muted">
              {p.discordId ? `Discord-ID ${p.discordId}` : "ohne Discord-Verknüpfung"} · Konto seit {p.since}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={unblockUser}>
              <input type="hidden" name="user_id" value={p.id} />
              <button className="hud-btn hud-btn-sm">Wieder freigeben</button>
            </form>
            <form action={deleteMember}>
              <input type="hidden" name="user_id" value={p.id} />
              <ConfirmSubmit
                message={`${p.username} endgültig löschen? Hangar, Blaupausen, Punkte und Anmeldungen dieses Mitglieds werden entfernt. Das lässt sich nicht rückgängig machen.`}
                className="hud-btn-ghost hud-btn-sm"
              >
                Endgültig löschen
              </ConfirmSubmit>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
