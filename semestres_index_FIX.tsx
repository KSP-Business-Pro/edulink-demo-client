// @ts-nocheck
// src/modules/semestres/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type { Semestre, AnneeAcademique, Programme } from '../../types/referentiel.types';
import { STATUT_SEMESTRE_LABEL } from '../../types/referentiel.types';
import {
  fetchSemestres, fetchAnneesAcademiques, fetchProgrammes,
  deleteSemestre,
} from '../../services/referentiel.service';
import ModalSemestre from '../programmes/components/ModalSemestre';
import ModalAnnee    from './components/ModalAnnee';
import ResponsiveTable, { type RTColumn } from '../../components/ResponsiveTable';

type Tab = 'semestres' | 'annees';
interface EcoleOption { id: string; nom: string }

interface SemestreAvecSessions extends Semestre {
  sessions_evaluation?: { id: string; type_session: string; statut: string }[];
}

interface AnneeEtendue extends AnneeAcademique {
  date_debut?: string | null;
  date_fin?: string | null;
  est_courante?: boolean;
}

const STATUT_COLOR: Record<string, string> = { planifie: 'gray', en_cours: 'green', cloture: 'blue', archive: 'gray' };

// ── Colonnes du tableau Semestres ──────────────────────────────────────────
const semestreColumns: RTColumn<SemestreAvecSessions>[] = [
  {
    key: 'niveau',
    label: 'Niveau',
    render: s => {
      const niveauColor = s.niveau?.startsWith('L') ? '#1d4ed8' : s.niveau?.startsWith('M') ? '#7c3aed' : '#0d9488';
      const niveauBg    = s.niveau?.startsWith('L') ? '#dbeafe' : s.niveau?.startsWith('M') ? '#ede9fe' : '#ccfbf1';
      return <span style={{ background: niveauBg, color: niveauColor, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.niveau}</span>;
    },
  },
  {
    key: 'libelle',
    label: 'Libellé',
    primary: true,
    render: s => <strong>{s.libelle}</strong>,
  },
  {
    key: 'programme',
    label: 'Programme',
    render: s => <span style={{ fontSize: 12, color: '#6b7280' }}>{s.programmes_lmd?.intitule ?? '—'}</span>,
  },
  {
    key: 'annee',
    label: 'Année',
    render: s => <span style={{ fontSize: 12 }}>{s.annees_academiques?.libelle ?? '—'}</span>,
  },
  {
    key: 'periode',
    label: 'Période',
    hideOnMobile: true,
    render: s => <span style={{ fontSize: 12, color: '#6b7280' }}>{s.date_debut ? `${s.date_debut} → ${s.date_fin ?? '?'}` : '—'}</span>,
  },
  {
    key: 'statut',
    label: 'Statut',
    render: s => <span className={`badge ${STATUT_COLOR[s.statut] ?? 'gray'}`}>{STATUT_SEMESTRE_LABEL[s.statut]}</span>,
  },
  {
    key: 'sessions',
    label: 'Sessions',
    render: s => {
      const sessions = s.sessions_evaluation ?? [];
      const norm = sessions.find(x => x.type_session === 'normale');
      const ratt = sessions.find(x => x.type_session === 'rattrapage');
      return (
        <>
          <span className={`badge ${norm ? 'green' : 'gray'}`} style={{ marginRight: 3 }}>Normale</span>
          <span className={`badge ${ratt ? 'amber' : 'gray'}`}>Rattrapage</span>
        </>
      );
    },
  },
];

// ── Colonnes du tableau Années académiques ─────────────────────────────────
const anneeColumns: RTColumn<AnneeEtendue>[] = [
  {
    key: 'libelle',
    label: 'Libellé',
    primary: true,
    render: a => <strong>{a.libelle}</strong>,
  },
  {
    key: 'periode',
    label: 'Période',
    render: a => <span style={{ fontSize: 12, color: '#6b7280' }}>{a.date_debut ? `${a.date_debut} → ${a.date_fin ?? '?'}` : '—'}</span>,
  },
  {
    key: 'statut',
    label: 'Statut',
    render: a => a.est_courante ? <span className="badge green">Courante</span> : <span className="badge gray">Archivée</span>,
  },
];

export default function SemestresPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [tab, setTab]             = useState<Tab>('semestres');
  const [semestres, setSemestres] = useState<SemestreAvecSessions[]>([]);
  const [annees, setAnnees]       = useState<AnneeEtendue[]>([]);
  const [programmes, setProgs]    = useState<Programme[]>([]);
  const [loading, setLoading]     = useState(false);

  const [modalSem, setModalSem]   = useState<{ open: boolean; item: Semestre | null }>({ open: false, item: null });
  const [modalAnnee, setModalAnnee] = useState<{ open: boolean; item: AnneeEtendue | null }>({ open: false, item: null });
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const loadAll = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      // RPCs SECURITY DEFINER — contournent RLS
      const { data: sems } = await supabase.rpc('fn_get_semestres', { p_ecole_id: ecoleId });
      const { data: ans }  = await supabase.rpc('fn_get_annees_academiques', { p_ecole_id: ecoleId });
      const progs = await fetchProgrammes(ecoleId);
      setSemestres((sems ?? []) as SemestreAvecSessions[]);
      setAnnees((ans ?? []) as AnneeEtendue[]);
      setProgs(progs);
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleDeleteSem(s: Semestre) {
    if (!confirm(`Supprimer "${s.libelle}" ? Attention : notes et présences liées seront perdues.`)) return;
    try { await deleteSemestre(s.id); await loadAll(); showToast('Semestre supprimé'); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDeleteAnnee(a: AnneeEtendue) {
    if (!confirm(`Supprimer "${a.libelle}" ?\nAttention : les semestres et promotions liés seront affectés.`)) return;
    try {
      const { error } = await supabase.from('annees_academiques').delete().eq('id', a.id);
      if (error) throw error;
      await loadAll(); showToast('Année supprimée');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDefinirCourante(id: string) {
    try {
      await supabase.from('annees_academiques').update({ est_courante: false }).eq('ecole_id', ecoleId);
      await supabase.from('annees_academiques').update({ est_courante: true }).eq('id', id);
      await loadAll(); showToast('Année courante définie ✓');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  const anneeActive = annees.find(a => a.est_courante);
  const toastBg = { success: '#059669', error: '#dc2626' };

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}
      <div className="top">
        <div>
          <h2>Semestres</h2>
          <div className="page-subtitle">
            Gestion des semestres et années académiques
            {anneeActive && <span style={{ marginLeft: 8, fontSize: 12, color: '#059669', fontWeight: 600 }}>· Année courante : {anneeActive.libelle}</span>}
          </div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select id="semestres-ecole" name="ecole" value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          {tab === 'semestres' && <button className="btn-blue" onClick={() => setModalSem({ open: true, item: null })}>+ Semestre</button>}
          {tab === 'annees' && <button className="btn-blue" onClick={() => setModalAnnee({ open: true, item: null })}>+ Année académique</button>}
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: '1.25rem' }}>
        <button className={`tab${tab === 'semestres' ? ' active' : ''}`} onClick={() => setTab('semestres')}>Semestres ({semestres.length})</button>
        <button className={`tab${tab === 'annees' ? ' active' : ''}`} onClick={() => setTab('annees')}>Années académiques ({annees.length})</button>
      </div>
      {loading && <div className="loading">Chargement…</div>}
      {!loading && tab === 'semestres' && (
        semestres.length === 0
          ? <div className="empty-state"><div className="es-ico">📅</div><h3>Aucun semestre configuré</h3><p>Créez votre premier semestre ou configurez-les depuis Programmes & UE</p></div>
          : (
            <div className="table-wrap">
              <ResponsiveTable<SemestreAvecSessions>
                columns={semestreColumns}
                data={semestres}
                keyExtractor={s => s.id}
                actions={s => (
                  <>
                    <button className="btn-ghost btn-sm" onClick={() => setModalSem({ open: true, item: s })}>✏</button>
                    <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDeleteSem(s)}>🗑</button>
                  </>
                )}
              />
            </div>
          )
      )}
      {!loading && tab === 'annees' && (
        annees.length === 0
          ? <div className="empty-state"><div className="es-ico">📆</div><h3>Aucune année académique</h3><p>Créez votre première année académique</p></div>
          : (
            <div className="table-wrap">
              <ResponsiveTable<AnneeEtendue>
                columns={anneeColumns}
                data={annees}
                keyExtractor={a => a.id}
                actions={a => (
                  <>
                    {!a.est_courante && <button className="btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => handleDefinirCourante(a.id)}>✓ Définir courante</button>}
                    <button className="btn-ghost btn-sm" onClick={() => setModalAnnee({ open: true, item: a })}>✏</button>
                    <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDeleteAnnee(a)}>🗑</button>
                  </>
                )}
              />
            </div>
          )
      )}
      {modalSem.open && <ModalSemestre ecoleId={ecoleId} semestre={modalSem.item} programmes={programmes} annees={annees as AnneeAcademique[]} anneeActiveId={anneeActive?.id} onClose={() => setModalSem({ open: false, item: null })} onSaved={loadAll} />}
      {modalAnnee.open && <ModalAnnee ecoleId={ecoleId} annee={modalAnnee.item} onClose={() => setModalAnnee({ open: false, item: null })} onSaved={loadAll} />}
    </div>
  );
}
