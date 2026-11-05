# Phasen und Zusatzfunktionen

Ziel: **1:1 alle Funktionen der WebApp** (`09-funktionsliste-paritaet.md` ist die Checkliste) als **eigenständiges** Windows-Programm, danach Zusatzfunktionen. Technik und Zielbild: `10-architektur-autonom.md`. Jede Phase ist einzeln nutzbar, wird von Keyan abgenommen und bleibt von der laufenden WebApp unabhängig.

## Phase 0 – Planen und entscheiden (noch kein Programmcode)
- Alle Unterlagen lesen, `reference/db/schema-public.sql` und den Quelltext in `reference/webapp-source` durchsehen.
- Schreibe `docs/ARCHITEKTUR.md` (dein Plan, Abweichungen vom Vorschlag begründet), `docs/PARITAET.md` (die Zeilen aus `09-…` mit Spalten *Status, Test, Bemerkung*) und `docs/ENTSCHEIDUNGEN.md`.
- Stelle Keyan **höchstens 5 Fragen**, empfohlen: (1) Soll die WebApp als Ausweichlösung für Mitglieder ohne Windows weiterlaufen? (2) Gibt es einen **Test-Discord-Server** und einen **Test-Bot** für die Discord-Teile? (3) Adresse und Namen: Supabase-Projekt (öffentliche Adresse und öffentlicher Schlüssel), GitHub-Repository (öffentlich?). (4) Dürfen wir die Supabase CLI installieren? (5) Priorität: welche Funktionen braucht die Org zuerst?
- **Abnahme:** Keyan liest die Zusammenfassung (höchstens 1 Seite, einfache Sprache) und sagt Ja.

## Phase 1 – Grundgerüst und Anmeldung
- Monorepo, Electron + React + Vite + TypeScript + Tailwind, sichere Einstellungen, ein Fenster, Tray, nur eine Instanz, Protokolldatei, Gerüst für Tests, GitHub Actions (Typen, Code, Tests, Bau).
- **Bausteine im HUD-Design** (Fläche mit Eck-Markierungen, Knöpfe, Reiter, Tabellen, Formulare, Meldungen, Skelett-Ladeansicht), Seitenleiste mit denselben Menüpunkten wie die WebApp, Bewegung wie in `08-design.md` mit Schalter „Animationen“ und Rücksicht auf Windows.
- Supabase-Anbindung, **Edge Functions `login`, `register`, `reset-password`** (Muster: `reference/webapp-source/app/auth/actions.ts`, Tests mitnehmen), Anmeldebildschirm, Registrierung mit Einladungscode, „Passwort vergessen“, Sitzung verschlüsselt speichern, Abmelden, Wartebildschirm für nicht freigegebene Konten.
- **Abnahme:** Installieren, mit Benutzername anmelden, neu starten (noch angemeldet), abmelden, falsches Passwort wird gleich abgelehnt wie unbekannter Name, 11. Fehlversuch sperrt kurz.

## Phase 2 – Lesen aller Bereiche
Dashboard (Level, Punkte, Hinweise), Rangliste, Operationen (Liste, Detail), Kalender, Hangar, Lager (Liste, Detail), Kassenbuch, Blaupausen (Katalog mit allen Filtern, In der Org, Meine Sammlung, Anfragen, Einkaufsliste lesen), Profil. Aussehen und Verhalten wie die WebApp.
**Abnahme:** Keyan vergleicht Seite für Seite mit der WebApp (Zahlen, Filter, Sortierung, Texte).

## Phase 3 – Mitglieder-Aktionen
Anmeldung/Abmeldung bei Operationen mit Rolle und Schiff, Hangar bearbeiten, Loot-Ansprüche (Claims), Einkaufsliste, Anfragen stellen, Profilname, Passwort ändern, Benutzername festlegen, Discord verknüpfen (Code-Anzeige, `/verknuepfen` in Discord), Blaupausen manuell hinzufügen/entfernen.
**Abnahme:** Jede Aktion aus `09-…` Bereich „Mitglied“ zeigt dieselbe Wirkung wie in der WebApp (in beiden Oberflächen nachsehen).

