// src/modules/comptabilite/components/ModalFactureGrille.tsx
// Bloc 2 comptabilité (fin) — Facturer depuis une grille tarifaire (indiv. + masse)

import { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabase';
import { fetchGrillesTarifaires, type GrilleTarifaire } from '../../../services/parametrage-financier.service';
import { fetchSemestresActifs, genererFactureDepuisGrille, genererFacturesDepuisGrillePourPromotion } from '../../../services/comptabilite.service';

interface Props {
  ecoleId: string;
  onClose: () => void;
  onSaved: (ok: number, skip: number) => void;
}

interface EtudiantOpt { id: string; nom: string; prenom: string; matricule: string }

function fmt(n: number) { return n.toLocaleString('fr-FR') + ' FCFA'; }

export default function ModalFactureGrille({ ecoleId, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<'individuel' | 'promotion'>('individuel');
  const [grilles, setGrilles] = useState<GrilleTarifaire[]>([]);
  const [grilleId, setGrilleId] = useState('');
  const [etudiants, setEtudiants] = useState<EtudiantOpt[]>([]);
  const [etudiantId, setEtudiantId] = useState('');
  const [semestres, setSemestres] = useState<{ id: string; libelle: string }[]>([]);
  const [semestreId, setSemestreId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGrillesTarifaires(ecoleId).then(setGrilles);
    supabase.from('etudiants').select('id,nom,prenom,matricule').eq('ecole_id', ecoleId).order('nom')
      .then(({ data }) => setEtudiants((data ?? []) as EtudiantOpt[]));
    fetchSemestresActifs(ecoleId).then(data => setSemestres(data as { id: string; libelle: string }[]));
  }, [ecoleId]);

  const grilleSelectionnee = grilles.find(g => g.id === grilleId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!grilleId) { setError('Sélectionne une grille tarifaire.'); return; }
    setLoading(true);
    try {
      if (mode === 'individuel') {
        const { skipped } = await genererFactureDepuisGrille(grilleId, etudiantId);
        if (skipped) { setError('Cet étudiant a déjà une facture générée depuis cette grille.'); setLoading(false); return; }
        onSaved(1, 0); onClose();
      } else {
        if (!confirm(`Générer une facture de ${grilleSelectionnee ? fmt(grilleSelectionnee.montant) : ''} pour tous les étudiants inscrits dans ce semestre ?`)) { setLoading(false); return; }
        const { ok, skip } = await genererFacturesDepuisGrillePourPromotion(grilleId, semestreId);
        onSaved(ok, skip); onClose();
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>🧮 Facturer depuis une grille tarifaire</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {grilles.length === 0 ? (
          <div style={{ padding: '1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 13, color: '#92400e' }}>
            ⚠️ Aucune grille tarifaire configurée. Va dans l'onglet "⚙ Paramétrage financier" pour en créer une.
          </div>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Choix du mode */}
            <div className="tabs" style={{ marginBottom: '1.1rem' }}>
              <button type="button" className={`tab${mode === 'individuel' ? ' active' : ''}`} onClick={() => setMode('individuel')}>Un étudiant</button>
              <button type="button" className={`tab${mode === 'promotion' ? ' active' : ''}`} onClick={() => setMode('promotion')}>Une promotion</button>
            </div>

            <div style={{ marginBottom: '.85rem' }}>
              <label htmlFor="fg-grille">Grille tarifaire *</label>
              <select id="fg-grille" name="grille_tarifaire_id" value={grilleId} onChange={e => setGrilleId(e.target.value)}
                style={{ width: '100%', marginTop: 4 }} required>
                <option value="">— Sélectionner —</option>
                {grilles.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.types_frais?.libelle} — {g.programmes_lmd?.intitule ?? 'Tous programmes'} {g.niveau ?? ''} — {fmt(g.montant)}
                  </option>
                ))}
              </select>
            </div>

            {grilleSelectionnee && (
              <div style={{ padding: '.7rem .9rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12.5, color: '#0369a1', marginBottom: '.85rem' }}>
                Montant : <strong>{fmt(grilleSelectionnee.montant)}</strong> · Année : {grilleSelectionnee.annees_academiques?.libelle ?? '—'}
              </div>
            )}

            {mode === 'individuel' ? (
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="fg-etudiant">Étudiant *</label>
                <select id="fg-etudiant" name="etudiant_id" value={etudiantId} onChange={e => setEtudiantId(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }} required>
                  <option value="">— Sélectionner —</option>
                  {etudiants.map(e => <option key={e.id} value={e.id}>{e.nom} {e.prenom} ({e.matricule ?? '—'})</option>)}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="fg-semestre">Semestre / Promotion *</label>
                <select id="fg-semestre" name="semestre_id" value={semestreId} onChange={e => setSemestreId(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }} required>
                  <option value="">— Sélectionner —</option>
                  {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Les étudiants ayant déjà une facture pour cette grille seront ignorés (pas de double facturation).</div>
              </div>
            )}

            {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
              <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn-blue" disabled={loading}>{loading ? 'Génération…' : 'Générer →'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
