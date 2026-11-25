<#
.SYNOPSIS
    Script de téléchargement automatique de toutes les photos du concours Movember.
.DESCRIPTION
    Ce script récupère l'ensemble des photos hébergées sur Supabase et les enregistre
    sur le Bureau dans un dossier "Photos_Movember" avec les pseudos des participants.
#>

$ErrorActionPreference = "Stop"

$SupabaseUrl = "https://rvqebmyixdmfzzorypps.supabase.co"
$ApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2cWVibXlpeGRtZnp6b3J5cHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MjMyMjksImV4cCI6MjEwNzk5OTIyOX0.KPJ27inhnidVVG7igJBflUvUc1xMohUH-wkVScUBJgQ"

$DesktopFolder = [Environment]::GetFolderPath("Desktop")
$DestinationFolder = Join-Path $DesktopFolder "Photos_Movember"

if (-not (Test-Path $DestinationFolder)) {
    New-Item -ItemType Directory -Path $DestinationFolder -Force | Out-Null
}

Write-Host "📡 Récupération de la liste des photos depuis Supabase..." -ForegroundColor Cyan

$headers = @{
    "apikey" = $ApiKey
    "Authorization" = "Bearer $ApiKey"
}

try {
    $apiUrl = "$SupabaseUrl/rest/v1/contest_entries?select=pseudo,photo_url"
    $entries = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get
} catch {
    Write-Host "❌ Erreur de connexion à Supabase : $_" -ForegroundColor Red
    pause
    exit
}

if (-not $entries -or $entries.Count -eq 0) {
    Write-Host "⚠️ Aucune photo trouvée dans la base." -ForegroundColor Yellow
    pause
    exit
}

Write-Host "✅ $($entries.Count) photos trouvées. Début du téléchargement..." -ForegroundColor Green

$index = 1
foreach ($entry in $entries) {
    if ($entry.photo_url) {
        $cleanPseudo = ($entry.pseudo -replace '[\\/:*?"<>|]', '_')
        if (-not $cleanPseudo) { $cleanPseudo = "candidat" }
        $photoName = $entry.photo_url.Split('/')[-1].Split('?')[0]
        $fileName = "$cleanPseudo`_$photoName"
        $filePath = Join-Path $DestinationFolder $fileName

        Write-Host "[$index/$($entries.Count)] Téléchargement : $fileName" -ForegroundColor Gray
        try {
            Invoke-WebRequest -Uri $entry.photo_url -OutFile $filePath -UseBasicParsing
        } catch {
            Write-Host "❌ Échec de téléchargement pour $fileName : $_" -ForegroundColor Red
        }
        $index++
    }
}

Write-Host "`n🎉 Terminé ! Toutes les photos sont enregistrées dans :" -ForegroundColor Green
Write-Host "$DestinationFolder" -ForegroundColor Yellow
Write-Host "`nAppuyez sur une touche pour quitter..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
