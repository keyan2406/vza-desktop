# Zielbild: Eigenständiges Programm ohne die WebApp

## Was „autonom“ hier bedeutet
Das Programm hat eine **eigene Oberfläche** (kein eingebetteter Browser) mit **allen Funktionen der WebApp 1:1** plus Zusatzfunktionen. Es läuft, auch wenn die Webseite (Vercel) abgeschaltet ist. Gemeinsame Daten der Org (Operationen, Anmeldungen, Loot, Kasse, Blaupausen) brauchen aber **einen gemeinsamen Speicher im Internet**, sonst könnten Mitglieder nichts teilen. Dieser Speicher bleibt die vorhandene **Supabase-Datenbank** (gleiche Konten, gleiche Daten, kostenlos). Wegfallen soll nur die **Webseite** (Next.js bei Vercel).

```
  Mitglied A                       Mitglied B
 ┌─────────────┐                  ┌─────────────┐
 │ VZA Desktop │                  │ VZA Desktop │        (neu)
 └──────┬──────┘                  └──────┬──────┘
        │  supabase-js (öffentlicher Schlüssel, RLS)
        ▼                                ▼
 ┌────────────────────────── Supabase (bleibt) ──────────────────────────┐
 │  Anmeldung · Datenbank + Regeln (RLS) · Funktionen (RPC)              │
 │  NEU: Edge Functions (TypeScript/Deno) = Ersatz für die Server-Teile  │
 │  pg_cron + pg_net (Zeitplan) ruft die Edge Function für Erinnerungen   │
 └───────────────┬───────────────────────────────────────────────────────┘
                 ▼
            Discord (Bot: Befehle, Meldungen, Server-Termine)
```

## Was ins Programm kommt und was einen Server braucht
**Direkt im Programm** (Datenbankfunktionen und Tabellen mit RLS, siehe `02-schnittstellen-datenbank.md`, Abschnitt 1): fast alle Seiten und Aktionen von Mitgliedern, Officern und Admins. Die Zugriffskontrolle liegt bereits in der Datenbank, nicht in der WebApp.

**Braucht einen Server (Geheimnisse oder kein Nutzer angemeldet)** – hier entsteht der Ersatz für die WebApp, jeweils als **Supabase Edge Function** (kostenlos im Free-Tarif, Grenzen beim Umsetzen aktuell prüfen):
| Edge Function | Ersetzt | Warum nicht im Programm |
|---|---|---|
| `login` | Auflösen Benutzername → interne Adresse, Anmeldeversuche begrenzen | Zuordnung darf nur der Server kennen |
| `register` | Registrierung mit Einladungscode | Konto anlegen braucht den Dienst-Schlüssel |
| `reset-password` | Passwort-Link einlösen (der Link ist ein Verweis `vza://passwort-neu?code=…`) | Dienst-Schlüssel |
| `discord-interactions` | `app/api/discord/interactions` | Discord ruft eine Internet-Adresse auf; prüft Signatur (Ed25519), braucht Bot-Schlüssel |
| `discord-notify` | `eventChanged`, `announce`, Meldungen für Loot, Anfragen, Kasse, Admin | Bot-Schlüssel. Das Programm ruft sie nach einer Aktion auf (der Aufrufer wird per Token und Rolle geprüft) |
| `cron-reminders` | `app/api/cron/reminders` | Zeitplan (pg_cron → pg_net) ruft sie alle 5 Minuten auf: Erinnerungen, automatische Absage nach 3 Tagen |
| `catalog-sync`, `item-enrich` | Katalog-Abgleich und Rezepte/Beschreibungen aus der Wiki-API | Schreiben in `catalog_blueprints` braucht den Dienst-Schlüssel (oder eine neue Funktion mit Officer-Prüfung) |
| `backup-export` | `/api/export` | liest alle Tabellen (Admin) |
Der PC-Helfer samt Schlüssel (`/api/import/*`) **entfällt**: Das Programm ist angemeldet und ruft `add_my_blueprints` direkt auf.

Wiederverwendung: Die Programmlogik dieser Teile steht fertig und getestet im Quelltext (`reference/webapp-source/utils/discord-*.ts`, `auto-cancel.ts`, `catalog-sync.ts`, `auth-*.ts`, `export-data.ts`; Tests in `reference/webapp-source/tests`). Sie ist größtenteils reines TypeScript ohne Next.js und lässt sich in Deno übernehmen. **Verhalten und Meldungstexte müssen gleich bleiben** (die Tests mitnehmen und gegen den kopierten Code laufen lassen).

