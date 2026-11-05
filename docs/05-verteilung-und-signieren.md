# Verteilung, Updates und Windows-Warnungen (kostenlos)

> Gilt für das **Programm**. Die Edge Functions werden nicht über GitHub Releases verteilt, sondern mit der Supabase CLI bereitgestellt (siehe `10-architektur-autonom.md`).

## Empfehlung
1. **Eigenes, öffentliches GitHub-Repository** nur für das Programm (z. B. `keyan2406/vza-desktop`, getrennt von der privaten WebApp). Darin stehen **keine Geheimnisse**, nur die öffentliche Adresse der WebApp (die ohnehin nur nach Anmeldung und Freigabe etwas zeigt).
2. **GitHub Actions** baut den Installer bei einem Versions-Tag und hängt ihn an ein **GitHub Release**. Kostenlos für öffentliche Repositories.
3. **Auto-Update** per `electron-updater` aus diesen Releases (`latest.yml`). Mitglieder laden den Installer einmal von der Release-Seite, danach aktualisiert sich das Programm selbst.
4. Verteilung an die Org: Link zur Release-Seite im Discord.
*Alternative bei Bedenken gegen ein öffentliches Repository:* privates Repository, Installer per Discord-Datei/Cloud verteilen, Updates manuell. Bequemer ist die Empfehlung.

## Warnungen von Windows (ehrlich)
Ohne gekauftes Zertifikat ist das Programm **nicht signiert**:
- Beim Start zeigt Windows **SmartScreen** („Der Computer wurde durch Windows geschützt“) → „Weitere Informationen“ → „Trotzdem ausführen“. Das bessert sich mit der Zeit und mit Downloads nur langsam.
- Manche Virenscanner melden unsignierte Electron-Programme fälschlich. Gegenmittel: Datei bei Microsoft zur Analyse einreichen („Report incorrectly detected file“), keine Packer/Verschleierung benutzen, Quelltext offen lassen.
- Die README für Mitglieder muss diese zwei Schritte mit Bildbeschreibung erklären.

## Kostenlose Wege zu weniger Warnungen (zum Prüfen, Stand nicht garantiert)
- **SignPath Foundation** vergibt nach meinem Kenntnisstand kostenlose Signaturen an Open-Source-Projekte (öffentliches Repository, Open-Source-Lizenz, Antrag nötig). Prüfe die aktuellen Bedingungen, bevor du das empfiehlst.
- **Microsoft Store**: signiert Pakete selbst; Konto- und Prüfbedingungen aktuell nachlesen.
- **Bezahlt (nicht gewünscht):** Zertifikat ca. 100–500 € pro Jahr oder Microsofts Signaturdienst (ca. 10 $/Monat, regional eingeschränkt).
Frage Keyan, ob er den Aufwand eines Antrags will. Standard: unsigniert starten.

## Sicherheit der Updates
- Updates kommen nur über HTTPS von GitHub, Dateien werden über die Prüfsummen in `latest.yml` kontrolliert. Ohne Signatur vertraut das Programm dem GitHub-Konto. Deshalb: **Zwei-Faktor-Anmeldung** für das GitHub-Konto, Branch-Schutz für `main`, Veröffentlichung nur über Tags.
- Nie den Update-Server über HTTP oder fremde Adressen laufen lassen.

## Technische Eckpunkte für electron-builder
- Ziel: `nsis`, `oneClick: false`, `perMachine: false` (kein Administrator), `allowToChangeInstallationDirectory: true`, `createDesktopShortcut`, `createStartMenuShortcut`, `runAfterFinish`.
- Symbol: `assets/icon.ico` (7 Größen), Installer-Bilder `assets/installer-*.png`.
- Artefaktname: `VZA-Desktop-Setup-${version}.exe`. Zusätzlich optional eine „portable“ Variante.
- Version in `package.json`, Tag `vX.Y.Z` löst den Bau aus. `GH_TOKEN` in Actions ist automatisch vorhanden (kein eigenes Geheimnis nötig).
