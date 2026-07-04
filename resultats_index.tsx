// src/modules/resultats/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type {
  ResultatCache, EtudiantResultat, LigneResultat,
  TabResultat, ReglesEcole,
} from '../../types/resultats.types';
import { MENTION_LABEL, MENTION_COLOR } from '../../types/resultats.types';
import {
  fetchInscrits, fetchCache, calculerBatch, calculerUnEtudiant,
  fetchRattNotes, calculerRattrapageBatch, getRegles, clearReglesCache,
} from '../../services/resultats.service';
import ModalDetailUE from './components/ModalDetailUE';
import ResponsiveTable, { type RTColumn } from '../../components/ResponsiveTable';

interface SemestreOption { id: string; libelle: string; niveau: string }
interface EcoleOption    { id: string; nom: string }

// ── Colonnes du tableau Résultats semestriels ──────────────────────────────
const resultatColumns: RTColumn<LigneResultat>[] = [
  {
    key: 'matricule',
    label: 'Matricule',
    mono: true,
    render: ({ etudiant: et }) => (
      <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
        {et.matricule ?? '—'}
      </code>
    ),
  },
  {
    key: 'etudiant',
    label: 'Étudiant',
    primary: true,
    render: ({ etudiant: et }) => <strong>{et.nom} {et.prenom}</strong>,
  },
  {
    key: 'filiere',
    label: 'Filière',
    render: ({ etudiant: et }) => <span style={{ fontSize: 12, color: '#6b7280' }}>{et.filiere ?? '—'}</span>,
  },
  {
    key: 'credits',
    label: 'Crédits validés',
    render: ({ cache: c }) => (
      <span className={`badge ${c && c.credits_valides > 0 ? 'teal' : 'gray'}`}>
        {c?.credits_valides ?? '—'} CECT
      </span>
    ),
  },
  {
    key: 'moyenne',
    label: 'Moyenne',
    render: ({ cache: c }) => c?.moyenne_semestre != null
      ? <span className="badge teal">{Number(c.moyenne_semestre).toFixed(2)}</span>
      : <span className="badge gray">—</span>,
  },
  {
    key: 'mention',
    label: 'Mention',
    render: ({ cache: c }) => c?.mention
      ? <span className={`badge ${MENTION_COLOR[c.mention] ?? 'gray'}`}>{MENTION_LABEL[c.mention] ?? c.mention}</span>
      : <span className="badge gray">—</span>,
  },
  {
    key: 'resultat',
    label: 'Résultat',
    render: ({ cache: c }) => c
      ? <span className={`badge ${c.semestre_valide ? 'green' : 'red'}`}>{c.semestre_valide ? 'Validé' : 'Non validé'}</span>
      : <span className="badge gray">Non calculé</span>,
  },
];

// ── Colonnes du tableau Rattrapage ─────────────────────────────────────────
interface RattRow { etudiant: EtudiantResultat; cache: ResultatCache | null; rattNbUE: number }
const rattColumns: RTColumn<RattRow>[] = [
  {
    key: 'matricule',
    label: 'Matricule',
    render: ({ etudiant: et }) => <span style={{ fontSize: 11, color: '#6b7280' }}>{et.matricule ?? '—'}</span>,
  },
  {
    key: 'etudiant',
    label: 'Étudiant',
    primary: true,
    render: ({ etudiant: et }) => <span style={{ fontWeight: 500 }}>{et.nom} {et.prenom}</span>,
  },
  {
    key: 'moyenne',
    label: 'Moy. normale',
    render: ({ cache: c }) => (
      <span style={{ color: '#dc2626', fontWeight: 600 }}>
        {c?.moyenne_semestre != null ? `${Number(c.moyenne_semestre).toFixed(2)}/20` : '—'}
      </span>
    ),
  },
  {
    key: 'decision_normale',
    label: 'Décision normale',
    render: () => <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Ajourné</span>,
  },
  {
    key: 'notes_ratt',
    label: 'Notes ratt.',
    render: ({ rattNbUE }) => rattNbUE > 0
      ? <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 999, fontSize: 11 }}>{rattNbUE} UE saisie(s)</span>
      : <span style={{ color: '#9ca3af', fontSize: 12 }}>Pas de notes</span>,
  },
  {
    key: 'decision_finale',
    label: 'Décision finale',
    render: ({ cache: c }) => c?.decision === 'admis'
      ? <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Admis ✅</span>
      : c?.decision === 'redoublant'
        ? <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Redoublant</span>
        : <span style={{ color: '#9ca3af', fontSize: 12 }}>Non calculé</span>,
  },
];

