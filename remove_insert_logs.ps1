$f = "src\modules\parametres\index.tsx"
$lines = [System.IO.File]::ReadAllLines("$PWD\$f", [System.Text.Encoding]::UTF8)
$filtered = $lines | Where-Object { $_ -notmatch "console\.error\('\[.*insert error\]'" }
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines("$PWD\$f", $filtered, $utf8NoBom)
Write-Host "Done - removed $(($lines.Count - $filtered.Count)) debug lines"
