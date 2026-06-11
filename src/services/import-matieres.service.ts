// src/services/import-matieres.service.ts
// Import en masse de matières LMD depuis CSV ou Excel
// Format : Code | Nom | Coefficient | UE_code | Heures_CM | Heures_TD | Enseignant_nom

import { supabase } from './supabase';

export interface ImportMatiereLigne {
  code: string;
  nom: string;
  coefficient: number;
  ue_code: string;
  heures_cm?: number;
  heures_td?: number;
  enseignant_nom?: string;
  // résultat
  _ok?: boolean;
  _err?: string;
  _ue_id?: string;
  _ens_id?: string | null;
}

export function parseImportMatieres(text: string): ImportMatiereLigne[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
  const col = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));
  const iCode  = col(['code']);
  const iNom   = col(['nom','name','intitule','libelle']);
  const iCoef  = col(['coef','coefficient']);
  const iUE    = col(['ue','unite']);
  const iCM    = col(['cm','magistral']);
  const iTD    = col(['td']);
  const iEns   = col(['ens','enseignant','teacher']);

  if (iCode < 0) throw new Error('Colonne "Code" introuvable');
  if (iNom  < 0) throw new Error('Colonne "Nom" introuvable');
  if (iUE   < 0) throw new Error('Colonne "UE" (code UE) introuvable');

  return lines.slice(1)
    .map(l => {
      const c = l.split(/[,;]/);
      return {
        code:           c[iCode]?.trim().toUpperCase() ?? '',
        nom:            c[iNom]?.trim() ?? '',
        coefficient:    iCoef >= 0 ? parseFloat(c[iCoef]) || 1 : 1,
        ue_code:        c[iUE]?.trim().toUpperCase() ?? '',
        heures_cm:      iCM >= 0  ? parseInt(c[iCM]) || 0 : 0,
        heures_td:      iTD >= 0  ? parseInt(c[iTD]) || 0 : 0,
        enseignant_nom: iEns >= 0 ? c[iEns]?.trim() : undefined,
      };
    })
    .filter(r => r.code && r.nom && r.ue_code);
}

export function parseImportMatieresXLSX(data: Record<string, string>[]): ImportMatiereLigne[] {
  return data.map(row => {
    const key = (names: string[]) => Object.keys(row).find(k => names.some(n => k.toLowerCase().includes(n))) ?? '';
    return {
      code:           String(row[key(['code'])] ?? '').trim().toUpperCase(),
      nom:            String(row[key(['nom','name','intitule'])] ?? '').trim(),
      coefficient:    parseFloat(String(row[key(['coef','coefficient'])] ?? '1')) || 1,
      ue_code:        String(row[key(['ue','unite'])] ?? '').trim().toUpperCase(),
      heures_cm:      parseInt(String(row[key(['cm','magistral'])] ?? '0')) || 0,
      heures_td:      parseInt(String(row[key(['td'])] ?? '0')) || 0,
      enseignant_nom: String(row[key(['ens','enseignant'])] ?? '').trim() || undefined,
    };
  }).filter(r => r.code && r.nom && r.ue_code);
}

export async function importerMatieres(
  rows: ImportMatiereLigne[],
  ecoleId: string
): Promise<{ ok: number; skip: number; results: ImportMatiereLigne[] }> {
  // Charger toutes les UEs de l'école pour résoudre les codes
  const { data: ues } = await supabase
    .from('unites_enseignement')
    .select('id,code')
    .eq('ecole_id', ecoleId);

  const ueMap: Record<string, string> = {};
  (ues ?? []).forEach((u: any) => { ueMap[u.code.toUpperCase()] = u.id; });

  // Charger tous les enseignants pour résoudre les noms
  const { data: ens } = await supabase
    .from('enseignants')
    .select('id,nom')
    .eq('ecole_id', ecoleId)
    .eq('statut', 'actif');

  const ensMap: Record<string, string> = {};
  (ens ?? []).forEach((e: any) => { ensMap[e.nom.toUpperCase()] = e.id; });

  let ok = 0, skip = 0;
  const results: ImportMatiereLigne[] = [];

  for (const row of rows) {
    const ueId = ueMap[row.ue_code];
    if (!ueId) {
      skip++;
      results.push({ ...row, _ok: false, _err: `UE "${row.ue_code}" introuvable` });
      continue;
    }

    // Résoudre enseignant (fuzzy match sur le nom)
    let ensId: string | null = null;
    if (row.enseignant_nom) {
      const normNom = row.enseignant_nom.toUpperCase();
      ensId = ensMap[normNom]
        ?? Object.entries(ensMap).find(([k]) => k.includes(normNom) || normNom.includes(k))?.[1]
        ?? null;
    }

    const { error } = await supabase.from('matieres_lmd').upsert({
      ecole_id:     ecoleId,
      ue_id:        ueId,
      code:         row.code,
      nom:          row.nom,
      coefficient:  row.coefficient,
      heures_cm:    row.heures_cm ?? 0,
      heures_td:    row.heures_td ?? 0,
      enseignant_id: ensId,
    }, { onConflict: 'ecole_id,code' });

    if (!error) {
      ok++;
      results.push({ ...row, _ok: true, _ue_id: ueId, _ens_id: ensId });
    } else {
      skip++;
      results.push({ ...row, _ok: false, _err: error.message });
    }
  }

  return { ok, skip, results };
}