## Phase 4 – Spiel-Logs im Hintergrund (Hauptgewinn)
Siehe `03-spiel-logs.md`. Das Programm ist angemeldet und ruft `add_my_blueprints` direkt auf (kein Schlüssel, kein PC-Helfer). Ordnersuche, Mitlesen, Warteschlange, Benachrichtigung „Neue Blaupause“, Spielerkennung, Fenster „Import“ mit Protokoll.
**Abnahme:** Tests mit `beispiel-logs/` (Ergebnis identisch zu `log-scan.ts`), laufendes Anhängen, Neustart ohne Verlust, einmal mit Keyans echtem Spiel.

## Phase 5 – Officer und Admin
Operationen anlegen/bearbeiten/starten/abschließen/absagen (mit Punkten und Loot), Loot-Verwaltung (Freigabe, Verkauf, Zahlung), Kassenbuch buchen, Schiffe-Katalog, Mitglieder (freigeben, ablehnen, Rolle, sperren, löschen), Einladungscodes, Passwort-Links, Datensicherung, System-Prüfungen (Geschwindigkeit, Anmeldetest), Discord-Einstellungen (Befehle eintragen, Test).
**Abnahme:** Wie Phase 3, mit Officer- und Admin-Konto.

## Phase 6 – Ersatz der Server-Teile (Discord und Zeitplan)
Edge Functions `discord-notify`, `discord-interactions`, `cron-reminders` (mit automatischer Absage nach 3 Tagen), `catalog-sync`, `item-enrich`, `backup-export`. Das Programm löst die Meldungen nach Aktionen aus. **Alles zuerst mit Test-Bot und Test-Server**, Meldungstexte gleich wie bisher (Tests).
**Abnahme:** Test-Server zeigt dieselben Meldungen, Befehle, Knöpfe und Erinnerungen wie der echte (Vergleich nebeneinander).

## Phase 7 – Zusatzfunktionen (Upgrades, einzeln mit Keyan wählen)
Windows-Benachrichtigungen („Operation beginnt in 10 Minuten“, „Anfrage an dich“), Tray-Menü mit nächster Operation und offenen Anfragen, Autostart, globale Tastenkürzel, Schnellsuche im Katalog (sofort, offline), Offline-Lesen, Einkaufsliste als Zutatenliste kopieren/drucken, CSV-Export, Mehrfenster (z. B. Kalender daneben), Tastaturbedienung, lokale Spielzeit-Statistik (nur lokal), „immer im Vordergrund“-Fenster (normales Fenster, **kein** Einklinken ins Spiel), Hell/Dunkel nur wenn gewünscht.

## Phase 8 – Auslieferung und Umstellung
Installer, Auto-Update, README für Mitglieder, Beta mit wenigen Mitgliedern, **Umstellung** nach `10-…` („Umstellung ohne Risiko“), Rückweg dokumentieren, Anleitung „Neue Version veröffentlichen“, Entscheidung zur WebApp (weiterlaufen lassen oder stilllegen).

## Qualitätsmaßstab für jede Phase
- `npm test` grün, Ausgabe je Prüfung „OK/FEHLER“; die vorhandenen Tests der WebApp (`reference/webapp-source/tests`, ca. 600 Prüfungen) für übernommenen Code **mitnehmen**; neue Tests für Neues, auch für Fehlerfälle (Netz weg, Rolle fehlt, gesperrtes Konto, doppelte Klicks, halbe Daten).
- **Gleichheit prüfen, nicht annehmen:** Für jede Zeile in `PARITAET.md` gibt es einen Test oder eine benannte manuelle Prüfung von Keyan. Was nicht geprüft werden konnte, steht als „ungeprüft“ da.
- **Sicherheit:** Nie Dienst-Schlüssel im Programm. Jede neue Datenbankfunktion prüft Rolle und Freigabe selbst und hat Tests (angemeldet/nicht angemeldet/fremde Zeilen). SQL ab Nummer 31, mehrfach ausführbar, **führt Keyan selbst aus**.
