// src/modules/comptabilite/components/ModalFacture.tsx
import { useState, useEffect } from 'react';
import type { TypeFrais } from '../../../services/comptabilite.service';
import { creerFacture, RUBRIQUE_LABELS, fetchSemestresActifs, facturationMasse } from '../../../services/comptabilite.service';
import { supabase } from '../../../services/supabase';

// ── Modal Nouvelle Facture ────────────────────────────────────────────────────
interface ModalFactureProps {
  ecoleId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface EtudiantOpt { id: string; nom: string; prenom: string; matricule: string }

const TYPES: TypeFrais[] = ['scolarite', 'inscription', 'examen', 'bibliotheque', 'autre'];
const anneeDefaut = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

export function ModalFacture({ ecoleId, onClose, onSaved }: ModalFactureProps) {
  const [etudiants, setEtudiants] = useState<EtudiantOpt[]>([]);
  const [etudiantId, setEtudiantId] = useState('');
  const [typeFrais, setTypeFrais]   = useState<TypeFrais>('scolarite');
  const [libelle, setLibelle]       = useState(RUBRIQUE_LABELS['scolarite'] + ' ' + anneeDefaut);
  const [libelleManual, setLibelleManual] = useState(false);
  const [montant, setMontant]       = useState('');
  const [annee, setAnnee]           = useState(anneeDefaut);
  const [echeance, setEcheance]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    supabase.from('etudiants').select('id,nom,prenom,matricule')
      .eq('ecole_id', ecoleId).order('nom')
      .then(({ data }) => setEtudiants((data ?? []) as EtudiantOpt[]));
  }, [ecoleId]);

  // Auto-libellé
  useEffect(() => {
    if (!libelleManual) setLibelle(RUBRIQUE_LABELS[typeFrais] + (annee ? ' ' + annee : ''));
  }, [typeFrais, annee]); // eslint-disable-line

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await creerFacture({ ecole_id: ecoleId, etudiant_id: etudiantId, type_frais: typeFrais, libelle: libelle.trim(), montant_total: parseFloat(montant), annee_scolaire: annee || null, date_echeance: echeance || null });
      onSaved(); onClose();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>+ Nouvelle Facture</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={{ marginBottom: '.85rem' }}>
            <label>Étudiant *</label>
            <select value={etudiantId} onChange={e => setEtudiantId(e.target.value)} style={{ width: '100%', marginTop: 4 }} required>
              <option value="">— Sélectionner —</option>
              {etudiants.map(e => <option key={e.id} value={e.id}>{e.nom} {e.prenom} ({e.matricule ?? '—'})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Type de frais *</label>
              <select value={typeFrais} onChange={e => { setTypeFrais(e.target.value as TypeFrais); setLibelleManual(false); }} style={{ width: '100%', marginTop: 4 }} required>
                {TYPES.map(t => <option key={t} value={t}>{RUBRIQUE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label>Année scolaire</label>
              <input type="text" value={annee} onChange={e => { setAnnee(e.target.value); setLibelleManual(false); }} style={{ width: '100%', marginTop: 4 }} placeholder="2025-2026" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Libellé *</label>
              <input type="text" value={libelle} onChange={e => { setLibelle(e.target.value); setLibelleManual(true); }} style={{ width: '100%', marginTop: 4 }} required />
            </div>
            <div>
              <label>Montant (FCFA) *</label>
              <input type="number" value={montant} onChange={e => setMontant(e.target.value)} style={{ width: '100%', marginTop: 4 }} min={1} step="any" required />
            </div>
          </div>
          <div style={{ marginBottom: '1.2rem' }}>
            <label>Date d'échéance</label>
            <input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
          </div>
          {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-blue" disabled={loading}>{loading ? 'Création…' : 'Créer la facture →'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal Facturation en masse ────────────────────────────────────────────────
interface ModalFactureMasseProps {
  ecoleId: string;
  onClose: () => void;
  onSaved: (ok: number, skip: number) => void;
}

export function ModalFactureMasse({ ecoleId, onClose, onSaved }: ModalFactureMasseProps) {
  const [semestres, setSemestres] = useState<{ id: string; libelle: string }[]>([]);
  const [semId, setSemId]         = useState('');
  const [typeFrais, setTypeFrais] = useState<TypeFrais>('scolarite');
  const [libelle, setLibelle]     = useState(RUBRIQUE_LABELS['scolarite'] + ' ' + anneeDefaut);
  const [libelleManual, setLibelleManual] = useState(false);
  const [montant, setMontant]     = useState('');
  const [annee, setAnnee]         = useState(anneeDefaut);
  const [echeance, setEcheance]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    fetchSemestresActifs(ecoleId).then(data => setSemestres(data as { id: string; libelle: string }[]));
  }, [ecoleId]);

  useEffect(() => {
    if (!libelleManual) setLibelle(RUBRIQUE_LABELS[typeFrais] + (annee ? ' ' + annee : ''));
  }, [typeFrais, annee]); // eslint-disable-line

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm(`Créer une facture "${libelle}" de ${montant} FCFA pour tous les étudiants inscrits dans ce semestre ?`)) return;
    setLoading(true); setError(null);
    try {
      const { ok, skip } = await facturationMasse({ ecoleId, semestreId: semId, typeFrais, libelle: libelle.trim(), montant: parseFloat(montant), anneeScolaire: annee, dateEcheance: echeance || null });
      onSaved(ok, skip); onClose();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>📋 Facturer une promotion</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={{ marginBottom: '.85rem' }}>
            <label>Semestre / Promotion *</label>
            <select value={semId} onChange={e => setSemId(e.target.value)} style={{ width: '100%', marginTop: 4 }} required>
              <option value="">— Sélectionner —</option>
              {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Type de frais *</label>
              <select value={typeFrais} onChange={e => { setTypeFrais(e.target.value as TypeFrais); setLibelleManual(false); }} style={{ width: '100%', marginTop: 4 }} required>
                {TYPES.map(t => <option key={t} value={t}>{RUBRIQUE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label>Année scolaire *</label>
              <input type="text" value={annee} onChange={e => { setAnnee(e.target.value); setLibelleManual(false); }} style={{ width: '100%', marginTop: 4 }} required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
            <div>
              <label>Libellé *</label>
              <input type="text" value={libelle} onChange={e => { setLibelle(e.target.value); setLibelleManual(true); }} style={{ width: '100%', marginTop: 4 }} required />
            </div>
            <div>
              <label>Montant / étudiant (FCFA) *</label>
              <input type="number" value={montant} onChange={e => setMontant(e.target.value)} style={{ width: '100%', marginTop: 4 }} min={1} step="any" required />
            </div>
          </div>
          <div style={{ marginBottom: '1.2rem' }}>
            <label>Date d'échéance</label>
            <input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
          </div>
          {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-blue" disabled={loading}>{loading ? 'Génération…' : 'Générer les factures →'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
