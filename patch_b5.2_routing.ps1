# B5.2 — Patch routing App.tsx + sidebar AppLayout.tsx
Set-Location "C:\Dev\edulink-demo-client"

# ── 1. App.tsx : lazy import + route ─────────────────────────────────────────
$app = [System.IO.File]::ReadAllText("$PWD\src\App.tsx", [System.Text.Encoding]::UTF8)

# Ajouter lazy import après ParametresPage
$app = $app -replace `
  "const ParametresPage   = lazy\(\(\) => import\('./modules/parametres'\)\);", `
  "const ParametresPage   = lazy(() => import('./modules/parametres'));`nconst UtilisateursPage = lazy(() => import('./modules/utilisateurs'));"

# Ajouter route apres /parametres
$app = $app -replace `
  "<Route path=""/parametres""   element=\{<AppRoute page=""parametres"">  <ParametresPage /></AppRoute>\} />", `
  "<Route path=""/parametres""   element={<AppRoute page=""parametres"">  <ParametresPage /></AppRoute>} />`n          <Route path=""/utilisateurs"" element={<AppRoute page=""utilisateurs""><UtilisateursPage /></AppRoute>} />"

[System.IO.File]::WriteAllText("$PWD\src\App.tsx", $app, [System.Text.Encoding]::UTF8)
Write-Host "   App.tsx patche OK" -ForegroundColor Green

# ── 2. AppLayout.tsx : lien sidebar ──────────────────────────────────────────
$layout = [System.IO.File]::ReadAllText("$PWD\src\components\AppLayout.tsx", [System.Text.Encoding]::UTF8)

$layout = $layout -replace `
  "\{ id: 'parametres', label: 'Paramètres', ico: '⚙️', href: '/parametres' \},", `
  "{ id: 'utilisateurs', label: 'Utilisateurs', ico: '👤', href: '/utilisateurs' },`n      { id: 'parametres', label: 'Paramètres', ico: '⚙️', href: '/parametres' },"

[System.IO.File]::WriteAllText("$PWD\src\components\AppLayout.tsx", $layout, [System.Text.Encoding]::UTF8)
Write-Host "   AppLayout.tsx patche OK" -ForegroundColor Green

# ── 3. Vérification ──────────────────────────────────────────────────────────
Write-Host "`n>> TypeScript check..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Write-Host "ERREUR TypeScript" -ForegroundColor Red; exit 1 }
Write-Host "   OK" -ForegroundColor Green

git add -A
git commit -m "feat(B5.2): route /utilisateurs + lien sidebar"
npx vercel --prod
Write-Host "`n✅ B5.2 routing deploye" -ForegroundColor Green
