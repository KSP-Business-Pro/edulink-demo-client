// src/services/accounting/comptabilite.calc.ts
// Fonctions de calcul PURES pour la comptabilite (aucun appel Supabase).
// Extrait de comptabilite.service.ts (B13). Les types restent definis dans
// comptabilite.service.ts pour eviter toute duplication ; l'import ci-dessous
// est "import type", entierement efface a la compilation (zero dependance
// circulaire au runtime).

import type { Facture, EtudiantCompta } from '../comptabilite.service';

// -- Formatage montant ----------------------------------------------------------
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA';
}

// -- Groupement par etudiant ------------------------------------------------------
export function grouperParEtudiant(factures: Facture[]): EtudiantCompta[] {
  const map: Record<string, EtudiantCompta> = {};
  factures.forEach(f => {
    const id = f.etudiant_id;
    if (!map[id]) map[id] = { etudiant: f.etudiants, factures: [], attendu: 0, encaisse: 0 };
    map[id].factures.push(f);
    map[id].attendu  += f.montant_total || f.montant || 0;
    map[id].encaisse += f.montant_paye || 0;
  });
  return Object.values(map).sort((a, b) => (b.attendu - b.encaisse) - (a.attendu - a.encaisse));
}