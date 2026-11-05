# VZA Blaupausen-Helfer
# Liest deine Star-Citizen-Logs (Game.log und logbackups) und traegt neue Blaupausen automatisch auf der Seite ein.
# Es werden nur die Namen der Blaupausen (und der Zeitpunkt) uebertragen, keine Log-Dateien.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $Host.UI.RawUI.WindowTitle = 'VZA Blaupausen-Helfer' } catch { }

$Site = '@@SITE@@'
$Token = '@@TOKEN@@'
# Nur fuer Tests der Seite
if ($env:VZA_SITE) { $Site = $env:VZA_SITE }
if ($env:VZA_TOKEN) { $Token = $env:VZA_TOKEN }
$PollSeconds = 30
if ($env:VZA_POLL) { $PollSeconds = [double]$env:VZA_POLL }
$Once = ($env:VZA_ONCE -eq '1')
$Site = $Site.TrimEnd('/')
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch { }

$LF = [char]10
$Ordinal = [System.StringComparison]::Ordinal
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$ChunkBytes = 8MB

function Say($text) { Write-Host ((Get-Date).ToString('HH:mm:ss') + '  ' + $text) }
function Fail-Exit($text) {
    Write-Host ''
    Write-Host $text -ForegroundColor Red
    exit 1
}

# ---------- Erkennung der Blaupausen (gleiche Regeln wie die Seite) ----------
$RxMain = New-Object System.Text.RegularExpressions.Regex('(?:Received Blueprint|Bauplan erhalten):\s*(.*?):\s*"')
$RxFallback = New-Object System.Text.RegularExpressions.Regex('(?:Received Blueprint|Bauplan erhalten):\s*([^"\[\]]+?)\s*"')
$RxStamp = New-Object System.Text.RegularExpressions.Regex('^<(\d{4}-\d{2}-\d{2}T[\d:.]+Z)>')
$RxSpaces = New-Object System.Text.RegularExpressions.Regex('\s+')
$RxTail = New-Object System.Text.RegularExpressions.Regex('[:\s]+$')
$Markers = @('Received Blueprint', 'Bauplan erhalten')

# Alle bisher gefundenen Blaupausen: Name (klein) -> @{ Name; At }
$Found = @{}
# Noch nicht uebertragen
$Pending = @{}
# Namen, die seit dem letzten Durchlauf neu dazugekommen sind (nur fuer die Anzeige)
$NewNames = New-Object System.Collections.ArrayList

function Add-Line($line) {
    if ($line.Length -gt 3000) { return }
    if ($line.IndexOf('UpdateNotificationItem', $Ordinal) -ge 0) { return }
    $m = $RxMain.Match($line)
    if (-not $m.Success) { $m = $RxFallback.Match($line) }
    if (-not $m.Success) { return }
    $name = $RxSpaces.Replace($m.Groups[1].Value, ' ')
    $name = $RxTail.Replace($name, '').Trim()
    if ($name.Length -lt 1 -or $name.Length -gt 120) { return }
    $at = $null
    $sm = $RxStamp.Match($line)
    if ($sm.Success) { $at = $sm.Groups[1].Value }
    $key = $name.ToLowerInvariant()
    $old = $Found[$key]
    if ($null -eq $old -or ($null -ne $at -and ($null -eq $old.At -or [string]::CompareOrdinal($at, $old.At) -lt 0))) {
        if ($null -eq $old) { [void]$NewNames.Add($name) }
        $entry = @{ Name = $name; At = $at }
        $Found[$key] = $entry
        $Pending[$key] = $entry
    }
}

# Sucht in einem Textstueck die Zeilen mit den Markern (viel schneller, als jede Zeile einzeln anzusehen)
function Scan-Text($text) {
    foreach ($marker in $Markers) {
        $i = $text.IndexOf($marker, 0, $Ordinal)
        while ($i -ge 0) {
            $ls = $text.LastIndexOf($LF, $i)
            if ($ls -lt 0) { $ls = 0 } else { $ls = $ls + 1 }
            $le = $text.IndexOf($LF, $i)
            if ($le -lt 0) { $le = $text.Length }
            $line = $text.Substring($ls, $le - $ls).TrimEnd([char]13)
            Add-Line $line
            $i = $text.IndexOf($marker, $le, $Ordinal)
        }
    }
}

