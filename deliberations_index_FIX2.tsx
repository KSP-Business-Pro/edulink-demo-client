// src/modules/deliberations/index.tsx
// B4.2 — Délibérations avancées : stats, recalcul, PV jury, export Excel

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type { LigneDelib, DecisionJury, PVDelib, StatsDelib } from '../../types/deliberations.types';
import { DECISION_LABEL, DECISION_COLOR, MENTION_LABEL, MENTION_COLOR } from '../../types/deliberations.types';
import {
  fetchLignesDelib, ajusterDecisionJury, cloturerSemestre,
  publierReleve, publierTousReleves, basculerVerrouReleve,
  fetchSemestreStatut, fetchPV, fetchStatsDelib,
  recalculerResultats, exportPVExcel,
} from '../../services/deliberations.service';
import { ModalPV } from './components/ModalPV';
import ResponsiveTable, { type RTColumn } from '../../components/ResponsiveTable';

interface SemestreOption { id: string; libelle: string; niveau: string }
interface EcoleOption    { id: string; nom: string }

const DECISIONS: DecisionJury[] = ['admis', 'ajourné', 'redoublant', 'exclus', 'mention_speciale'];

export default function DeliberationsPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles,  setEcoles]  = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId((data[0] as EcoleOption).id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [semestres,    setSemestres]    = useState<SemestreOption[]>([]);
  const [semId,        setSemId]        = useState('');
  const [semStatut,    setSemStatut]    = useState('');
  const [semLibelle,   setSemLibelle]   = useState('');
  const [lignes,       setLignes]       = useState<LigneDelib[]>([]);
  const [stats,        setStats]        = useState<StatsDelib | null>(null);
  const [pv,           setPV]           = useState<PVDelib | null>(null);
  const [sendEmail,    setSendEmail]    = useState(true);
  const [loading,      setLoading]      = useState(false);
  const [recalcul,     setRecalcul]     = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [showPV,       setShowPV]       = useState(false);
  const [pubProgress,  setPubProgress]  = useState<{ done: number; total: number } | null>(null);
  const [noteJury,     setNoteJury]     = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Charger semestres
  useEffect(() => {
    if (!ecoleId) return;
    supabase.from('semestres').select('id,libelle,niveau').eq('ecole_id', ecoleId).order('numero')
      .then(({ data }) => setSemestres((data ?? []) as SemestreOption[]));
  }, [ecoleId]);

  const loadDelib = useCallback(async () => {
    if (!semId || !ecoleId) return;
    setLoading(true);
    try {
      const [lignesData, statut, statsData, pvData] = await Promise.all([
        fetchLignesDelib(semId, ecoleId),
        fetchSemestreStatut(semId),
        fetchStatsDelib(semId, ecoleId).catch(() => null),
        fetchPV(semId, ecoleId),
      ]);
      setLignes(lignesData);
      setSemStatut(statut);
      setStats(statsData);
      setPV(pvData);
    } finally { setLoading(false); }
  }, [semId, ecoleId]);

  useEffect(() => { loadDelib(); }, [loadDelib]);

  // ── Stats rapides ──────────────────────────────────────────────────────────
  const nbTotal    = lignes.length;
  const nbPublies  = lignes.filter(l => l.releve_publie).length;
  const isCloture  = semStatut === 'cloture' || semStatut === 'archive';

  // ── Recalcul ───────────────────────────────────────────────────────────────
  async function handleRecalcul() {
    if (!confirm(`Recalculer tous les résultats du semestre ?\nCela peut prendre quelques secondes.`)) return;
    setRecalcul(true);
    try {
      const r = await recalculerResultats(semId, ecoleId);
      showToast(`Recalcul terminé — ${r.ok} étudiant(s) traité(s)${r.erreurs ? `, ${r.erreurs} erreur(s)` : ''}`, r.erreurs ? 'info' : 'success');
      await loadDelib();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur recalcul', 'error');
    } finally { setRecalcul(false); }
  }

  // ── Override décision jury ─────────────────────────────────────────────────
  async function handleAjusterDecision(ligne: LigneDelib, decision: DecisionJury) {
    try {
      await ajusterDecisionJury(ligne.etudiant_id, semId, ecoleId, decision, noteJury[ligne.etudiant_id]);
      showToast(`Décision mise à jour : ${DECISION_LABEL[decision]}`);
      await loadDelib();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  // ── Clôture ────────────────────────────────────────────────────────────────
  async function handleCloturerSemestre() {
    if (!confirm('Clôturer ce semestre ?\n\n• Verrouille toutes les sessions de notes\n• Marque le semestre comme Clôturé\n\nLes relevés restent publiables.')) return;
    try {
      await cloturerSemestre(semId);
      showToast('Semestre clôturé 🔒');
      await loadDelib();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  // ── Publication ────────────────────────────────────────────────────────────
  async function handlePublierTous() {
    const restants = nbTotal - nbPublies;
    if (!confirm(`Publier les relevés de ${restants} étudiant(s) ?${sendEmail ? '\nUn email sera envoyé à chaque étudiant.' : ''}`)) return;
    setPubProgress({ done: 0, total: restants });
    try {
      const { ok, blocked, failed } = await publierTousReleves(semId, lignes, sendEmail, (done, total) => setPubProgress({ done, total }));
      showToast(
        `${ok} relevé(s) publié(s)${blocked ? ` · ${blocked} bloqué(s)` : ''}${failed ? ` · ${failed} erreur(s)` : ''}`,
        blocked || failed ? 'info' : 'success'
      );
      await loadDelib();
    } finally { setPubProgress(null); }
  }

  async function handlePublierUn(ligne: LigneDelib) {
    try {
      const r = await publierReleve(ligne.etudiant_id, semId, { sendEmail });
      if (r.success) { showToast('Relevé publié ✓'); await loadDelib(); }
      else showToast(r.blocked ? 'Bloqué — impayé en cours' : `Erreur : ${r.error}`, 'error');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  async function handleVerrou(ligne: LigneDelib) {
    const mode = ligne.releve_verrouille ? 'unlock' : 'lock';
    if (!confirm(mode === 'lock' ? 'Verrouiller ce relevé ? Il deviendra définitif.' : 'Déverrouiller ce relevé ?')) return;
    try {
      await basculerVerrouReleve(ligne.etudiant_id, semId, mode);
      showToast(mode === 'lock' ? 'Relevé verrouillé 🔒' : 'Relevé déverrouillé 🔓');
      await loadDelib();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  // ── Export Excel ───────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      await exportPVExcel(lignes, semLibelle, pv);
    } catch (err) {
      showToast('Erreur export Excel', 'error');
    } finally {
      setExporting(false);
    }
  }

  const toastBg = { success: '#059669', error: '#dc2626', info: '#1e3a5f' };

  // ── Colonnes du tableau jury (dépend de handlers/state du composant) ────────
  const deliberationColumns: RTColumn<LigneDelib>[] = [
    {
      key: 'matricule',
      label: 'Matricule',
      mono: true,
      render: l => (
        <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
          {l.matricule}
        </code>
      ),
    },
    {
      key: 'etudiant',
      label: 'Étudiant',
      primary: true,
      render: l => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{l.nom} {l.prenom}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{l.filiere}</div>
        </div>
      ),
    },
    {
      key: 'moyenne',
      label: 'Moyenne',
      render: l => l.moyenne_semestre != null
        ? <span className="badge teal">{Number(l.moyenne_semestre).toFixed(2)}</span>
        : <span className="badge gray">—</span>,
    },
    {
      key: 'credits',
      label: 'Crédits',
      render: l => <span className={`badge ${l.credits_valides > 0 ? 'teal' : 'gray'}`}>{l.credits_valides} CECT</span>,
    },
    {
      key: 'mention',
      label: 'Mention',
      render: l => l.mention
        ? <span className={`badge ${MENTION_COLOR[l.mention] ?? 'gray'}`}>{MENTION_LABEL[l.mention] ?? l.mention}</span>
        : <span className="badge gray">—</span>,
    },
    {
      key: 'decision_auto',
      label: 'Décision auto',
      render: l => l.decision
        ? <span className={`badge ${DECISION_COLOR[l.decision] ?? 'gray'}`}>{DECISION_LABEL[l.decision] ?? l.decision}</span>
        : <span className="badge gray">Non calculé</span>,
    },
    {
      key: 'decision_jury',
      label: 'Décision jury',
      render: (l, view) => (
        <div>
          <select
            id={`decision-jury-${l.etudiant_id}-${view}`}
            name={`decision-jury-${l.etudiant_id}-${view}`}
            value={l.decision_jury ?? l.decision ?? ''}
            onChange={e => handleAjusterDecision(l, e.target.value as DecisionJury)}
            style={{
              padding: '4px 8px', border: `1px solid ${l.decision_jury && l.decision_jury !== l.decision ? '#d97706' : '#e5e7eb'}`,
              borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
              background: l.decision_jury && l.decision_jury !== l.decision ? '#fffbeb' : '#fff',
              cursor: 'pointer',
            }}
            title={l.decision_jury && l.decision_jury !== l.decision ? 'Override jury actif' : 'Décision du jury'}
          >
            <option value="">— Choisir —</option>
            {DECISIONS.map(d => (
              <option key={d} value={d}>{DECISION_LABEL[d]}</option>
            ))}
          </select>
          {l.decision_jury && l.decision_jury !== l.decision && (
            <div style={{ fontSize: 9, color: '#d97706', marginTop: 2 }}>⚠ Override jury</div>
          )}
        </div>
      ),
    },
    {
      key: 'note_jury',
      label: 'Note jury',
      render: (l, view) => (
        <input
          type="text"
          id={`note-jury-${l.etudiant_id}-${view}`}
          name={`note-jury-${l.etudiant_id}-${view}`}
          autoComplete="off"
          value={noteJury[l.etudiant_id] ?? l.note_jury ?? ''}
          onChange={e => setNoteJury(prev => ({ ...prev, [l.etudiant_id]: e.target.value }))}
          onBlur={async e => {
            const val = e.target.value.trim();
            if (val !== (l.note_jury ?? '')) {
              await ajusterDecisionJury(l.etudiant_id, semId, ecoleId, (l.decision_jury ?? l.decision)!, val);
            }
          }}
          placeholder="Observation…"
          style={{ width: '100%', padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, fontFamily: 'inherit', outline: 'none' }}
        />
      ),
    },
    {
      key: 'releve',
      label: 'Relevé',
      render: l => (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {l.releve_publie ? (
            <>
              <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Publié</span>
              <button onClick={() => handleVerrou(l)}
                title={l.releve_verrouille ? 'Déverrouiller' : 'Verrouiller'}
                style={{ background: 'none', border: `1px solid ${l.releve_verrouille ? '#b45309' : '#d1d5db'}`, padding: '2px 6px', borderRadius: 5, fontSize: 12, cursor: 'pointer', color: l.releve_verrouille ? '#b45309' : '#9ca3af', fontFamily: 'inherit' }}>
                {l.releve_verrouille ? '🔒' : '🔓'}
              </button>
            </>
          ) : (
            <button onClick={() => handlePublierUn(l)}
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: 6, fontSize: 11, color: '#059669', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
              Publier
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* ── En-tête ── */}
      <div className="top">
        <div>
          <h2>Délibérations</h2>
          <div className="page-subtitle">Jury LMD-CAMES — validation officielle des résultats</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select id="delib-ecole" name="ecole" value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          <select id="delib-semestre" name="semestre" value={semId}
            onChange={e => {
              setSemId(e.target.value);
              const s = semestres.find(x => x.id === e.target.value);
              setSemLibelle(s?.libelle ?? '');
            }}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 220 }}>
            <option value="">— Sélectionner un semestre —</option>
            {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </select>
          {semId && semStatut && (
            <span className={`badge ${semStatut === 'en_cours' ? 'green' : semStatut === 'cloture' ? 'blue' : 'gray'}`} style={{ fontSize: 11 }}>
              {semStatut === 'en_cours' ? '🔓 En cours' : semStatut === 'cloture' ? '🔒 Clôturé' : semStatut}
            </span>
          )}
        </div>
      </div>

      {!semId && (
        <div className="empty-state">
          <div className="es-ico">⚖️</div>
          <h3>Sélectionnez un semestre</h3>
          <p>Calculez les résultats, ajustez les décisions du jury, puis validez la délibération officielle.</p>
        </div>
      )}

      {semId && !loading && lignes.length > 0 && (
        <>
          {/* ── KPIs ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: '1rem' }}>
            {[
              { ico: '👥', val: nbTotal,           lbl: 'Étudiants',  color: '#1e293b', bg: '#f8fafc' },
              { ico: '✅', val: stats?.admis ?? 0, lbl: 'Admis',      color: '#059669', bg: '#f0fdf4' },
              { ico: '⏳', val: stats?.ajournes ?? 0, lbl: 'Ajournés', color: '#d97706', bg: '#fffbeb' },
              { ico: '🔁', val: stats?.redoublants ?? 0, lbl: 'Redoublants', color: '#dc2626', bg: '#fef2f2' },
              { ico: '📄', val: nbPublies,          lbl: 'Relevés',   color: '#7e22ce', bg: '#f5f3ff' },
              { ico: '📋', val: pv ? (pv.statut === 'valide' ? '✅' : '📝') : '—', lbl: 'PV Jury', color: pv?.statut === 'valide' ? '#059669' : '#d97706', bg: pv?.statut === 'valide' ? '#f0fdf4' : '#fffbeb' },
            ].map(({ ico, val, lbl, color, bg }) => (
              <div key={lbl} style={{ background: bg, borderRadius: 12, padding: '.85rem', border: '1px solid #f1f5f9', textAlign: 'center' as const }}>
                <div style={{ fontSize: 20 }}>{ico}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* ── Stats mentions ── */}
          {stats && (
            <div style={{ background: '#fff', borderRadius: 12, padding: '1rem', border: '1px solid #f1f5f9', marginBottom: '1rem', display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginRight: 4 }}>Distribution mentions :</div>
              {[
                { label: 'Très bien', val: stats.mentions.tres_bien,   color: '#7e22ce', bg: '#f5f3ff' },
                { label: 'Bien',      val: stats.mentions.bien,        color: '#059669', bg: '#f0fdf4' },
                { label: 'Assez bien',val: stats.mentions.assez_bien,  color: '#1d4ed8', bg: '#dbeafe' },
                { label: 'Passable',  val: stats.mentions.passable,    color: '#374151', bg: '#f3f4f6' },
                { label: 'Insuff.',   val: stats.mentions.insuffisant, color: '#dc2626', bg: '#fee2e2' },
              ].map(({ label, val, color, bg }) => val > 0 && (
                <div key={label} style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999 }}>
                  {label} : {val}
                </div>
              ))}
              {stats.moyenne_promo !== null && (
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                  Moy. promo : <strong style={{ color: '#1e293b' }}>{Number(stats.moyenne_promo).toFixed(2)}</strong>
                  {' '}· Min : <strong>{stats.min_moyenne}</strong>
                  {' '}· Max : <strong>{stats.max_moyenne}</strong>
                </div>
              )}
            </div>
          )}

          {/* ── Barre d'actions ── */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, padding: '.85rem 1rem', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
            <label htmlFor="delib-send-email" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" id="delib-send-email" name="send-email" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} style={{ width: 14, height: 14 }} />
              📧 Email à la publication
            </label>
            <div style={{ flex: 1 }} />

            <button onClick={handleRecalcul} disabled={recalcul}
              style={{ background: '#fff', color: '#1e3a5f', border: '1px solid #1e3a5f', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: recalcul ? 0.6 : 1 }}>
              {recalcul ? '⏳ Calcul…' : '🔄 Recalculer résultats'}
            </button>

            <button onClick={() => setShowPV(true)}
              style={{ background: '#fff', color: '#374151', border: '1px solid #e2e8f0', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              📋 {pv ? 'Voir PV jury' : 'Créer PV jury'}
            </button>

            <button onClick={handleExport} disabled={exporting}
              style={{ background: '#fff', color: '#374151', border: '1px solid #e2e8f0', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1 }}>
              {exporting ? '⏳' : '⬇ Export Excel'}
            </button>

            {!isCloture && (
              <button onClick={handleCloturerSemestre}
                style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🔒 Clôturer le semestre
              </button>
            )}

            <button onClick={handlePublierTous} disabled={!!pubProgress || nbPublies === nbTotal}
              style={{ background: '#059669', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: nbPublies === nbTotal ? .5 : 1 }}>
              {pubProgress ? `Publication… ${pubProgress.done}/${pubProgress.total}` : `📄 Publier tous (${nbTotal - nbPublies})`}
            </button>
          </div>

          {/* ── Tableau jury ── */}
          <div className="table-wrap">
            <ResponsiveTable<LigneDelib>
              columns={deliberationColumns}
              data={lignes}
              keyExtractor={l => l.etudiant_id}
            />
          </div>
        </>
      )}

      {semId && !loading && lignes.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">📋</div>
          <h3>Aucun étudiant inscrit</h3>
          <p>Aucune inscription active pour ce semestre.</p>
        </div>
      )}

      {semId && loading && <div className="loading">Chargement…</div>}

      {/* ── Modal PV ── */}
      {showPV && (
        <ModalPV
          ecoleId={ecoleId}
          semestreId={semId}
          semLibelle={semLibelle}
          pv={pv}
          onClose={() => setShowPV(false)}
          onSaved={loadDelib}
        />
      )}
    </div>
  );
}
