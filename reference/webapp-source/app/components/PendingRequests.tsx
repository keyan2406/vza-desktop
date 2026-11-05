import ConfirmSubmit from "./ConfirmSubmit";
import { approveUser, rejectUser } from "../(app)/benutzer/actions";

export type Pending = { id: string; username: string; discordId: string | null; since: string };

export default function PendingRequests({ items }: { items: Pending[] }) {
  if (items.length === 0) {
    return <p className="text-hud-muted">Keine offenen Anfragen.</p>;
  }
  return (
    <ul className="hud-panel max-w-3xl divide-y divide-hud-line border-hud-amber/50">
      {items.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold tracking-wide">{p.username}</p>
            <p className="text-sm text-hud-muted">
              {p.discordId ? `Discord-ID ${p.discordId}` : "mit Benutzername registriert (Discord nicht verknüpft)"} · angemeldet {p.since}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={approveUser}>
              <input type="hidden" name="user_id" value={p.id} />
              <button className="hud-btn hud-btn-sm">Freigeben</button>
            </form>
            <form action={rejectUser}>
              <input type="hidden" name="user_id" value={p.id} />
              <ConfirmSubmit
                message={`Anfrage von ${p.username} ablehnen? Das Konto wird entfernt.`}
                className="hud-btn-ghost hud-btn-sm"
              >
                Ablehnen
              </ConfirmSubmit>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