# Liest eine Datei ab Position $pos in Stuecken (auch mehrere hundert Megabyte) und gibt die neue Position zurueck.
# Nur vollstaendige Zeilen werden gelesen: Eine noch wachsende letzte Zeile wird beim naechsten Mal mitgenommen.
# Die Datei wird "geteilt" geoeffnet, damit das Spiel sie weiter beschreiben kann.
function Scan-File($path, [long]$pos, [bool]$final = $false) {
    $fs = $null
    try {
        $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
        $fs = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
        $len = $fs.Length
        if ($len -lt $pos) { $pos = 0 }
        while ($pos -lt $len) {
            $want = [int][Math]::Min([long]$ChunkBytes, $len - $pos)
            $buf = New-Object byte[] $want
            $null = $fs.Seek($pos, [System.IO.SeekOrigin]::Begin)
            $got = 0
            while ($got -lt $want) {
                $n = $fs.Read($buf, $got, $want - $got)
                if ($n -le 0) { break }
                $got += $n
            }
            if ($got -le 0) { break }
            $last = [Array]::LastIndexOf($buf, [byte]10, $got - 1)
            # Abgeschlossene Datei (Sicherung): auch eine letzte Zeile ohne Zeilenumbruch lesen
            if ($final -and ($pos + $got) -ge $len) { $last = $got - 1 }
            if ($last -lt 0) {
                # keine vollstaendige Zeile: warten (ausser der Block ist riesig, dann alles nehmen)
                if ($got -lt $ChunkBytes) { break }
                $last = $got - 1
            }
            $text = $Utf8.GetString($buf, 0, $last + 1)
            if ($pos -eq 0 -and $text.Length -gt 0 -and [int]$text[0] -eq 65279) { $text = $text.Substring(1) }
            Scan-Text $text
            $pos += ($last + 1)
        }
        return $pos
    }
    finally {
        if ($null -ne $fs) { $fs.Dispose() }
    }
}

# ---------- Spielordner finden ----------
function Find-Folder {
    if ($env:VZA_LOGDIR) { return $env:VZA_LOGDIR }
    $base = [Environment]::GetFolderPath('LocalApplicationData')
    if (-not $base) { $base = $env:LOCALAPPDATA }
    if (-not $base) { $base = [System.IO.Path]::GetTempPath() }
    $store = Join-Path $base 'VZA-Helfer'
    $saved = Join-Path $store 'ordner.txt'
    if (Test-Path -LiteralPath $saved) {
        $p = (Get-Content -LiteralPath $saved -Raw).Trim()
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    $bases = @('Program Files\Roberts Space Industries\StarCitizen', 'Roberts Space Industries\StarCitizen', 'Games\Roberts Space Industries\StarCitizen', 'Games\StarCitizen', 'StarCitizen', 'RSI\StarCitizen')
    $channels = @('LIVE', 'PTU', 'EPTU', 'HOTFIX')
    $hits = New-Object System.Collections.ArrayList
    try {
        foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
            if ($d.DriveType -ne [System.IO.DriveType]::Fixed -or -not $d.IsReady) { continue }
            foreach ($b in $bases) {
                foreach ($c in $channels) {
                    $cand = Join-Path (Join-Path $d.Name $b) $c
                    if ((Test-Path -LiteralPath (Join-Path $cand 'Game.log')) -or (Test-Path -LiteralPath (Join-Path $cand 'logbackups'))) { [void]$hits.Add($cand) }
                }
            }
        }
    } catch { }
    $chosen = $null
    foreach ($h in $hits) { if ($h -like '*\LIVE') { $chosen = $h; break } }
    if ($null -eq $chosen -and $hits.Count -gt 0) { $chosen = $hits[0] }
    if ($null -eq $chosen) {
        Write-Host ''
        Write-Host 'Ich habe deinen Star-Citizen-Ordner nicht gefunden.'
        Write-Host 'Oeffne im Explorer den Ordner StarCitizen\LIVE (dort liegt die Datei Game.log),'
        Write-Host 'klicke oben in die Adressleiste, kopiere den Pfad (Strg+C) und fuege ihn hier ein (Rechtsklick).'
        $answer = (Read-Host 'Pfad zum Ordner LIVE').Trim().Trim('"')
        if (-not $answer -or -not (Test-Path -LiteralPath $answer)) { Fail-Exit 'Diesen Ordner gibt es nicht. Starte den Helfer noch einmal.' }
        $chosen = $answer
    }
    try {
        if (-not (Test-Path -LiteralPath $store)) { [void](New-Item -ItemType Directory -Path $store) }
        Set-Content -LiteralPath $saved -Value $chosen -Encoding UTF8
    } catch { }
    return $chosen
}