export default function ResultatsPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  // Super-admin
  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [tab, setTab]           = useState<TabResultat>('semestre');
  const [semestres, setSemestres] = useState<SemestreOption[]>([]);
  const [semId, setSemId]       = useState('');
  const [lignes, setLignes]     = useState<LigneResultat[]>([]);
  const [regles, setRegles]     = useState<ReglesEcole | null>(null);

  // Rattrapage
  const [rattRows, setRattRows] = useState<{ etudiant: EtudiantResultat; cache: ResultatCache | null; rattNbUE: number }[]>([]);

  const [loading, setLoading]     = useState(false);
  const [calcProgress, setCalcProgress] = useState<{ done: number; total: number } | null>(null);
  const [modal, setModal]         = useState<{ etudiantId: string; nom: string } | null>(null);
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Charger semestres
  useEffect(() => {
    if (!ecoleId) return;
    setSemestres([]); setSemId('');
    supabase.from('semestres').select('id,libelle,niveau').eq('ecole_id', ecoleId).order('numero')
      .then(({ data }) => setSemestres((data ?? []) as SemestreOption[]));
  }, [ecoleId]);

  // Charger résultats semestre
  const loadSemestre = useCallback(async () => {
    if (!semId || !ecoleId) return;
    setLoading(true);
    try {
      const [inscrits, cache, r] = await Promise.all([
        fetchInscrits(semId, ecoleId),
        fetchCache(semId, ecoleId),
        getRegles(ecoleId),
      ]);
      setRegles(r);
      const cacheMap: Record<string, ResultatCache> = {};
      cache.forEach(c => { cacheMap[c.etudiant_id] = c; });
      setLignes(inscrits.map(et => ({ etudiant: et, cache: cacheMap[et.id] ?? null })));
    } finally { setLoading(false); }
  }, [semId, ecoleId]);

  useEffect(() => { if (tab === 'semestre') loadSemestre(); }, [tab, loadSemestre]);

  // Charger rattrapage
  const loadRattrapage = useCallback(async () => {
    if (!semId || !ecoleId) return;
    setLoading(true);
    try {
      const [inscrits, cache] = await Promise.all([
        fetchInscrits(semId, ecoleId),
        fetchCache(semId, ecoleId),
      ]);
      const cacheMap: Record<string, ResultatCache> = {};
      cache.forEach(c => { cacheMap[c.etudiant_id] = c; });
      const ajournes = inscrits.filter(et => {
        const d = cacheMap[et.id]?.decision;
        return d === 'ajourné' || d === 'redoublant';
      });
      // Check ratt notes pour chaque ajourné
      const rows = await Promise.all(ajournes.map(async et => {
        const notes = await fetchRattNotes(et.id, semId);
        return { etudiant: et, cache: cacheMap[et.id] ?? null, rattNbUE: notes.length };
      }));
      setRattRows(rows);
    } finally { setLoading(false); }
  }, [semId, ecoleId]);

  useEffect(() => { if (tab === 'rattrapage') loadRattrapage(); }, [tab, loadRattrapage]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleCalculerBatch() {
    if (!semId) return;
    clearReglesCache();
    setCalcProgress({ done: 0, total: 0 });
    try {
      const { ok, ko } = await calculerBatch(semId, ecoleId, (done, total) => setCalcProgress({ done, total }));
      showToast(`${ok} résultat${ok > 1 ? 's' : ''} calculé${ok > 1 ? 's' : ''}${ko ? ` · ${ko} erreur${ko > 1 ? 's' : ''}` : ''} ✓`, ko ? 'error' : 'success');
      await loadSemestre();
    } finally { setCalcProgress(null); }
  }

  async function handleRecalculerUn(etudiantId: string) {
    clearReglesCache();
    await calculerUnEtudiant(etudiantId, semId, ecoleId);
    await loadSemestre();
    showToast('Résultat recalculé ✓');
  }

  async function handleRattBatch() {
    if (!semId) return;
    clearReglesCache();
    setCalcProgress({ done: 0, total: 0 });
    try {
      const { nbAmeliorations } = await calculerRattrapageBatch(
        semId, ecoleId, (done, total) => setCalcProgress({ done, total })
      );
      showToast(`Rattrapage calculé — ${nbAmeliorations} étudiant${nbAmeliorations > 1 ? 's' : ''} admis après rattrapage ✓`);
      await loadRattrapage();
    } finally { setCalcProgress(null); }
  }

  // ── Statistiques ──────────────────────────────────────────────────────────────
  const nbTotal   = lignes.length;
  const nbValides = lignes.filter(l => l.cache?.semestre_valide).length;
  const taux      = nbTotal > 0 ? Math.round(nbValides / nbTotal * 100) : 0;
  const tauxColor = taux >= 70 ? '#059669' : taux >= 50 ? '#d97706' : '#dc2626';

  const toastBg = { success: '#059669', error: '#dc2626', info: '#1e3a5f' };

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* En-tête */}
      <div className="top">
        <div>
          <h2>Résultats</h2>
          <div className="page-subtitle">Calcul LMD-CAMES · compensation · rattrapage</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <>
              <label htmlFor="resultats-ecole" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>École</label>
              <select id="resultats-ecole" name="ecole" value={ecoleId} onChange={e => setEcoleId(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </>
          )}
          <label htmlFor="resultats-semestre" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Semestre</label>
          <select id="resultats-semestre" name="semestre" value={semId} onChange={e => setSemId(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 220 }}>
            <option value="">Sélectionner un semestre…</option>
            {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </select>
          {tab === 'semestre' && semId && (
            <button className="btn-blue" onClick={handleCalculerBatch} disabled={!!calcProgress}>
              {calcProgress ? `Calcul… ${calcProgress.done}/${calcProgress.total}` : '⚙ Calculer résultats'}
            </button>
          )}
          {tab === 'rattrapage' && semId && (
            <button className="btn-blue" onClick={handleRattBatch} disabled={!!calcProgress}>
              {calcProgress ? `Calcul… ${calcProgress.done}/${calcProgress.total}` : '⚙ Calculer résultats rattrapage'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.25rem' }}>
        {([
          ['semestre',   'Résultats semestriels'],
          ['rattrapage', 'Rattrapage'],
        ] as [TabResultat, string][]).map(([t, label]) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {!semId && (
        <div className="empty-state">
          <div className="es-ico">📊</div>
          <h3>Sélectionnez un semestre</h3>
          <p>Choisissez un semestre pour afficher les résultats</p>
        </div>
      )}

      {/* ── TAB SEMESTRE ── */}
      {tab === 'semestre' && semId && (
        <>
          {/* Infos règles */}
          {regles && (
            <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span className={`badge ${regles.compensation_active ? 'green' : 'gray'}`}>
                Compensation {regles.compensation_active ? 'activée' : 'désactivée'}
              </span>
              <span className="badge blue">Seuil UE : {regles.seuil_validation_ue}/20</span>
              {regles.note_plancher_active && (
                <span className="badge amber">Plancher : {regles.seuil_note_plancher}/20</span>
              )}
            </div>
          )}

          {loading ? <div className="loading">Chargement…</div> : (
            <>
              {/* KPI cards */}
              {lignes.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: '1rem' }}>
                  <div className="card">
                    <div className="c-ico">👥</div>
                    <div className="c-val">{nbTotal}</div>
                    <div className="c-lbl">Étudiants inscrits</div>
                  </div>
                  <div className="card">
                    <div className="c-ico">✅</div>
                    <div className="c-val">{nbValides}</div>
                    <div className="c-lbl">Semestres validés</div>
                    <div className="c-sub">{nbTotal - nbValides} non validés</div>
                  </div>
                  <div className="card">
                    <div className="c-ico">📊</div>
                    <div className="c-val" style={{ color: tauxColor }}>{taux}%</div>
                    <div className="c-lbl">Taux de réussite</div>
                    <div style={{ marginTop: '.5rem', height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${taux}%`, background: tauxColor, borderRadius: 3, transition: 'width .5s' }} />
                    </div>
                  </div>
                </div>
              )}

              {lignes.length === 0
                ? <div className="empty-state"><div className="es-ico">📋</div><h3>Aucun étudiant inscrit</h3></div>
                : (
                  <div className="table-wrap">
                    <ResponsiveTable<LigneResultat>
                      columns={resultatColumns}
                      data={lignes}
                      keyExtractor={({ etudiant: et }) => et.id}
                      actions={({ etudiant: et }) => (
                        <>
                          <button className="btn-ghost btn-sm" onClick={() => setModal({ etudiantId: et.id, nom: `${et.nom} ${et.prenom}` })}>
                            Détail
                          </button>
                          <button className="btn-ghost btn-sm" title="Recalculer" onClick={() => handleRecalculerUn(et.id)}>🔄</button>
                        </>
                      )}
                    />
                  </div>
                )
              }
            </>
          )}
        </>
      )}

      {/* ── TAB RATTRAPAGE ── */}
      {tab === 'rattrapage' && semId && (
        <>
          {regles && (
            <div role="alert" style={{ padding: '.85rem 1rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, marginBottom: '1rem', fontSize: 13, color: '#92400e' }}>
              ⚖️ <strong>Règle appliquée :</strong> {regles.regle_rattrapage === 'ecrase' ? 'Note rattrapage remplace la normale' : 'Max(note normale, note rattrapage)'} par UE · Seuil validation : {regles.seuil_validation_ue}/20
            </div>
          )}

          {loading ? <div className="loading">Chargement…</div> : rattRows.length === 0
            ? (
              <div className="empty-state">
                <div className="es-ico">{semId ? '🎉' : '🔄'}</div>
                <h3>{semId ? 'Aucun étudiant ajourné' : 'Sélectionnez un semestre'}</h3>
                <p>{semId ? 'Tous les étudiants ont validé leur semestre.' : ''}</p>
              </div>
            )
            : (
              <div className="table-wrap">
                <ResponsiveTable<RattRow>
                  columns={rattColumns}
                  data={rattRows}
                  keyExtractor={({ etudiant: et }) => et.id}
                />
              </div>
            )
          }
        </>
      )}

      {/* Modal détail UE */}
      {modal && (
        <ModalDetailUE
          etudiantId={modal.etudiantId}
          semId={semId}
          nom={modal.nom}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
