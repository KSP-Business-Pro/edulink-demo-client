# ============================================================
# B5.1 — Patch déploiement EduLink Sup
# Exécuter depuis : C:\Dev\edulink-demo-client\
# ============================================================

Set-Location "C:\Dev\edulink-demo-client"

Write-Host "`n>> Etape 1 : Creation du dossier module parametres..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "src\modules\parametres" -Force | Out-Null

Write-Host ">> Etape 2 : Copie des fichiers..." -ForegroundColor Cyan

# Hook useParametres
Copy-Item "$env:USERPROFILE\Downloads\useParametres.ts" `
  "src\hooks\useParametres.ts" -Force
Write-Host "   src\hooks\useParametres.ts OK" -ForegroundColor Green

# Page principale -> index.tsx du module
Copy-Item "$env:USERPROFILE\Downloads\ParametresPage.tsx" `
  "src\modules\parametres\index.tsx" -Force
Write-Host "   src\modules\parametres\index.tsx OK" -ForegroundColor Green

Write-Host "`n>> Etape 3 : Suppression fichiers parasites racine..." -ForegroundColor Cyan
@("ParametresPage.tsx", "useParametres.ts") | ForEach-Object {
  if (Test-Path ".\$_") {
    Remove-Item ".\$_" -Force
    Write-Host "   Supprime : $_" -ForegroundColor Yellow
  }
}

Write-Host "`n>> Etape 4 : Correction import supabase dans index.tsx..." -ForegroundColor Cyan
$file = "src\modules\parametres\index.tsx"
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Supprimer la ligne placeholder
$content = $content -replace "  const \{ supabase: _ \} = \{ supabase: null \}  // placeholder[^\n]*\n", ""

# Ajouter import supabase en haut si absent
if ($content -notmatch "import \{ supabase \}") {
  $content = $content -replace "(import \{ useEcole \})", "import { supabase } from '../../lib/supabaseClient'`n`$1"
}

[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "   Import supabase corrige OK" -ForegroundColor Green

Write-Host "`n>> Etape 5 : TypeScript check..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
  Write-Host "`n   ERREUR TypeScript detectee. Corriger avant de deployer." -ForegroundColor Red
  exit 1
}
Write-Host "   TypeScript OK" -ForegroundColor Green

Write-Host "`n>> Etape 6 : Deploy Vercel..." -ForegroundColor Cyan
git add -A
git commit -m "feat(B5.1): Parametres Avances - theme, logo, roles, permissions, audit"
npx vercel --prod

Write-Host "`n✅ B5.1 deploye sur app.edulink.bj" -ForegroundColor Green
