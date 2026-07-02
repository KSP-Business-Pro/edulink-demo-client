// src/modules/parametres/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

interface Ecole {
  id: string; nom: string; type: string; ville: string;
  pays: string; email: string | null; telephone: string | null;
}

interface ReglesEcole {
  ecole_id: string;
  seuil_validation_ue: number;
  seuil_note_plancher: number;
  compensation_active: boolean;
  note_plancher_active: boolean;
  regle_rattrapage: 'max' | 'ecrase';
  seuil_absence_pct: number;
  blocage_releve_impaye: boolean;
  tolerance_impaye_releve: number;
  controle_credits_actif: boolean;
  seuil_credits_avancement: number;
  notif_releve_active: boolean;
  notif_releve_sujet: string;
  notif_paiement_active: boolean;
  notif_paiement_sujet: string;
  notif_absence_active: boolean;
  notif_absence_sujet: string;
}

interface AnneeAcademique {
  libelle: string; date_debut: string | null; date_fin: string | null; est_courante: boolean;
}

type ModalType = 'ecole' | 'regles' | 'notifs' | null;

const DEFAULT_REGLES: Partial<ReglesEcole> = {
  seuil_validation_ue: 10, seuil_note_plancher: 5,
  compensation_active: false, note_plancher_active: false,
  regle_rattrapage: 'max', seuil_absence_pct: 30,
  blocage_releve_impaye: false, tolerance_impaye_releve: 0,
  controle_credits_actif: false, seuil_credits_avancement: 24,
  notif_releve_active: true,   notif_releve_sujet:   'Relevé de notes — {semestre}',
  notif_paiement_active: true, notif_paiement_sujet: 'Confirmation de paiement — {etablissement}',
  notif_absence_active: false, notif_absence_sujet:  'Alerte absences — {ue}',
};

