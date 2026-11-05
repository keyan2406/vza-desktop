import { UsernameLoginForm } from "./AuthForms";

// Anmeldung: nur Benutzername und Passwort. Discord bleibt für den Bot (Erwähnungen, Befehle), nicht für die Anmeldung.
export default function LoginPanel() {
  return <UsernameLoginForm />;
}
