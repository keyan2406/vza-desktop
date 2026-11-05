// Prüfregeln für die Anmelde-Formulare. Reine Logik ohne Server-Abhängigkeit, damit sie sich testen lässt.

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

export function validatePassword(raw: unknown): Valid<string> {
  const v = String(raw ?? "");
  if (v.length < PASSWORD_MIN) return { ok: false, error: `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.` };
  if (v.length > PASSWORD_MAX) return { ok: false, error: `Das Passwort darf höchstens ${PASSWORD_MAX} Zeichen haben.` };
  if (v.trim().length === 0) return { ok: false, error: "Das Passwort darf nicht nur aus Leerzeichen bestehen." };
  return { ok: true, value: v };
}

// ---------- Benutzername ----------

export const LOGIN_NAME_RE = /^[a-z0-9][a-z0-9._-]{2,23}$/;

// Namen, die nach Amt oder Technik klingen und niemandem gehören sollen
const RESERVED = new Set([
  "admin", "administrator", "root", "system", "support", "service", "staff", "officer", "mod", "moderator",
  "vza", "bot", "discord", "everyone", "here", "null", "undefined", "anonymous", "owner", "info",
]);

// Ergebnis ist die klein geschriebene Form (so wird gespeichert und angemeldet), "display" ist die Schreibweise der Eingabe.
export function validateLoginName(raw: unknown): Valid<string> & { display?: string } {
  const typed = String(raw ?? "").trim();
  if (!typed) return { ok: false, error: "Bitte gib einen Benutzernamen ein." };
  const v = typed.toLowerCase();
  if (v.length < 3 || v.length > 24) return { ok: false, error: "Der Benutzername braucht 3 bis 24 Zeichen." };
  if (!LOGIN_NAME_RE.test(v)) {
    return { ok: false, error: "Erlaubt sind Buchstaben ohne Umlaute, Ziffern sowie . _ - (kein Leerzeichen, am Anfang ein Buchstabe oder eine Ziffer)." };
  }
  if (/[._-]{2,}/.test(v) || /[._-]$/.test(v)) return { ok: false, error: "Der Benutzername darf nicht mit einem Sonderzeichen enden oder zwei davon nebeneinander haben." };
  if (RESERVED.has(v)) return { ok: false, error: "Diesen Benutzernamen kannst du nicht nehmen. Wähle einen anderen." };
  return { ok: true, value: v, display: typed };
}

// Supabase verlangt für die Passwort-Anmeldung eine Adresse. Sie wird nie benutzt und nie angeschrieben.
export const AUTH_DOMAIN_DEFAULT = "vza.invalid";
export const toAuthEmail = (loginName: string, domain: string = AUTH_DOMAIN_DEFAULT) => `${loginName}@${domain}`;

// ---------- Codes ----------

// Einladungscode: Groß-/Kleinschreibung und Leerzeichen spielen keine Rolle
export function normalizeInviteCode(raw: unknown): Valid<string> {
  const v = String(raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!v) return { ok: false, error: "Bitte gib deinen Einladungscode ein." };
  if (!/^[A-Z0-9-]{6,32}$/.test(v)) return { ok: false, error: "Der Einladungscode sieht nicht richtig aus." };
  return { ok: true, value: v };
}

// Code für /verknuepfen: genau 8 Zeichen
export function normalizeLinkCode(raw: unknown): Valid<string> {
  const v = String(raw ?? "").replace(/[\s-]+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(v)) return { ok: false, error: "Der Code hat 8 Zeichen aus Buchstaben und Ziffern." };
  return { ok: true, value: v };
}

// Code aus dem Passwort-Link: 16 Zeichen, mit oder ohne Bindestriche
export function normalizeResetCode(raw: unknown): Valid<string> {
  const v = String(raw ?? "").replace(/[\s-]+/g, "").toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{16}$/.test(v)) return { ok: false, error: "Der Link ist nicht vollständig. Hole dir in Discord mit /passwort einen neuen." };
  return { ok: true, value: v };
}

// Fehlermeldungen von Supabase in verständliches Deutsch übersetzen
export function authErrorText(code: string | undefined, message?: string): string {
  switch (code) {
    case "weak_password":
      return "Das Passwort ist zu einfach. Nimm ein längeres, das nicht leicht zu erraten ist.";
    case "over_request_rate_limit":
      return "Zu viele Versuche in kurzer Zeit. Warte ein wenig und versuche es dann noch einmal.";
    case "same_password":
      return "Das neue Passwort muss sich vom alten unterscheiden.";
    case "reauthentication_needed":
    case "session_not_found":
    case "bad_jwt":
      return "Deine Anmeldung ist abgelaufen. Melde dich bitte neu an.";
    default:
      return /Einladungscode/i.test(message ?? "")
        ? "Der Einladungscode ist ungültig, abgelaufen oder aufgebraucht."
        : "Das hat nicht geklappt. Bitte versuche es noch einmal.";
  }
}
