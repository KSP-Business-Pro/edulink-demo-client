$files = @(
  "src\pages\LoginPage.tsx",
  "dist\docs\guide-admin-edulink.html",
  "public\docs\guide-admin-edulink.html"
)

foreach ($path in $files) {
    if (-not (Test-Path $path)) {
        Write-Host "SKIP $path (introuvable)" -ForegroundColor Yellow
        continue
    }
    $content = [System.IO.File]::ReadAllText($path)
    $count = ([regex]::Matches($content, [regex]::Escape("Afryx.io"))).Count
    if ($count -ne 1) {
        Write-Host "FAIL $path : $count occurrence(s) de 'Afryx.io' au lieu de 1." -ForegroundColor Red
        continue
    }
    # Retire le separateur (un seul caractere, ex point median) + espaces + "Afryx.io" qui precede
    $newContent = [regex]::Replace($content, '\s\S\sAfryx\.io', '')
    if ($newContent -eq $content) {
        Write-Host "FAIL $path : le motif de separateur n'a pas ete trouve autour de 'Afryx.io'." -ForegroundColor Red
        continue
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)
    Write-Host "OK $path" -ForegroundColor Green
}

Write-Host "TERMINE." -ForegroundColor Cyan