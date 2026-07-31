function Normalize($s) { return $s -replace "`r`n", "`n" }

function ApplyReplace($content, $old, $new, $label) {
    $old = Normalize $old
    $new = Normalize $new
    $count = ([regex]::Matches($content, [regex]::Escape($old))).Count
    if ($count -ne 1) {
        Write-Host "FAIL $label : $count correspondance(s) au lieu de 1." -ForegroundColor Red
        exit 1
    }
    Write-Host "OK $label" -ForegroundColor Green
    return $content.Replace($old, $new)
}

# ── Fichier 1 : presences.service.ts ──
$path1 = "src\services\presences.service.ts"
$content1 = [System.IO.File]::ReadAllText($path1) -replace "`r`n", "`n"

$old1 = @'
export async function marquerPresence(
  seanceId: string, etudiantId: string,
  statut: StatutPresence, ecoleId: string
): Promise<void> {
  const { error } = await supabase.from('presences').upsert({
    seance_id: seanceId, etudiant_id: etudiantId,
    ecole_id: ecoleId, statut,
  }, { onConflict: 'seance_id,etudiant_id' });
  if (error) throw error;
}
'@
$new1 = @'
export async function marquerPresence(
  seanceId: string, etudiantId: string,
  statut: StatutPresence, ecoleId: string
): Promise<void> {
  const { error } = await supabase.from('presences').upsert({
    seance_id: seanceId, etudiant_id: etudiantId,
    ecole_id: ecoleId, statut,
  }, { onConflict: 'seance_id,etudiant_id' });
  if (error) throw error;
}

// Chantier D : notification interne (message famille) sur marquage d'une absence.
// N'echoue jamais bruyamment : un echec de notification ne doit pas remonter a l'appelant.
export async function notifierAbsence(
  ecoleId: string, etudiantId: string, ueNom: string
): Promise<void> {
  try {
    await supabase.rpc('fn_notifier_evenement', {
      p_ecole_id: ecoleId,
      p_etudiant_id: etudiantId,
      p_type: 'absence',
      p_vars: { ue: ueNom },
    });
  } catch {
    // silencieux par design
  }
}
'@
$content1 = ApplyReplace $content1 $old1 $new1 "Patch D1 (notifierAbsence dans presences.service.ts)"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path1, $content1, $utf8NoBom)

# ── Fichier 2 : ModalSaisiePresence.tsx ──
$path2 = "src\modules\presences\components\ModalSaisiePresence.tsx"
$content2 = [System.IO.File]::ReadAllText($path2) -replace "`r`n", "`n"

$old2a = "import { fetchPresences, marquerPresence, toutMarquerPresent } from '../../../services/presences.service';"
$new2a = "import { fetchPresences, marquerPresence, notifierAbsence, toutMarquerPresent } from '../../../services/presences.service';"
$content2 = ApplyReplace $content2 $old2a $new2a "Patch D2 (import notifierAbsence)"

$old2b = @'
  async function handleMarquer(etudiantId: string, statut: StatutPresence) {
    setSaving(s => ({ ...s, [etudiantId]: true }));
    setPresMap(m => ({ ...m, [etudiantId]: statut }));
    try {
      await marquerPresence(seanceId, etudiantId, statut, ecoleId);
    } catch {
'@
$new2b = @'
  async function handleMarquer(etudiantId: string, statut: StatutPresence) {
    setSaving(s => ({ ...s, [etudiantId]: true }));
    setPresMap(m => ({ ...m, [etudiantId]: statut }));
    try {
      await marquerPresence(seanceId, etudiantId, statut, ecoleId);
      if (statut === 'absent') {
        void notifierAbsence(ecoleId, etudiantId, matiereNom);
      }
    } catch {
'@
$content2 = ApplyReplace $content2 $old2b $new2b "Patch D3 (appel notifierAbsence dans handleMarquer)"

[System.IO.File]::WriteAllText($path2, $content2, $utf8NoBom)

Write-Host "TOUS LES PATCHS CHANTIER D (ABSENCES) APPLIQUES AVEC SUCCES." -ForegroundColor Green