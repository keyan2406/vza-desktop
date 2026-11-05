"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  registerWithUsername,
  resetPasswordWithCode,
  saveCredentials,
  signInWithUsername,
  type FormState,
} from "../auth/actions";
import { PASSWORD_MIN } from "../../utils/auth-validate";

const initial: FormState = {};
const NAME_HINT = "3 bis 24 Zeichen: Buchstaben (ohne Umlaute), Ziffern, Punkt, Unterstrich, Bindestrich.";

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  hint,
  maxLength,
  minLength,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="text-left">
      <label htmlFor={`f-${name}`} className="hud-label mb-1 block">
        {label}
      </label>
      <input
        id={`f-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="hud-input"
        aria-describedby={hint ? `h-${name}` : undefined}
        {...(type === "text" ? { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : {})}
      />
      {hint && (
        <p id={`h-${name}`} className="mt-1 text-xs text-hud-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function Message({ state }: { state: FormState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-left text-sm text-hud-danger">
      {state.error}
    </p>
  );
}

function PasswordToggle({ target }: { target: string[] }) {
  const [show, setShow] = useState(false);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-left text-sm text-hud-muted">
      <input
        type="checkbox"
        className="h-4 w-4 accent-hud-accent"
        checked={show}
        onChange={(e) => {
          setShow(e.target.checked);
          for (const n of target) {
            const el = document.getElementById(`f-${n}`) as HTMLInputElement | null;
            if (el) el.type = e.target.checked ? "text" : "password";
          }
        }}
      />
      Passwort anzeigen
    </label>
  );
}

// ---------- Anmelden ----------

export function UsernameLoginForm() {
  const [state, action, pending] = useActionState(signInWithUsername, initial);
  return (
    <form action={action} className="w-full space-y-4" noValidate>
      <Field label="Benutzername" name="username" autoComplete="username" defaultValue={state.values?.username} maxLength={40} />
      <Field label="Passwort" name="password" type="password" autoComplete="current-password" />
      <Message state={state} />
      <button disabled={pending} className="hud-btn w-full">
        {pending ? "Melde an …" : "Anmelden"}
      </button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/passwort-vergessen" className="text-hud-muted underline hover:text-hud-text">
          Passwort vergessen?
        </Link>
        <Link href="/registrieren" className="text-hud-accent underline">
          Neu hier? Konto erstellen
        </Link>
      </div>
    </form>
  );
}

// ---------- Registrieren ----------

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerWithUsername, initial);
  if (state.done === "registered") {
    return (
      <div role="status" className="space-y-3 text-left">
        <p className="font-display text-xl font-semibold uppercase tracking-wider text-hud-accent">Konto angelegt</p>
        <p>Ein Admin muss dein Konto noch freigeben. Melde dich dann mit deinem Benutzernamen und Passwort an.</p>
        <Link href="/" className="hud-btn inline-block">
          Zur Anmeldung
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="w-full space-y-4" noValidate>
      <Field label="Einladungscode" name="code" autoComplete="off" defaultValue={state.values?.code} placeholder="VZA-XXXX-XXXX" hint="Den Code bekommst du von einem Admin deiner Org." maxLength={40} />
      <Field label="Benutzername" name="username" autoComplete="username" defaultValue={state.values?.username} maxLength={24} hint={`${NAME_HINT} So meldest du dich an und so erscheinst du auf der Seite.`} />
      <Field label="Passwort" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} hint={`Mindestens ${PASSWORD_MIN} Zeichen.`} />
      <Field label="Passwort wiederholen" name="password2" type="password" autoComplete="new-password" />
      <PasswordToggle target={["password", "password2"]} />
      <Message state={state} />
      <button disabled={pending} className="hud-btn w-full">
        {pending ? "Lege Konto an …" : "Konto erstellen"}
      </button>
      <p className="text-sm text-hud-muted">
        Schon ein Konto?{" "}
        <Link href="/" className="text-hud-accent underline">
          Zur Anmeldung
        </Link>
      </p>
    </form>
  );
}

// ---------- Neues Passwort über den Link aus Discord ----------

export function ResetPasswordForm({ code, needsName, username }: { code: string; needsName: boolean; username: string }) {
  const [state, action, pending] = useActionState(resetPasswordWithCode, initial);
  return (
    <form action={action} className="w-full space-y-4" noValidate>
      <input type="hidden" name="code" value={code} />
      {username && (
        <p className="text-left text-sm text-hud-muted">
          Konto: <span className="text-hud-text">{username}</span>
        </p>
      )}
      {needsName && (
        <Field label="Benutzername festlegen" name="username" autoComplete="username" defaultValue={state.values?.username} maxLength={24} hint={`Damit meldest du dich künftig an. ${NAME_HINT}`} />
      )}
      <Field label="Neues Passwort" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} hint={`Mindestens ${PASSWORD_MIN} Zeichen.`} />
      <Field label="Passwort wiederholen" name="password2" type="password" autoComplete="new-password" />
      <PasswordToggle target={["password", "password2"]} />
      <Message state={state} />
      <button disabled={pending} className="hud-btn w-full">
        {pending ? "Speichere …" : "Passwort speichern"}
      </button>
    </form>
  );
}

// ---------- Im Profil: Passwort ändern, ggf. Benutzername festlegen ----------

export function CredentialsForm({ hasLoginName }: { hasLoginName: boolean }) {
  const [state, action, pending] = useActionState(saveCredentials, initial);
  if (state.done === "saved") {
    return (
      <p role="status" className="text-hud-accent">
        {hasLoginName
          ? "Dein Passwort ist geändert."
          : "Gespeichert. Du kannst dich ab jetzt auch mit Benutzername und Passwort anmelden. Die Seite zeigt deinen Benutzernamen nach dem nächsten Laden."}
      </p>
    );
  }
  return (
    <form action={action} className="max-w-md space-y-3" noValidate>
      {!hasLoginName && (
        <Field label="Benutzername festlegen" name="username" autoComplete="username" defaultValue={state.values?.username} maxLength={24} hint={NAME_HINT} />
      )}
      <Field label={hasLoginName ? "Neues Passwort" : "Passwort"} name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} hint={`Mindestens ${PASSWORD_MIN} Zeichen.`} />
      <Field label="Passwort wiederholen" name="password2" type="password" autoComplete="new-password" />
      <PasswordToggle target={["password", "password2"]} />
      <Message state={state} />
      <button disabled={pending} className="hud-btn hud-btn-sm">
        {pending ? "Speichere …" : hasLoginName ? "Passwort ändern" : "Benutzername und Passwort speichern"}
      </button>
    </form>
  );
}
