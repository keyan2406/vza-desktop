"use client";

import { useState, useTransition } from "react";
import { updateDisplayName } from "../(app)/profil/actions";

export default function ProfileForm({ current }: { current: string }) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDone(false);
    startTransition(async () => {
      const res = await updateDisplayName(name);
      if (res.error) {
        setError(res.error);
      } else {
        setError(null);
        setDone(true);
      }
    });
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="display-name" className="hud-label mb-1">
          Anzeigename
        </label>
        <input
          id="display-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDone(false);
          }}
          minLength={2}
          maxLength={32}
          required
          className="hud-input"
        />
        <p className="mt-1 text-sm text-hud-muted">
          2 bis 32 Zeichen. So erscheinst du in Hangar, Operationen und Rangliste.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-hud-danger">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-hud-accent">
          Gespeichert.
        </p>
      )}
      <button type="submit" disabled={pending} className="hud-btn">
        {pending ? "Speichere …" : "Name speichern"}
      </button>
    </form>
  );
}
