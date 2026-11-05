"use client";

import { useState, useTransition } from "react";
import { startDiscordLink } from "../auth/actions";
import { CredentialsForm } from "./AuthForms";

function DiscordLink() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();

  const command = code ? `/verknuepfen code:${code}` : "";

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-hud-muted">
        Dein Konto ist noch nicht mit Discord verknüpft. Erst dann erwähnt dich der Bot bei Operationen, Anfragen und
        Loot, du kannst dein Passwort in Discord zurücksetzen und die Befehle nutzen (<code className="text-hud-text">/operationen</code>,{" "}
        <code className="text-hud-text">/blaupause</code> und mehr).
      </p>
      <ol className="max-w-2xl list-decimal space-y-1 pl-5 text-sm">
        <li>Klicke auf „Code erzeugen“.</li>
        <li>Gib den Befehl in einem Kanal unseres Discord-Servers ein. Niemand außer dir sieht die Antwort.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={busy}
          className="hud-btn"
          onClick={() =>
            start(async () => {
              setError(null);
              setCopied(false);
              const res = await startDiscordLink();
              if (res.error || !res.code) setError(res.error ?? "Das hat nicht geklappt.");
              else setCode(res.code);
            })
          }
        >
          {busy ? "Erzeuge …" : code ? "Neuen Code erzeugen" : "Code erzeugen"}
        </button>
      </div>
      {code && (
        <div role="status" className="max-w-xl space-y-2 border border-hud-accent/50 bg-hud-accent/5 p-4">
          <p className="text-sm text-hud-muted">Gib in Discord ein (15 Minuten gültig, nur einmal benutzbar):</p>
          <p className="break-all font-mono text-lg text-hud-accent">{command}</p>
          <button
            className="hud-btn-ghost hud-btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(command);
                setCopied(true);
              } catch {
                setError("Kopieren ist hier nicht erlaubt. Markiere den Befehl und kopiere ihn von Hand.");
              }
            }}
          >
            {copied ? "Kopiert" : "Befehl kopieren"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-hud-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// Anmeldung und Discord im Profil: Benutzername und Passwort, Discord verknüpfen
export default function AccountPanel({ loginName, discordLinked }: { loginName: string | null; discordLinked: boolean }) {
  return (
    <div className="space-y-10">
      <section id="anmeldung" aria-labelledby="acc-login">
        <h2 id="acc-login" className="hud-h2 mb-3">Anmeldung</h2>
        <div className="space-y-4">
          {loginName ? (
            <p className="max-w-2xl text-hud-muted">
              Dein Benutzername ist <span className="font-mono text-hud-text">{loginName}</span>. Damit und mit deinem Passwort
              meldest du dich ohne Discord an. Hier änderst du das Passwort.
            </p>
          ) : (
            <p className="max-w-2xl text-hud-muted">
              Du bist noch mit deinem früheren Discord-Konto angemeldet. Die Anmeldung mit Discord gibt es nicht mehr. Lege deshalb
              jetzt einen Benutzernamen und ein Passwort fest, sonst kommst du nach dem Abmelden nicht mehr hinein. Eine
              E-Mail-Adresse brauchst du dafür nicht. Discord bleibt für den Bot und die Befehle erhalten.
            </p>
          )}
          <CredentialsForm hasLoginName={!!loginName} />
          <p className="max-w-2xl text-sm text-hud-muted">
            Passwort vergessen? Schreibe in Discord <code className="text-hud-text">/passwort</code>. Der Bot schickt dir
            (nur für dich sichtbar) einen Link zum Festlegen eines neuen Passworts. Das geht, sobald dein Discord verknüpft ist.
          </p>
        </div>
      </section>

      <section id="discord" aria-labelledby="acc-discord">
        <h2 id="acc-discord" className="hud-h2 mb-3">Discord</h2>
        {discordLinked ? (
          <p className="max-w-2xl text-hud-muted">
            <span className="text-hud-accent">✓ Verknüpft.</span> Der Bot erwähnt dich bei Operationen, Anfragen und Loot,
            die Befehle in Discord gehören dir, und du kannst dein Passwort dort zurücksetzen.
          </p>
        ) : (
          <DiscordLink />
        )}
      </section>
    </div>
  );
}
