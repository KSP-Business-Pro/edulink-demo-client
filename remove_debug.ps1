$f = "src\services\auth.service.ts"
$c = [System.IO.File]::ReadAllText("$PWD\$f", [System.Text.Encoding]::UTF8)
$old = "  console.log('[DEBUG loadProfil]', { authId, email, utilisateur, error });`n  "
$old = $old -replace "`r`n", "`n"
$c2 = $c.Replace($old, "  ")
if ($c2 -ne $c) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText("$PWD\$f", $c2, $utf8NoBom)
  Write-Host "Debug log removed"
} else {
  Write-Host "Pattern not found - removing manually"
  $lines = [System.IO.File]::ReadAllLines("$PWD\$f", [System.Text.Encoding]::UTF8)
  $filtered = $lines | Where-Object { $_ -notmatch "\[DEBUG loadProfil\]" }
  [System.IO.File]::WriteAllLines("$PWD\$f", $filtered, [System.Text.Encoding]::UTF8)
  Write-Host "Done via line filter"
}