export default function ParametresPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles] = useState<{id:string;nom:string}[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [ecole, setEcole]   = useState<Ecole | null>(null);
  const [regles, setRegles] = useState<ReglesEcole | null>(null);
  const [annee, setAnnee]   = useState<AnneeAcademique | null>(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal]   = useState<ModalType>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Form states
  const [ecoleForm, setEcoleForm] = useState({ nom: '', type: 'grande_ecole', pays: 'Bénin', ville: '', telephone: '', email: '' });
  const [reglesForm, setReglesForm] = useState<Partial<ReglesEcole>>(DEFAULT_REGLES);
  const [notifsForm, setNotifsForm] = useState({
    notif_releve_active: true,   notif_releve_sujet: 'Relevé de notes — {semestre}',
    notif_paiement_active: true, notif_paiement_sujet: 'Confirmation de paiement — {etablissement}',
    notif_absence_active: false, notif_absence_sujet: 'Alerte absences — {ue}',
  });

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const [{ data: e }, { data: r }, { data: a }] = await Promise.all([
        supabase.from('ecoles').select('*').eq('id', ecoleId).single(),
        supabase.from('regles_ecole').select('*').eq('ecole_id', ecoleId).maybeSingle(),
        supabase.from('annees_academiques').select('libelle,date_debut,date_fin,est_courante').eq('ecole_id', ecoleId).eq('est_courante', true).maybeSingle(),
      ]);
      setEcole(e as Ecole);
      setRegles(r as ReglesEcole);
      setAnnee(a as AnneeAcademique);
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  // ── Ouvrir modals ────────────────────────────────────────────────────────────
  function openEcoleModal() {
    if (!ecole) return;
    setEcoleForm({ nom: ecole.nom, type: ecole.type ?? 'grande_ecole', pays: ecole.pays ?? 'Bénin', ville: ecole.ville ?? '', telephone: ecole.telephone ?? '', email: ecole.email ?? '' });
    setModal('ecole');
  }

  function openReglesModal() {
    setReglesForm({ ...DEFAULT_REGLES, ...regles });
    setModal('regles');
  }

  function openNotifsModal() {
    setNotifsForm({
      notif_releve_active:   regles?.notif_releve_active   ?? true,
      notif_releve_sujet:    regles?.notif_releve_sujet    ?? 'Relevé de notes — {semestre}',
      notif_paiement_active: regles?.notif_paiement_active ?? true,
      notif_paiement_sujet:  regles?.notif_paiement_sujet  ?? 'Confirmation de paiement — {etablissement}',
      notif_absence_active:  regles?.notif_absence_active  ?? false,
      notif_absence_sujet:   regles?.notif_absence_sujet   ?? 'Alerte absences — {ue}',
    });
    setModal('notifs');
  }

  // ── Sauvegardes ──────────────────────────────────────────────────────────────
  async function saveEcole(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const { error } = await supabase.from('ecoles').update({
        nom: ecoleForm.nom.trim(), type: ecoleForm.type,
        pays: ecoleForm.pays.trim(), ville: ecoleForm.ville.trim(),
        telephone: ecoleForm.telephone.trim() || null, email: ecoleForm.email.trim() || null,
      }).eq('id', ecoleId);
      if (error) throw error;
      setModal(null); await load(); showToast('Établissement mis à jour ✓');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function saveRegles(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const { error } = await supabase.from('regles_ecole').upsert(
        { ...reglesForm, ecole_id: ecoleId }, { onConflict: 'ecole_id' }
      );
      if (error) throw error;
      setModal(null); await load(); showToast('Règles LMD mises à jour ✓');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function saveNotifs(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const { error } = await supabase.from('regles_ecole').upsert(
        { ...notifsForm, ecole_id: ecoleId }, { onConflict: 'ecole_id' }
      );
      if (error) throw error;
      setModal(null); await load(); showToast('Notifications mises à jour ✓');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  const R = (k: keyof ReglesEcole) => reglesForm[k];

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toast.type === 'success' ? '#059669' : '#dc2626', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      <div className="top">
        <div><h2>Paramètres</h2><div className="page-subtitle">Configuration de l'établissement et règles LMD</div></div>
      </div>

      {loading ? <div className="loading">Chargement…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

          {/* Établissement */}
          <div className="card" style={{ padding: '1.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>🏫 Établissement</div>
              <button className="btn-ghost btn-sm" onClick={openEcoleModal}>✏ Modifier</button>
            </div>
            {ecole ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {[
                  { label: 'Nom', val: ecole.nom },
                  { label: 'Type', val: ecole.type },
                  { label: 'Ville', val: ecole.ville ?? '—' },
                  { label: 'Pays', val: ecole.pays ?? '—' },
                  { label: 'Email', val: ecole.email ?? '—' },
                  { label: 'Téléphone', val: ecole.telephone ?? '—' },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '.5rem .75rem', background: '#f9fafb', borderRadius: 7 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{val}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: '#9ca3af', fontSize: 13 }}>Aucune donnée</p>}
          </div>

          {/* Année académique */}
          <div className="card" style={{ padding: '1.2rem' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '1rem' }}>📅 Année académique courante</div>
            {annee ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {[
                  { label: 'Libellé', val: annee.libelle },
                  { label: 'Statut', val: <span className="badge green">Courante</span> },
                  { label: 'Début', val: annee.date_debut ?? '—' },
                  { label: 'Fin', val: annee.date_fin ?? '—' },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem .75rem', background: '#f9fafb', borderRadius: 7 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{val}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: '#9ca3af', fontSize: 13 }}>Aucune année courante — définissez-en une dans Semestres.</p>}
          </div>

          {/* Règles LMD CAMES */}
          <div className="card" style={{ padding: '1.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>⚖️ Règles LMD CAMES</div>
              <button className="btn-ghost btn-sm" onClick={openReglesModal}>✏ Modifier</button>
            </div>
            {regles ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {[
                  { label: 'Compensation entre UE', badge: regles.compensation_active ? 'green' : 'gray', val: regles.compensation_active ? 'Activée' : 'Désactivée' },
                  { label: 'Note plancher', badge: regles.note_plancher_active ? 'amber' : 'gray', val: regles.note_plancher_active ? `Seuil : ${regles.seuil_note_plancher}/20` : 'Désactivée' },
                  { label: 'Règle rattrapage', badge: 'blue', val: regles.regle_rattrapage === 'max' ? 'Max des deux sessions' : 'Écrase la normale' },
                  { label: 'Seuil validation UE', badge: 'teal', val: `${regles.seuil_validation_ue}/20` },
                  { label: 'Blocage relevé si impayés', badge: regles.blocage_releve_impaye ? 'red' : 'gray', val: regles.blocage_releve_impaye ? (regles.tolerance_impaye_releve > 0 ? `Activé · tol. ${regles.tolerance_impaye_releve.toLocaleString('fr-FR')} FCFA` : 'Activé') : 'Désactivé' },
                  { label: 'Contrôle crédits inscription', badge: regles.controle_credits_actif ? 'blue' : 'gray', val: regles.controle_credits_actif ? `Activé · seuil ${regles.seuil_credits_avancement}/30` : 'Désactivé' },
                ].map(({ label, badge, val }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.65rem .75rem', background: '#f9fafb', borderRadius: 7, border: '1px solid #f3f4f6' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</div>
                    </div>
                    <span className={`badge ${badge}`}>{val}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: '#9ca3af', fontSize: 13 }}>Règles non configurées</p>}
          </div>

          {/* Mentions CAMES */}
          <div className="card" style={{ padding: '1.2rem' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '1rem' }}>🏅 Barème des mentions CAMES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
              {[
                { label: 'Très Bien',  seuil: '≥ 16/20', color: '#7c3aed', bg: '#ede9fe' },
                { label: 'Bien',       seuil: '≥ 14/20', color: '#059669', bg: '#dcfce7' },
                { label: 'Assez Bien', seuil: '≥ 12/20', color: '#1d4ed8', bg: '#dbeafe' },
                { label: 'Passable',   seuil: '≥ 10/20', color: '#6b7280', bg: '#f3f4f6' },
                { label: 'Ajourné',    seuil: '< 10/20',  color: '#dc2626', bg: '#fee2e2' },
              ].map(({ label, seuil, color, bg }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem 1rem', background: bg, borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 90 }}>{label}</span>
                  <span style={{ fontSize: 12, color, flex: 1 }}>{seuil}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notifications email */}
          <div className="card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>📬 Notifications email</div>
              <button className="btn-ghost btn-sm" onClick={openNotifsModal}>✏ Modifier</button>
            </div>
            {regles ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                {[
                  { icon: '📋', label: 'Publication de relevé', desc: "Envoyé automatiquement lors de la publication d'un relevé officiel", actif: regles.notif_releve_active, sujet: regles.notif_releve_sujet },
                  { icon: '💳', label: 'Confirmation de paiement', desc: "Envoyé après enregistrement d'un paiement", actif: regles.notif_paiement_active, sujet: regles.notif_paiement_sujet },
                  { icon: '⚠️', label: "Alerte absences", desc: "Envoyé quand le taux d'absence dépasse le seuil configuré", actif: regles.notif_absence_active, sujet: regles.notif_absence_sujet },
                ].map(({ icon, label, desc, actif, sujet }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', padding: '.85rem 1rem', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 20, marginTop: 1 }}>{icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{desc}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontFamily: 'monospace', background: '#fff', padding: '3px 8px', borderRadius: 4, border: '1px solid #e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sujet}</div>
                      </div>
                    </div>
                    <span className={`badge ${actif ? 'green' : 'gray'}`} style={{ flexShrink: 0, marginTop: 2 }}>{actif ? 'Activée' : 'Désactivée'}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: '#9ca3af', fontSize: 13 }}>Règles non configurées</p>}
          </div>
        </div>
      )}

      {/* ── Modal Établissement ── */}
      {modal === 'ecole' && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 500, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>🏫 Modifier l'établissement</h3>
              <button className="btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={saveEcole} autoComplete="off">
              <div style={{ marginBottom: '.85rem' }}>
                <label>Nom de l'établissement *</label>
                <input type="text" value={ecoleForm.nom} onChange={e => setEcoleForm(f => ({ ...f, nom: e.target.value }))} style={{ width: '100%', marginTop: 4 }} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label>Type</label>
                  <select value={ecoleForm.type} onChange={e => setEcoleForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', marginTop: 4 }}>
                    {['universite', 'grande_ecole', 'école', 'institut', 'lycee'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label>Pays</label>
                  <input type="text" value={ecoleForm.pays} onChange={e => setEcoleForm(f => ({ ...f, pays: e.target.value }))} style={{ width: '100%', marginTop: 4 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div><label>Ville</label><input type="text" value={ecoleForm.ville} onChange={e => setEcoleForm(f => ({ ...f, ville: e.target.value }))} style={{ width: '100%', marginTop: 4 }} /></div>
                <div><label>Téléphone</label><input type="tel" value={ecoleForm.telephone} onChange={e => setEcoleForm(f => ({ ...f, telephone: e.target.value }))} style={{ width: '100%', marginTop: 4 }} /></div>
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <label>Email</label>
                <input type="email" value={ecoleForm.email} onChange={e => setEcoleForm(f => ({ ...f, email: e.target.value }))} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Règles LMD ── */}
      {modal === 'regles' && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 520, padding: '1.5rem', maxHeight: '85vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>⚖️ Règles LMD CAMES</h3>
              <button className="btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={saveRegles} autoComplete="off">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label>Seuil validation UE (/ 20) *</label>
                  <input type="number" value={reglesForm.seuil_validation_ue ?? 10} onChange={e => setReglesForm(f => ({ ...f, seuil_validation_ue: parseFloat(e.target.value) }))} style={{ width: '100%', marginTop: 4 }} min={0} max={20} step={0.5} required />
                </div>
                <div>
                  <label>Seuil note plancher (/ 20)</label>
                  <input type="number" value={reglesForm.seuil_note_plancher ?? 5} onChange={e => setReglesForm(f => ({ ...f, seuil_note_plancher: parseFloat(e.target.value) }))} style={{ width: '100%', marginTop: 4 }} min={0} max={20} step={0.5} />
                </div>
              </div>
              {[
                { key: 'compensation_active', label: 'Compensation entre UE', desc: 'La moyenne générale peut compenser les UE faibles' },
                { key: 'note_plancher_active', label: 'Note plancher active', desc: 'Une note en dessous du seuil bloque la validation' },
              ].map(({ key, label, desc }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', cursor: 'pointer', padding: '.75rem', background: '#f9fafb', borderRadius: 8, marginBottom: '.75rem' }}>
                  <input type="checkbox" checked={!!(reglesForm as any)[key]} onChange={e => setReglesForm(f => ({ ...f, [key]: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', textTransform: 'none', letterSpacing: 0 }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{desc}</div>
                  </div>
                </label>
              ))}
              <div style={{ marginBottom: '.85rem' }}>
                <label>Règle de rattrapage</label>
                <select value={reglesForm.regle_rattrapage ?? 'max'} onChange={e => setReglesForm(f => ({ ...f, regle_rattrapage: e.target.value as 'max' | 'ecrase' }))} style={{ width: '100%', marginTop: 4 }}>
                  <option value="max">Max des deux sessions</option>
                  <option value="ecrase">Écrase la normale</option>
                </select>
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label>Seuil exclusion absences (%)</label>
                <input type="number" value={reglesForm.seuil_absence_pct ?? 30} onChange={e => setReglesForm(f => ({ ...f, seuil_absence_pct: parseInt(e.target.value) }))} style={{ width: '100%', marginTop: 4 }} min={0} max={100} step={5} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.75rem', cursor: 'pointer', padding: '.75rem', background: '#f9fafb', borderRadius: 8, marginBottom: '.75rem' }}>
                <input type="checkbox" checked={reglesForm.blocage_releve_impaye ?? false} onChange={e => setReglesForm(f => ({ ...f, blocage_releve_impaye: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', textTransform: 'none', letterSpacing: 0 }}>Bloquer le relevé si impayés</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Empêche la publication tant que l'étudiant a un solde dû</div>
                </div>
              </label>
              <div style={{ marginBottom: '.85rem' }}>
                <label>Tolérance d'impayé (FCFA)</label>
                <input type="number" value={reglesForm.tolerance_impaye_releve ?? 0} onChange={e => setReglesForm(f => ({ ...f, tolerance_impaye_releve: parseFloat(e.target.value) }))} style={{ width: '100%', marginTop: 4 }} min={0} step={1000} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.75rem', cursor: 'pointer', padding: '.75rem', background: '#f9fafb', borderRadius: 8, marginBottom: '.75rem' }}>
                <input type="checkbox" checked={reglesForm.controle_credits_actif ?? false} onChange={e => setReglesForm(f => ({ ...f, controle_credits_actif: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', textTransform: 'none', letterSpacing: 0 }}>Contrôle crédits à l'inscription</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Avertit si crédits insuffisants pour avancer</div>
                </div>
              </label>
              <div style={{ marginBottom: '1.2rem' }}>
                <label>Seuil crédits par semestre (sur 30)</label>
                <input type="number" value={reglesForm.seuil_credits_avancement ?? 24} onChange={e => setReglesForm(f => ({ ...f, seuil_credits_avancement: parseInt(e.target.value) }))} style={{ width: '100%', marginTop: 4 }} min={0} max={30} step={3} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Notifications ── */}
      {modal === 'notifs' && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>📬 Notifications email</h3>
              <button className="btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={saveNotifs} autoComplete="off">
              {[
                { key: 'releve',   icon: '📋', label: 'Publication de relevé',    defSujet: 'Relevé de notes — {semestre}' },
                { key: 'paiement', icon: '💳', label: 'Confirmation de paiement', defSujet: 'Confirmation de paiement — {etablissement}' },
                { key: 'absence',  icon: '⚠️', label: 'Alerte absences',          defSujet: 'Alerte absences — {ue}' },
              ].map(({ key, icon, label, defSujet }) => (
                <div key={key} style={{ padding: '.85rem 1rem', background: '#f9fafb', borderRadius: 10, border: '1px solid #f3f4f6', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.6rem' }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flex: 1, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontWeight: 600, fontSize: 13, color: '#111827', margin: 0 }}>
                      <input type="checkbox"
                        checked={(notifsForm as any)[`notif_${key}_active`]}
                        onChange={e => setNotifsForm(f => ({ ...f, [`notif_${key}_active`]: e.target.checked }))}
                        style={{ width: 14, height: 14, margin: 0 }} />
                      {label}
                    </label>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>Sujet de l'email</label>
                    <input type="text"
                      value={(notifsForm as any)[`notif_${key}_sujet`]}
                      onChange={e => setNotifsForm(f => ({ ...f, [`notif_${key}_sujet`]: e.target.value }))}
                      style={{ width: '100%', marginTop: 4 }} placeholder={defSujet} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