## Aufbau des Programms (Vorschlag)
- Monorepo: `apps/desktop` (Electron: `main/`, `preload/`, `renderer/` mit React + Vite + TypeScript + Tailwind v4, HUD-Design aus `08-design.md`), `packages/core` (gemeinsame reine Logik: Log-Erkennung, Katalog, Formatierungen, Rechenregeln wie Level), `supabase/functions/*` (Edge Functions), `supabase/migrations/*` (neue SQL-Dateien ab 31).
- Daten holen: `@supabase/supabase-js` im Renderer mit dem öffentlichen Schlüssel. Sitzung wird über die Hauptseite verschlüsselt gespeichert (`safeStorage`). Abfragen wie in `02-…` und `09-…`.
- **Zwischenspeicher für Offline-Lesen** (Upgrade): lokale Datenbank (SQLite) mit Katalog, eigenen Daten, nächsten Operationen. Schreiben nur online (später optional mit Warteschlange).
- Hintergrunddienste im Hauptprozess: Log-Beobachter (`03-spiel-logs.md`), Benachrichtigungen (Abo auf Datenbankänderungen per **Supabase Realtime** für Operationen und Anfragen an mich, mit Abfrage als Rückfall), Update-Prüfung.

## Auslieferung der Server-Teile
- Werkzeug: **Supabase CLI** (Keyan installiert es einmalig, Claude Code erklärt wie). Bereitstellen mit `supabase functions deploy <name>`. Geheimnisse mit `supabase secrets set …` (Discord-Schlüssel, Cron-Geheimnis; der Dienst-Schlüssel ist in Edge Functions automatisch vorhanden). **Keine Geheimnisse ins Repository**, sie liegen nur in Supabase.
- Jede Funktion bekommt Tests (Unit-Tests lokal ohne Netz, Funktionstests mit nachgebauter Datenbank und nachgebautem Discord).

## Umstellung (Cutover) ohne Risiko
Die WebApp läuft **unverändert weiter**, bis das Programm fertig ist. Beide benutzen dieselbe Datenbank, man kann also gleichzeitig mit beiden arbeiten.
1. Edge Functions **neben** der WebApp bereitstellen. Discord-Teile mit einem **Test-Bot auf einem Test-Server** prüfen (Keyan hat einen Test-Server). Nie am echten Server experimentieren.
2. Beta: wenige Mitglieder nutzen das Programm mit der echten Datenbank, die WebApp bleibt als Ausweichlösung. Parität prüfen (`docs/PARITAET.md`).
3. **Umschalten, jeweils nur eins von beidem aktiv:** (a) Discord „Interactions Endpoint URL“ auf die neue Edge Function stellen, (b) den Zeitplan für Erinnerungen auf die neue Edge Function stellen (sonst gibt es doppelte Erinnerungen). Rückweg: beides wieder auf die alte Adresse zurückstellen.
4. Ankündigung an die Org, Installer verteilen.
5. WebApp noch einige Wochen als Ausweichlösung behalten (Mitglieder ohne Windows, Handy), danach auf Wunsch stilllegen. Die Daten gehören weiter Supabase, nichts geht verloren.

## Ehrlich zu Umfang und Risiko
- Das ist ein **großes Vorhaben** (61 Aktionen in 16 Bereichen, dazu Discord-Bot, Zeitplan, Anmeldung, Admin). Es entsteht in **Scheiben**, jede einzeln nutzbar und abnehmbar. Plane viele Sitzungen ein.
- Das Programm ist **nur für Windows**. Mitglieder mit Mac, Linux oder nur Handy verlieren den Zugang, wenn die WebApp abgeschaltet wird. Darum die Empfehlung, sie **optional weiterlaufen zu lassen** (kostet nichts, ist nach dem Umzug nur noch eine weitere Oberfläche zu derselben Datenbank). Entscheidung trifft Keyan.
- Free-Tarife haben Grenzen (Supabase Edge Functions, Datenbankgröße, Pausierung bei Inaktivität). Der Zeitplan alle 5 Minuten hält das Projekt wach. Grenzen vor dem Umzug nachlesen und Keyan nennen.
