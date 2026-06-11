// src/modules/presences/index.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type { StatutPresence, TypeSeance, Seance, EtudiantPresence, AbsenceUE } from '../../services/presences.service';
import {
  fetchMatieresSemestre, fetchSeances, creerSeance, supprimerSeance,
  fetchPresences, marquerPresence, toutMarquerPresent,
  fetchEtudiantsInscrits, fetchAbsences, fetchAbsencesRisque,
  fetchExclusions, exclureEtudiant, leverExclusion, appliquerExclusionsAuto,
  fetchSeuilAbsence,
} from '../../services/presences.service';
import ModalSaisiePresence from './components/ModalSaisiePresence';

interface SemestreOption { id: string; libelle: string; niveau: string }
interface EcoleOption    { id: string; nom: string }

type Tab = 'seances' | 'absences' | 'exclusions';

const TYPE_SEANCE_LABEL: Record<TypeSeance, string> = {
  CM: 'Cours Magistral', TD: 'TD', TP: 'TP', examen: 'Examen', autre: 'Autre',
};

const TYPE_SEANCE_COLOR: Record<TypeSeance, string> = {
  CM: '#1e3a5f', TD: '#0891b2', TP: '#7c3aed', examen: '#dc2626', autre: '#6b7280',
};

export default function PresencesPage() {
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

  // ── Sélecteurs ──────────────────────────────────────────────────────────────
  const [semestres, setSemestres] = useState<SemestreOption[]>([]);
  const [semId, setSemId]         = useState('');
  const [tab, setTab]             = useState<Tab>('seances');

  // ── Données séances ──────────────────────────────────────────────────────────
  const [seances, setSeances]     = useState<Seance[]>([]);
  const [matieres, setMatieres]   = useState<{ id: string; code: string; nom: string; ue_id: string; unites_enseignement?: { code: string; intitule: string } }[]>([]);
  const [etudiants, setEtudiants] = useState<EtudiantPresence[]>([]);
  const [loadingSeances, setLoadingSeances] = useState(false);

  // ── Données absences ─────────────────────────────────────────────────────────
  const [absences, setAbsences]   = useState<AbsenceUE[]>([]);
  const [seuil, setSeuil]         = useState(30);
  const [loadingAbs, setLoadingAbs] = useState(false);

  // ── Données exclusions ───────────────────────────────────────────────────────
  const [exclusions, setExclusions] = useState<any[]>([]);
  const [loadingExcl, setLoadingExcl] = useState(false);

  // ── Modal saisie ─────────────────────────────────────────────────────────────
  const [modalSeance, setModalSeance] = useState<Seance | null>(null);

  // ── Modal nouvelle séance ────────────────────────────────────────────────────
  const [showNouvelleSeance, setShowNouvelleSeance] = useState(false);
  const [formSeance, setFormSeance] = useState({
    matiere_id: '', type_seance: 'CM' as TypeSeance,
    date_seance: new Date().toISOString().slice(0, 10),
    heure_debut: '', heure_fin: '', observations: '',
  });
  const [savingSeance, setSavingSeance] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Chargement semestres ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!ecoleId) return;
    setSemestres([]); setSemId('');
    supabase.from('semestres')
      .select('id,libelle,niveau')
      .eq('ecole_id', ecoleId)
      .in('statut', ['en_cours', 'planifie'])
      .order('numero')
      .then(({ data }) => setSemestres((data ?? []) as SemestreOption[]));
  }, [ecoleId]);

  // ── Chargement données par tab ────────────────────────────────────────────────
  const loadSeances = useCallback(async () => {
    if (!semId) return;
    setLoadingSeances(true);
    try {
      const [s, m, e] = await Promise.all([
        fetchSeances(semId),
        fetchMatieresSemestre(semId),
        fetchEtudiantsInscrits(semId),
      ]);
      setSeances(s); setMatieres(m); setEtudiants(e);
      if (m.length && !formSeance.matiere_id) setFormSeance(f => ({ ...f, matiere_id: m[0].id }));
    } finally { setLoadingSeances(false); }
  }, [semId]); // eslint-disable-line

  const loadAbsences = useCallback(async () => {
    if (!semId || !ecoleId) return;
    setLoadingAbs(true);
    try {
      const [s, abs] = await Promise.all([
        fetchSeuilAbsence(ecoleId),
        fetchAbsences(semId),
      ]);
      setSeuil(s); setAbsences(abs);
    } finally { setLoadingAbs(false); }
  }, [semId, ecoleId]);

  const loadExclusions = useCallback(async () => {
    if (!semId) return;
    setLoadingExcl(true);
    try { setExclusions(await fetchExclusions(semId)); }
    finally { setLoadingExcl(false); }
  }, [semId]);

  useEffect(() => {
    if (!semId) return;
    if (tab === 'seances')    loadSeances();
    if (tab === 'absences')   loadAbsences();
    if (tab === 'exclusions') loadExclusions();
  }, [semId, tab, loadSeances, loadAbsences, loadExclusions]);

  // ── Créer séance ──────────────────────────────────────────────────────────────
  async function handleCreerSeance() {
    if (!formSeance.matiere_id || !semId) return;
    setSavingSeance(true);
    try {
      await creerSeance({
        ecole_id: ecoleId,
        semestre_id: semId,
        matiere_id: formSeance.matiere_id,
        type_seance: formSeance.type_seance,
        date_seance: formSeance.date_seance,
        heure_debut: formSeance.heure_debut || null,
        heure_fin:   formSeance.heure_fin   || null,
        observations: formSeance.observations || null,
      });
      showToast('Séance créée ✓');
      setShowNouvelleSeance(false);
      await loadSeances();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally { setSavingSeance(false); }
  }

  // ── Supprimer séance ──────────────────────────────────────────────────────────
  async function handleSupprimerSeance(seance: Seance) {
    if (!confirm(`Supprimer la séance du ${new Date(seance.date_seance).toLocaleDateString('fr-FR')} (${seance.matieres_lmd?.nom ?? ''}) ?\nToutes les présences associées seront supprimées.`)) return;
    try {
      await supprimerSeance(seance.id);
      showToast('Séance supprimée');
      await loadSeances();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  // ── Exclusions auto ───────────────────────────────────────────────────────────
  async function handleExclusionsAuto() {
    if (!confirm(`Appliquer les exclusions automatiques pour les étudiants dépassant ${seuil}% d'absences ?`)) return;
    try {
      const n = await appliquerExclusionsAuto(semId);
      showToast(`${n} exclusion(s) appliquée(s) ✓`);
      await loadExclusions();
      await loadAbsences();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  // ── Lever exclusion ───────────────────────────────────────────────────────────
  async function handleLeverExclusion(id: string, nom: string) {
    if (!confirm(`Lever l'exclusion de ${nom} ?`)) return;
    try {
      await leverExclusion(id);
      showToast('Exclusion levée ✓');
      await loadExclusions();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  // ── Stats absences ────────────────────────────────────────────────────────────
  const absARisque = useMemo(() => absences.filter(a => a.taux_absence_pct >= seuil), [absences, seuil]);

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
          <h2>Présences</h2>
          <div className="page-subtitle">Gestion des séances · suivi des absences · exclusions</div>
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
          {tab === 'seances' && semId && (
            <button className="btn-blue" onClick={() => setShowNouvelleSeance(true)}>+ Nouvelle séance</button>
          )}
          {tab === 'exclusions' && semId && (
            <button className="btn-blue" onClick={handleExclusionsAuto}>⚡ Exclusions auto</button>
          )}
        </div>
      </div>

      {!semId && (
        <div className="empty-state">
          <div className="es-ico">📋</div>
          <h3>Sélectionnez un semestre</h3>
          <p>Gérez les présences aux séances et le suivi des absences LMD-CAMES</p>
        </div>
      )}

      {semId && (
        <>
          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: '1.25rem' }}>
            {([
              ['seances',    `Séances (${seances.length})`],
              ['absences',   `Suivi absences${absARisque.length > 0 ? ` ⚠️ ${absARisque.length}` : ''}`],
              ['exclusions', `Exclusions (${exclusions.length})`],
            ] as [Tab, string][]).map(([t, label]) => (
              <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
            ))}
          </div>

          {/* ── TAB SÉANCES ── */}
          {tab === 'seances' && (
            <>
              {loadingSeances ? <div className="loading">Chargement…</div> : (
                seances.length === 0 ? (
                  <div className="empty-state">
                    <div className="es-ico">📅</div>
                    <h3>Aucune séance</h3>
                    <p>Créez une première séance pour commencer la saisie des présences</p>
                    <button style={{ marginTop: '.75rem' }} onClick={() => setShowNouvelleSeance(true)}>+ Créer une séance</button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Matière</th>
                          <th style={{ textAlign: 'center' }}>Type</th>
                          <th style={{ textAlign: 'center' }}>Horaire</th>
                          <th>Observations</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seances.map(s => (
                          <tr key={s.id}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                                {new Date(s.date_seance).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{s.matieres_lmd?.nom ?? '—'}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.matieres_lmd?.code ?? ''}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                                fontSize: 11, fontWeight: 600,
                                background: `${TYPE_SEANCE_COLOR[s.type_seance]}18`,
                                color: TYPE_SEANCE_COLOR[s.type_seance],
                              }}>
                                {TYPE_SEANCE_LABEL[s.type_seance]}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
                              {s.heure_debut ? `${s.heure_debut}${s.heure_fin ? ` – ${s.heure_fin}` : ''}` : '—'}
                            </td>
                            <td style={{ fontSize: 12, color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.observations ?? '—'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                <button
                                  className="btn-blue"
                                  style={{ fontSize: 11, padding: '4px 10px' }}
                                  onClick={() => setModalSeance(s)}
                                >
                                  ✏ Saisir présences
                                </button>
                                <button
                                  className="btn-ghost btn-sm"
                                  style={{ color: '#dc2626' }}
                                  onClick={() => handleSupprimerSeance(s)}
                                >🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </>
          )}

          {/* ── TAB ABSENCES ── */}
          {tab === 'absences' && (
            <>
              {loadingAbs ? <div className="loading">Chargement…</div> : (
                <>
                  {/* KPI */}
                  {absences.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: '1rem' }}>
                      <div className="card">
                        <div className="c-ico">👥</div>
                        <div className="c-val">{new Set(absences.map(a => a.etudiant_id)).size}</div>
                        <div className="c-lbl">Étudiants suivis</div>
                      </div>
                      <div className="card">
                        <div className="c-ico">⚠️</div>
                        <div className="c-val" style={{ color: '#dc2626' }}>{absARisque.length}</div>
                        <div className="c-lbl">UE à risque (&gt;{seuil}%)</div>
                      </div>
                      <div className="card">
                        <div className="c-ico">🚫</div>
                        <div className="c-val" style={{ color: '#b45309' }}>{absences.filter(a => a.est_exclu).length}</div>
                        <div className="c-lbl">Exclusions actives</div>
                      </div>
                    </div>
                  )}

                  {absences.length === 0 ? (
                    <div className="empty-state">
                      <div className="es-ico">✅</div>
                      <h3>Aucune donnée d'absence</h3>
                      <p>Les absences apparaîtront dès que des séances auront été saisies.</p>
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Étudiant</th>
                            <th>UE</th>
                            <th style={{ textAlign: 'center' }}>Séances</th>
                            <th style={{ textAlign: 'center' }}>Présents</th>
                            <th style={{ textAlign: 'center' }}>Absences</th>
                            <th style={{ textAlign: 'center' }}>Taux</th>
                            <th style={{ textAlign: 'center' }}>Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {absences.map((a, idx) => {
                            const isRisque = a.taux_absence_pct >= seuil;
                            const barColor = a.est_exclu ? '#dc2626' : isRisque ? '#f97316' : '#059669';
                            return (
                              <tr key={`${a.etudiant_id}-${a.ue_id}-${idx}`}>
                                <td>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.etudiant_nom} {a.etudiant_prenom}</div>
                                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{a.matricule}</div>
                                </td>
                                <td>
                                  <div style={{ fontSize: 12, fontWeight: 600 }}>{a.ue_code}</div>
                                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.ue_intitule}</div>
                                </td>
                                <td style={{ textAlign: 'center', fontSize: 13 }}>{a.nb_seances_total}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ color: '#059669', fontWeight: 600, fontSize: 13 }}>{a.nb_presents}</span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{ color: a.nb_absences > 0 ? '#dc2626' : '#9ca3af', fontWeight: 600, fontSize: 13 }}>
                                    {a.nb_absences}
                                    {a.nb_absences_justifiees > 0 && (
                                      <span style={{ fontSize: 10, color: '#7c3aed', marginLeft: 3 }}>({a.nb_absences_justifiees}J)</span>
                                    )}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center', minWidth: 100 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                    <div style={{ width: 50, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.min(a.taux_absence_pct, 100)}%`, background: barColor, borderRadius: 3 }} />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>
                                      {Math.round(a.taux_absence_pct)}%
                                    </span>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {a.est_exclu
                                    ? <span className="badge red">Exclu</span>
                                    : isRisque
                                      ? <span className="badge amber">⚠️ Risque</span>
                                      : <span className="badge green">OK</span>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── TAB EXCLUSIONS ── */}
          {tab === 'exclusions' && (
            <>
              {loadingExcl ? <div className="loading">Chargement…</div> : (
                exclusions.length === 0 ? (
                  <div className="empty-state">
                    <div className="es-ico">🚫</div>
                    <h3>Aucune exclusion</h3>
                    <p>Aucun étudiant n'est exclu pour ce semestre. Vous pouvez appliquer les exclusions automatiques.</p>
                    <button style={{ marginTop: '.75rem' }} onClick={handleExclusionsAuto}>⚡ Appliquer exclusions auto ({seuil}% seuil)</button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Étudiant</th>
                          <th>UE</th>
                          <th style={{ textAlign: 'center' }}>Source</th>
                          <th>Motif</th>
                          <th style={{ textAlign: 'center' }}>Date</th>
                          <th style={{ textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exclusions.map(ex => (
                          <tr key={ex.id}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{ex.etudiant_nom} {ex.etudiant_prenom}</div>
                              <div style={{ fontSize: 10, color: '#9ca3af' }}>{ex.matricule}</div>
                            </td>
                            <td>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{ex.ue_code}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{ex.ue_intitule}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${ex.source === 'auto' ? 'blue' : 'amber'}`}>
                                {ex.source === 'auto' ? '⚡ Auto' : '✍ Manuel'}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: '#6b7280' }}>{ex.motif ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
                              {new Date(ex.date_exclusion).toLocaleDateString('fr-FR')}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn-ghost btn-sm"
                                style={{ color: '#059669' }}
                                onClick={() => handleLeverExclusion(ex.id, `${ex.etudiant_nom} ${ex.etudiant_prenom}`)}
                              >
                                ↩ Lever
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </>
          )}
        </>
      )}

      {/* ── Modal nouvelle séance ── */}
      {showNouvelleSeance && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setShowNouvelleSeance(false)}>
          <div className="modal" style={{ width: 480, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Nouvelle séance</h3>
              <button className="btn-ghost btn-sm" onClick={() => setShowNouvelleSeance(false)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label>Matière *</label>
                <select value={formSeance.matiere_id} onChange={e => setFormSeance(f => ({ ...f, matiere_id: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} required>
                  <option value="">Sélectionner…</option>
                  {matieres.map(m => (
                    <option key={m.id} value={m.id}>{m.code} — {m.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Type *</label>
                <select value={formSeance.type_seance} onChange={e => setFormSeance(f => ({ ...f, type_seance: e.target.value as TypeSeance }))}
                  style={{ width: '100%', marginTop: 4 }}>
                  {Object.entries(TYPE_SEANCE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Date *</label>
                <input type="date" value={formSeance.date_seance}
                  onChange={e => setFormSeance(f => ({ ...f, date_seance: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} required />
              </div>
              <div>
                <label>Heure début</label>
                <input type="time" value={formSeance.heure_debut}
                  onChange={e => setFormSeance(f => ({ ...f, heure_debut: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label>Heure fin</label>
                <input type="time" value={formSeance.heure_fin}
                  onChange={e => setFormSeance(f => ({ ...f, heure_fin: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label>Observations</label>
                <input type="text" value={formSeance.observations}
                  onChange={e => setFormSeance(f => ({ ...f, observations: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} placeholder="Optionnel…" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
              <button className="btn-ghost" onClick={() => setShowNouvelleSeance(false)}>Annuler</button>
              <button className="btn-blue" onClick={handleCreerSeance}
                disabled={!formSeance.matiere_id || !formSeance.date_seance || savingSeance}>
                {savingSeance ? 'Création…' : 'Créer →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal saisie présences ── */}
      {modalSeance && (
        <ModalSaisiePresence
          seanceId={modalSeance.id}
          matiereNom={modalSeance.matieres_lmd?.nom ?? modalSeance.matiere_id}
          etudiants={etudiants}
          ecoleId={ecoleId}
          onClose={() => { setModalSeance(null); }}
        />
      )}
    </div>
  );
}

