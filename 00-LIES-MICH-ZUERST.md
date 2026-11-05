# Startpaket v2: Eigenständiges VZA-Programm (für Keyan)

Ziel: ein richtiges Windows-Programm mit **allen Funktionen der WebApp 1:1, plus Extras**, das **ohne die Webseite** funktioniert. Die WebApp läuft währenddessen **unverändert weiter**.

## Was „ohne WebApp“ bedeutet (bitte lesen)
- Die **Daten der Org** (Operationen, Loot, Kasse, Blaupausen, Konten) liegen weiter in **Supabase**. Das Programm und die Mitglieder teilen sich diese Daten dort. Ohne einen gemeinsamen Speicher im Internet kann kein Programm Daten zwischen Mitgliedern teilen.
- Wegfallen soll nur die **Webseite bei Vercel**. Ihre Server-Teile (Discord-Bot, Erinnerungen, Anmeldung per Benutzername, Katalog-Abgleich) ziehen in Supabase um (Supabase Edge Functions, kostenlos).
- Das Programm ist **nur für Windows**. Wer nur Handy oder Mac hat, bräuchte die WebApp weiter. **Empfehlung:** Lass sie nach dem Umzug einfach weiterlaufen (kostet nichts).
- Das ist ein **großes Vorhaben** (61 Aktionen in 16 Bereichen, Discord-Bot, Zeitplan, Admin). Es entsteht in **Phasen**, jede einzeln nutzbar. Plane viele Sitzungen ein.

## Was im Paket liegt
| Datei/Ordner | Wofür |
|---|---|
| `PROMPT-fuer-Claude-Code.md` | Der Auftrag, den du in Claude Code einfügst |
| `CLAUDE.md` | Dauerhafte Regeln (liest Claude Code automatisch) |
| `docs/` | 10 Dokumente: WebApp, Datenbank-Schnittstellen, Spiel-Logs, **Phasen**, Verteilung, Sicherheit, Datenmodell, Design, **Funktionsliste (Checkliste für 1:1)**, **Architektur** |
| `reference/db/` | Aufbau der Datenbank (Tabellen, Funktionen, Regeln) |
| `reference/webapp-source/` | **Kompletter Quelltext der WebApp** samt ca. 600 Tests (nur zum Nachschlagen) |
| `reference/sql/` | Geschichte der Datenbank-Änderungen |
| `reference/spiel-logs/` | Getesteter Code für die Spiel-Logs und Beispiel-Logs |
| `assets/` | Symbole (`icon.ico`), Tray-Symbole, Logo, Installer-Bilder |

## Schritt für Schritt
**1. Voraussetzungen:** `node -v` zeigt `v22…` (sonst LTS von nodejs.org installieren), `git --version` zeigt eine Version (sonst git-scm.com), `claude --version` zeigt eine Version (siehe die Hilfe im Chat, falls nicht).

**2. Ordner:** Lege `C:\Users\keyan\Documents\vza-desktop` an und entpacke das Startpaket **hinein**, sodass dort direkt `CLAUDE.md`, `docs`, `reference` und `assets` liegen. (Ist dort noch das alte Startpaket, überschreibe alles.)

**3. GitHub:** Neues **leeres** Repository `vza-desktop` (Public empfohlen, es liegen keine Geheimnisse darin). Dann im Ordner `cmd` öffnen:
```
git init
git add .
git commit -m "Startpaket v2"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/vza-desktop.git
git push -u origin main
```
(Existiert das Repository schon vom ersten Startpaket, lass `git init` und `git remote add` weg und gib nur `git add .`, `git commit -m "Startpaket v2"`, `git push` ein.)

**4. Claude Code starten:** Im Ordner `claude` eingeben. Öffne `PROMPT-fuer-Claude-Code.md`, kopiere **alles** und füge es ein.

**5. Was Claude Code dann fragt (und was du antwortest)**
Er arbeitet zuerst nur an einem **Plan** (Phase 0, noch kein Programmcode) und stellt **höchstens 5 Fragen**:
1. *WebApp als Ausweichlösung weiterlaufen lassen?* → **Ja** (kostet nichts, nützlich für Handy und Mac).
2. *Test-Discord-Server und Test-Bot?* → Er erklärt dir, wie du beides anlegst (Discord Developer Portal, neue Anwendung). Das ist wichtig, damit nichts am echten Server kaputtgeht.
3. *Supabase-Adresse und öffentlicher Schlüssel, Repository-Name* → Beides findest du bei Supabase unter **Project Settings → API**: die **Project URL** und den **publishable key** (öffentlich, darf er bekommen). **Niemals** den `service_role`- oder `secret`-Schlüssel eintippen. Repository: `vza-desktop`, öffentlich.
4. *Supabase CLI installieren?* → **Ja**, er erklärt dir die Schritte.
5. *Was zuerst?* → Meine Empfehlung: Anmeldung, dann Spiel-Logs (der größte Gewinn), dann der Rest.

**6. Danach:** Phase für Phase. Nach jeder sagt er dir in höchstens 5 Schritten, wie du es ausprobierst. Du vergleichst mit der WebApp und antwortest „passt, weiter“ oder schilderst, was nicht stimmt.

## Gut zu wissen
- **Kosten:** 0 €. Das Programm wird unsigniert veröffentlicht, Windows warnt beim ersten Start („Weitere Informationen“ → „Trotzdem ausführen“).
- **Sicherheit:** Der Dienst-Schlüssel bleibt in Supabase. Du gibst Claude Code keine Geheimnisse. Fragt er danach, sag Nein und frage, wozu.
- **Datenbank-Änderungen** (SQL) führst du selbst aus, er liefert Datei und Anleitung. Das bleibt wie hier im Chat.
- **Umstellung** auf das neue System macht er nur mit deinem Ja und mit Rückweg. Bis dahin läuft alles wie bisher.
- Dieser Chat bleibt für die WebApp, der Chat in Claude Code für das Programm.
