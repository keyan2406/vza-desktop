"use client";

import { useMemo, useState, useTransition } from "react";
import { blockUser, setUserRole } from "../(app)/benutzer/actions";
import { createPasswordLink } from "../(app)/benutzer/password-actions";
import ConfirmSubmit from "./ConfirmSubmit";

type Role = "member" | "officer" | "admin";

export type UserRow = {
  id: string;
  username: string;
  role: Role;
  level: number;
  points: number;
  ops: number;
  joined: string;
  discordLinked: boolean;
  hasLoginName: boolean;
};

const roleLabel: Record<Role, string> = {
  member: "Mitglied",
  officer: "Offizier",
  admin: "Admin",
};

// Erzeugt für ein Mitglied einen Link zum Festlegen eines neuen Passworts (15 Minuten, einmal)
function PasswordLink({ user }: { user: UserRow }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-2">
      <button
        disabled={pending}
        className="hud-btn-ghost hud-btn-sm"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setCopied(false);
            const res = await createPasswordLink(user.id);
            if (res.error || !res.link) {
              setLink(null);
              setError(res.error ?? "Das hat nicht geklappt.");
            } else setLink(res.link);
          })
        }
      >
        {pending ? "Erzeuge …" : "Passwort-Link"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-hud-danger">
          {error}
        </p>
      )}
      {link && (
        <div role="status" className="mt-2 max-w-xs space-y-1 border border-hud-accent/50 bg-hud-accent/5 p-2 text-xs">
          <p className="text-hud-muted">Gib {user.username} diesen Link (15 Minuten, einmal benutzbar):</p>
          <p className="break-all font-mono text-hud-accent">{link}</p>
          <button
            className="hud-btn-ghost hud-btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setError("Kopieren ist hier nicht erlaubt. Markiere den Link von Hand.");
              }
            }}
          >
            {copied ? "Kopiert" : "Link kopieren"}
          </button>
        </div>
      )}
    </div>
  );
}

function RoleSelect({
  user,
  isSelf,
}: {
  user: UserRow;
  isSelf: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (isSelf) {
    return <span className="text-hud-amber">{roleLabel[user.role]} (du)</span>;
  }

  return (
    <div>
      <select
        value={user.role}
        disabled={pending}
        aria-label={`Rolle von ${user.username}`}
        onChange={(e) => {
          const next = e.target.value as Role;
          if (
            !window.confirm(
              `Rolle von ${user.username} auf „${roleLabel[next]}“ ändern?`
            )
          ) {
            return;
          }
          setSaved(false);
          startTransition(async () => {
            const res = await setUserRole(user.id, next);
            setError(res.error);
            setSaved(!res.error);
          });
        }}
        className="hud-input w-auto"
      >
        <option value="member">Mitglied</option>
        <option value="officer">Offizier</option>
        <option value="admin">Admin</option>
      </select>
      {error && (
        <p role="alert" className="mt-1 text-sm text-hud-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-1 text-sm text-hud-accent">
          Gespeichert.
        </p>
      )}
    </div>
  );
}

export default function UserTable({
  users,
  selfId,
}: {
  users: UserRow[];
  selfId: string;
}) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => u.username.toLowerCase().includes(q)) : users;
  }, [users, query]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Mitglied suchen"
        aria-label="Mitglied suchen"
        className="hud-input max-w-md"
      />

      <div className="overflow-x-auto border border-hud-line bg-hud-panel/60">
        <table className="w-full text-left">
          <thead className="bg-hud-accent/5">
            <tr>
              {["Name", "Rolle", "Level", "Punkte", "Operationen", "Dabei seit", ""].map((h, i) => (
                <th
                  key={h || i}
                  className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.id} className="border-t border-hud-line align-top hover:bg-hud-accent/5">
                <td className="px-4 py-3 font-medium">
                  {u.username}
                  {!u.discordLinked && (
                    <span className="block text-xs font-normal text-hud-muted">Discord nicht verknüpft</span>
                  )}
                  {!u.hasLoginName && (
                    <span className="block text-xs font-normal text-hud-amber">Noch kein Benutzername (nur Discord)</span>
                  )}
                  {u.id !== selfId && <PasswordLink user={u} />}
                </td>
                <td className="px-4 py-3">
                  <RoleSelect user={u} isSelf={u.id === selfId} />
                </td>
                <td className="px-4 py-3 font-display font-semibold text-hud-accent">{u.level}</td>
                <td className="px-4 py-3 font-display font-semibold tabular-nums text-hud-amber">
                  {u.points}
                </td>
                <td className="px-4 py-3 tabular-nums text-hud-muted">{u.ops}</td>
                <td className="px-4 py-3 text-sm text-hud-muted">{u.joined}</td>
                <td className="px-4 py-3 text-right">
                  {u.id !== selfId && (
                    <form action={blockUser}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <ConfirmSubmit
                        message={`${u.username} sperren? Der Zugang ist sofort weg, Punkte und Verlauf bleiben erhalten. Offene Anmeldungen und Claims werden entfernt.`}
                        className="hud-btn-ghost hud-btn-sm"
                      >
                        Sperren
                      </ConfirmSubmit>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-hud-muted">
                  Keine Treffer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-hud-muted">
        {visible.length} von {users.length} Mitgliedern
      </p>
    </div>
  );
}