# ---------- Auf die Seite uebertragen ----------
function Json-String($s) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    foreach ($ch in $s.ToCharArray()) {
        $code = [int]$ch
        if ($ch -eq '"') { [void]$sb.Append('\"') }
        elseif ($ch -eq '\') { [void]$sb.Append('\\') }
        elseif ($code -lt 32) { [void]$sb.Append('\' + 'u' + $code.ToString('x4')) }
        else { [void]$sb.Append($ch) }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

# Gibt $true zurueck, wenn die Eintraege uebertragen wurden. Bei Netzwerkproblemen $false (spaeter erneut versuchen).
function Send-Batch($entries) {
    $parts = @()
    foreach ($e in $entries) {
        $at = 'null'
        if ($e.At) { $at = Json-String $e.At }
        $parts += ('{"name":' + (Json-String $e.Name) + ',"at":' + $at + '}')
    }
    $body = '{"items":[' + ($parts -join ',') + ']}'
    $bytes = $Utf8.GetBytes($body)
    try {
        $res = Invoke-RestMethod -Method Post -Uri ($Site + '/api/import/blueprints') -Headers @{ Authorization = ('Bearer ' + $Token) } -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 60
        Say ('Eingetragen: ' + $res.added + ' neu, ' + $res.already_owned + ' hattest du schon.')
        return $true
    }
    catch {
        $code = 0
        $message = ''
        try { $code = [int]$_.Exception.Response.StatusCode } catch { }
        try { $message = ($_.ErrorDetails.Message | ConvertFrom-Json).message } catch { }
        if ($code -eq 401 -or $code -eq 403) {
            if (-not $message) { $message = 'Der Schluessel wird nicht akzeptiert. Lade den Helfer auf der Seite neu herunter.' }
            Fail-Exit $message
        }
        if ($code -ge 400 -and $code -lt 500) {
            if (-not $message) { $message = 'Die Seite hat die Daten abgelehnt.' }
            Say ('Hinweis der Seite: ' + $message)
            return $true
        }
        Say 'Die Seite ist gerade nicht erreichbar. Ich versuche es gleich noch einmal.'
        return $false
    }
}

function Send-Pending {
    if ($Pending.Count -eq 0) { return }
    $list = @($Pending.Values | Sort-Object { $_.Name })
    $sent = 0
    for ($i = 0; $i -lt $list.Count; $i += 500) {
        $end = [Math]::Min($i + 499, $list.Count - 1)
        $batch = @($list[$i..$end])
        if (-not (Send-Batch $batch)) { return }
        foreach ($e in $batch) { $Pending.Remove($e.Name.ToLowerInvariant()) }
        $sent += $batch.Count
    }
}

# ---------- Ablauf ----------
Write-Host ''
Write-Host '  VZA Blaupausen-Helfer' -ForegroundColor Cyan
Write-Host '  Traegt neue Blaupausen aus deinem Spiel automatisch auf der Seite ein.'
Write-Host ''

$folder = Find-Folder
Say ('Spielordner: ' + $folder)
$gameLog = Join-Path $folder 'Game.log'
$backups = Join-Path $folder 'logbackups'

$files = New-Object System.Collections.ArrayList
if (Test-Path -LiteralPath $backups) {
    foreach ($f in (Get-ChildItem -LiteralPath $backups -Filter '*.log' -File | Sort-Object LastWriteTime)) { [void]$files.Add($f.FullName) }
}
if (Test-Path -LiteralPath $gameLog) { [void]$files.Add($gameLog) }
if ($files.Count -eq 0) {
    Say 'Noch keine Log-Dateien da. Ich warte, bis das Spiel gestartet wurde.'
}
else {
    Say ('Lese ' + $files.Count + ' Datei(en) ...')
}

$positions = @{}
$failedFiles = 0
foreach ($path in $files) {
    $isLive = ($path -eq $gameLog)
    try { $positions[$path] = Scan-File $path 0 (-not $isLive) }
    catch { $failedFiles++; Say ('Konnte nicht gelesen werden: ' + (Split-Path -Leaf $path)) }
}
Say ('' + $Found.Count + ' Blaupause(n) in den Logs gefunden.')
if ($env:VZA_DUMP) {
    $dump = @($Found.Values | Sort-Object { $_.Name } | ForEach-Object { '{"name":' + (Json-String $_.Name) + ',"at":' + $(if ($_.At) { Json-String $_.At } else { 'null' }) + '}' })
    Set-Content -LiteralPath $env:VZA_DUMP -Value ('[' + ($dump -join ',') + ']') -Encoding UTF8
    exit 0
}
if ($Pending.Count -eq 0 -and $Found.Count -eq 0 -and $files.Count -gt 0) {
    Say 'In den vorhandenen Logs steht keine erhaltene Blaupause. Neue werden ab jetzt automatisch eingetragen.'
}
Send-Pending

if ($Once) { exit 0 }

Write-Host ''
Write-Host '  Lass dieses Fenster offen. Neue Blaupausen aus dem Spiel werden automatisch eingetragen.' -ForegroundColor Green
Write-Host '  Beenden: Fenster schliessen oder Strg+C.'
Write-Host ''

while ($true) {
    Start-Sleep -Seconds $PollSeconds
    try {
        if (Test-Path -LiteralPath $gameLog) {
            $pos = 0
            if ($positions.ContainsKey($gameLog)) { $pos = $positions[$gameLog] }
            $NewNames.Clear()
            $size = (Get-Item -LiteralPath $gameLog).Length
            if ($size -lt $pos) {
                # Neue Spielsitzung: Die alte Game.log liegt jetzt in logbackups. Dort noch einmal nachsehen (auch die letzte Zeile).
                if (Test-Path -LiteralPath $backups) {
                    $newest = Get-ChildItem -LiteralPath $backups -Filter '*.log' -File | Sort-Object LastWriteTime | Select-Object -Last 1
                    if ($null -ne $newest) { [void](Scan-File $newest.FullName 0 $true) }
                }
            }
            $positions[$gameLog] = Scan-File $gameLog $pos
            if ($NewNames.Count -gt 0) {
                Say ('Neue Blaupause: ' + ($NewNames -join ', '))
            }
        }
    }
    catch {
        # Datei gerade nicht lesbar: beim naechsten Durchlauf noch einmal
    }
    if ($Pending.Count -gt 0) { Send-Pending }
}
