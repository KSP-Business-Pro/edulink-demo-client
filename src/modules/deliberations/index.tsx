// src/modules/deliberations/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type { LigneDelib, DecisionJury } from '../../types/deliberations.types';
import { DECISION_LABEL, DECISION_COLOR, MENTION_LABEL, MENTION_COLOR } from '../../types/deliberations.types';
import {
  fetchLignesDelib, ajusterDecisionJury, cloturerSemestre,
  publierReleve, publierTousReleves, basculerVerrouReleve,
  fetchSemestreStatut,
} from '../../services/deliberations.service';

interface SemestreOption { id: string; libelle: string; niveau: string }
interface EcoleOption    { id: string; nom: string }

const DECISIONS: DecisionJury[] = ['admis', 'ajourné', 'redoublant', 'exclus', 'mention_speciale'];

export default function DeliberationsPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [semestres, setSemestres]   = useState<SemestreOption[]>([]);
  const [semId, setSemId]           = useState('');
  const [semStatut, setSemStatut]   = useState('');
  const [lignes, setLignes]         = useState<LigneDelib[]>([]);
  const [sendEmail, setSendEmail]   = useState(true);
  const [loading, setLoading]       = useState(false);
  const [pubProgress, setPubProgress] = useState<{ done: number; total: number } | null>(null);
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
      const [lignesData, statut] = await Promise.all([
        fetchLignesDelib(semId, ecoleId),
        fetchSemestreStatut(semId),
      ]);
      setLignes(lignesData);
      setSemStatut(statut);
    } finally { setLoading(false); }
  }, [semId, ecoleId]);

  useEffect(() => { loadDelib(); }, [loadDelib]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const nbTotal    = lignes.length;
  const nbCalc     = lignes.filter(l => l.decision !== null).length;
  const nbValides  = lignes.filter(l => l.semestre_valide).length;
  const nbAjournes = lignes.filter(l => !l.semestre_valide && l.decision !== null).length;
  const nbPublies  = lignes.filter(l => l.releve_publie).length;
  const isCloture  = semStatut === 'cloture' || semStatut === 'archive';

  // ── Handlers ──────────────────────────────────────────────────────────────────
  async function handleAjusterDecision(ligne: LigneDelib, decision: DecisionJury) {
    try {
      await ajusterDecisionJury(ligne.etudiant_id, semId, ecoleId, decision);
      showToast(`Décision mise à jour : ${DECISION_LABEL[decision]}`);
      await loadDelib();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleCloturerSemestre() {
    if (!confirm('Clôturer ce semestre ?\n\nCette action :\n• Verrouille toutes les sessions de notes\n• Marque le semestre comme "Clôturé"\n\nLes relevés restent publiables.')) return;
    try {
      await cloturerSemestre(semId);
      showToast('Semestre clôturé 🔒');
      await loadDelib();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handlePublierTous() {
    if (!confirm(`Publier les relevés de ${nbTotal - nbPublies} étudiant(s) non encore publiés ?${sendEmail ? '\nUn email sera envoyé à chaque étudiant.' : ''}`)) return;
    setPubProgress({ done: 0, total: nbTotal - nbPublies });
    try {
      const { ok, blocked, failed } = await publierTousReleves(semId, lignes, sendEmail, (done, total) => setPubProgress({ done, total }));
      showToast(`${ok} relevé(s) publié(s)${blocked ? ` · ${blocked} bloqué(s) (impayés)` : ''}${failed ? ` · ${failed} erreur(s)` : ''}`, blocked || failed ? 'info' : 'success');
      await loadDelib();
    } finally { setPubProgress(null); }
  }

  async function handlePublierUn(ligne: LigneDelib) {
    try {
      const r = await publierReleve(ligne.etudiant_id, semId, { sendEmail });
      if (r.success) { showToast('Relevé publié ✓'); await loadDelib(); }
      else showToast(r.blocked ? 'Bloqué — impayé en cours' : `Erreur : ${r.error}`, 'error');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleVerrou(ligne: LigneDelib) {
    const mode = ligne.releve_verrouille ? 'unlock' : 'lock';
    const msg  = mode === 'lock'
      ? 'Verrouiller ce relevé ? Il deviendra définitif.'
      : 'Déverrouiller ce relevé ? Il redeviendra modifiable.';
    if (!confirm(msg)) return;
    try {
      await basculerVerrouReleve(ligne.etudiant_id, semId, mode);
      showToast(mode === 'lock' ? 'Relevé verrouillé 🔒' : 'Relevé déverrouillé 🔓');
      await loadDelib();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

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
          <h2>Délibérations</h2>
          <div className="page-subtitle">Jury LMD-CAMES — validation officielle des résultats</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          <select value={semId} onChange={e => setSemId(e.target.value)}
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
          {/* KPI + actions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: '1rem' }}>
            {[
              { ico: '👥', val: nbTotal,    lbl: 'Étudiants' },
              { ico: '⚙️',  val: nbCalc,     lbl: 'Calculés' },
              { ico: '✅',  val: nbValides,  lbl: 'Admis' },
              { ico: '⏳',  val: nbAjournes, lbl: 'Ajournés' },
              { ico: '📄',  val: nbPublies,  lbl: 'Relevés publiés' },
            ].map(({ ico, val, lbl }) => (
              <div key={lbl} className="card" style={{ padding: '.85rem' }}>
                <div className="c-ico">{ico}</div>
                <div className="c-val" style={{ fontSize: 22 }}>{val}</div>
                <div className="c-lbl">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Barre d'actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '.85rem 1rem', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
              <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)}
                style={{ width: 14, height: 14, margin: 0 }} />
              📧 Email à la publication
            </label>
            <div style={{ flex: 1 }} />
            {!isCloture && (
              <button onClick={handleCloturerSemestre}
                style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🔒 Clôturer le semestre
              </button>
            )}
            <button onClick={handlePublierTous} disabled={!!pubProgress || nbPublies === nbTotal}
              style={{ background: '#059669', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: nbPublies === nbTotal ? .5 : 1 }}>
              {pubProgress ? `Publication… ${pubProgress.done}/${pubProgress.total}` : `📄 Publier tous les relevés (${nbTotal - nbPublies})`}
            </button>
          </div>

          {/* Tableau jury */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Étudiant</th>
                  <th style={{ textAlign: 'center' }}>Moyenne</th>
                  <th style={{ textAlign: 'center' }}>Crédits</th>
                  <th style={{ textAlign: 'center' }}>Mention</th>
                  <th style={{ textAlign: 'center' }}>Décision calculée</th>
                  <th style={{ textAlign: 'center' }}>Décision jury</th>
                  <th style={{ textAlign: 'center' }}>Relevé</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => (
                  <tr key={l.etudiant_id}>
                    <td>
                      <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                        {l.matricule}
                      </code>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.nom} {l.prenom}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{l.filiere}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {l.moyenne_semestre != null
                        ? <span className="badge teal">{Number(l.moyenne_semestre).toFixed(2)}</span>
                        : <span className="badge gray">—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${l.credits_valides > 0 ? 'teal' : 'gray'}`}>
                        {l.credits_valides} CECT
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {l.mention
                        ? <span className={`badge ${MENTION_COLOR[l.mention] ?? 'gray'}`}>{MENTION_LABEL[l.mention] ?? l.mention}</span>
                        : <span className="badge gray">—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {l.decision
                        ? <span className={`badge ${DECISION_COLOR[l.decision] ?? 'gray'}`}>{DECISION_LABEL[l.decision] ?? l.decision}</span>
                        : <span className="badge gray">Non calculé</span>
                      }
                    </td>
                    {/* Sélecteur décision jury */}
                    <td style={{ textAlign: 'center' }}>
                      <select
                        value={l.decision ?? ''}
                        onChange={e => handleAjusterDecision(l, e.target.value as DecisionJury)}
                        style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
                        title="Décision du jury (override)"
                      >
                        <option value="">— Choisir —</option>
                        {DECISIONS.map(d => (
                          <option key={d} value={d}>{DECISION_LABEL[d]}</option>
                        ))}
                      </select>
                    </td>
                    {/* Relevé */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </div>
  );
}
