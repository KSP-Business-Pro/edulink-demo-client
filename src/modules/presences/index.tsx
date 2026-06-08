// src/modules/presences/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type {
  Seance, MatiereSaisie, EtudiantPresence,
  AbsenceUE, Exclusion,
} from '../../services/presences.service';
import {
  fetchMatieresSemestre, fetchSeances, creerSeance, supprimerSeance,
  fetchEtudiantsInscrits, fetchAbsences, fetchAbsencesRisque,
  fetchExclusions, exclureEtudiant, leverExclusion,
  appliquerExclusionsAuto, fetchSeuilAbsence,
} from '../../services/presences.service';
import ModalSaisiePresence from './components/ModalSaisiePresence';

type Tab = 'saisie' | 'suivi' | 'exclusions';
type TypeSeance = 'CM' | 'TD' | 'TP' | 'examen' | 'autre';
interface SemestreOption { id: string; libelle: string }
interface EcoleOption    { id: string; nom: string }

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

  const [tab, setTab]           = useState<Tab>('saisie');
  const [semestres, setSemestres] = useState<SemestreOption[]>([]);
  const [semId, setSemId]       = useState('');

  // Saisie tab state
  const [matieres, setMatieres] = useState<MatiereSaisie[]>([]);
  const [seances, setSeances]   = useState<Seance[]>([]);
  const [etudiants, setEtudiants] = useState<EtudiantPresence[]>([]);
  const [formMatId, setFormMatId]   = useState('');
  const [formDate, setFormDate]     = useState(new Date().toISOString().split('T')[0]);
  const [formType, setFormType]     = useState<TypeSeance>('CM');
  const [formDebut, setFormDebut]   = useState('08:00');
  const [formFin, setFormFin]       = useState('10:00');
  const [formObs, setFormObs]       = useState('');
  const [creerLoading, setCreerLoading] = useState(false);

  // Suivi tab state
  const [absences, setAbsences] = useState<AbsenceUE[]>([]);
  const [seuil, setSeuil]       = useState(30);

  // Exclusions tab state
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [absRisque, setAbsRisque]   = useState<AbsenceUE[]>([]);

  // Modal
  const [modalSeance, setModalSeance] = useState<{ seanceId: string; nom: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Charger semestres
  useEffect(() => {
    if (!ecoleId) return;
    supabase.from('semestres').select('id,libelle').eq('ecole_id', ecoleId)
      .in('statut', ['en_cours', 'planifie']).order('numero')
      .then(({ data }) => setSemestres((data ?? []) as SemestreOption[]));
  }, [ecoleId]);

  // Charger données selon tab + semestre
  const loadSaisie = useCallback(async () => {
    if (!semId || !ecoleId) return;
    const [mats, seancesData, etus] = await Promise.all([
      fetchMatieresSemestre(semId),
      fetchSeances(semId),
      fetchEtudiantsInscrits(semId),
    ]);
    setMatieres(mats); setSeances(seancesData); setEtudiants(etus);
    if (mats.length && !formMatId) setFormMatId(mats[0].id);
  }, [semId, ecoleId]); // eslint-disable-line

  const loadSuivi = useCallback(async () => {
    if (!semId || !ecoleId) return;
    setLoading(true);
    try {
      const [abs, s] = await Promise.all([fetchAbsences(semId), fetchSeuilAbsence(ecoleId)]);
      setAbsences(abs); setSeuil(s);
    } finally { setLoading(false); }
  }, [semId, ecoleId]);

  const loadExclusions = useCallback(async () => {
    if (!semId || !ecoleId) return;
    setLoading(true);
    try {
      const [excl, absR, s] = await Promise.all([
        fetchExclusions(semId),
        fetchAbsencesRisque(semId, await fetchSeuilAbsence(ecoleId)),
        fetchSeuilAbsence(ecoleId),
      ]);
      setExclusions(excl); setAbsRisque(absR.filter(a => !a.est_exclu)); setSeuil(s);
    } finally { setLoading(false); }
  }, [semId, ecoleId]);

  useEffect(() => {
    if (!semId) return;
    if (tab === 'saisie')     loadSaisie();
    if (tab === 'suivi')      loadSuivi();
    if (tab === 'exclusions') loadExclusions();
  }, [tab, semId, loadSaisie, loadSuivi, loadExclusions]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleCreerSeance() {
    if (!formMatId || !formDate) { showToast('Matière et date obligatoires', 'error'); return; }
    setCreerLoading(true);
    try {
      const seance = await creerSeance({
        ecole_id: ecoleId, matiere_id: formMatId, semestre_id: semId,
        date_seance: formDate, type_seance: formType,
        heure_debut: formDebut || null, heure_fin: formFin || null,
        observations: formObs || null,
      });
      showToast('Séance créée ✓');
      await loadSaisie();
      setModalSeance({ seanceId: seance.id, nom: seance.matieres_lmd?.nom ?? 'Séance' });
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setCreerLoading(false); }
  }

  async function handleSupprimerSeance(seanceId: string) {
    if (!confirm('Supprimer cette séance ? Les présences associées seront perdues.')) return;
    try { await supprimerSeance(seanceId); await loadSaisie(); showToast('Séance supprimée'); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleExclure(a: AbsenceUE) {
    const motif = prompt(`Motif d'exclusion de ${a.etudiant_nom} ${a.etudiant_prenom} de l'UE "${a.ue_intitule}" :`, "Taux d'absence excessif");
    if (!motif) return;
    try {
      await exclureEtudiant(a.etudiant_id, a.ue_id, semId, ecoleId, motif, user?.id ?? '');
      showToast(`${a.etudiant_nom} exclu(e) de l'UE ${a.ue_intitule}`);
      await loadExclusions();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleLeverExclusion(id: string) {
    if (!confirm("Lever cette exclusion ? L'étudiant pourra à nouveau bénéficier de la compensation.")) return;
    try { await leverExclusion(id); await loadExclusions(); showToast('Exclusion levée ✓'); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleExclusionsAuto() {
    if (!confirm(`Exclure automatiquement tous les étudiants dont le taux d'absence dépasse ${seuil}% ?`)) return;
    try {
      const count = await appliquerExclusionsAuto(semId);
      showToast(count ? `${count} exclusion(s) automatique(s) appliquée(s) ✓` : 'Aucune nouvelle exclusion — tous les cas sont déjà traités', count ? 'success' : 'info');
      await loadExclusions();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  // ── Groupement absences par UE ────────────────────────────────────────────────
  const parUE: Record<string, { code: string; intitule: string; etudiants: AbsenceUE[] }> = {};
  absences.forEach(a => {
    if (!parUE[a.ue_id]) parUE[a.ue_id] = { code: a.ue_code, intitule: a.ue_intitule, etudiants: [] };
    parUE[a.ue_id].etudiants.push(a);
  });

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
          <div className="page-subtitle">Saisie des séances · suivi absences · exclusions</div>
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
            <option value="">Sélectionner un semestre…</option>
            {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </select>
        </div>
      </div>

      {!semId && (
        <div className="empty-state">
          <div className="es-ico">📋</div>
          <h3>Sélectionnez un semestre</h3>
          <p>Choisissez un semestre pour gérer les présences</p>
        </div>
      )}

      {semId && (
        <>
          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: '1.25rem' }}>
            <button className={`tab${tab === 'saisie' ? ' active' : ''}`} onClick={() => setTab('saisie')}>✏️ Saisie séance</button>
            <button className={`tab${tab === 'suivi' ? ' active' : ''}`} onClick={() => setTab('suivi')}>📊 Suivi absences</button>
            <button className={`tab${tab === 'exclusions' ? ' active' : ''}`} onClick={() => setTab('exclusions')}>⚠️ Exclusions</button>
          </div>

          {/* ── TAB SAISIE ── */}
          {tab === 'saisie' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {/* Formulaire nouvelle séance */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '1rem' }}>➕ Nouvelle séance</div>

                <div style={{ marginBottom: '.75rem' }}>
                  <label>Matière</label>
                  <select value={formMatId} onChange={e => setFormMatId(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                    <option value="">Sélectionner…</option>
                    {matieres.map(m => <option key={m.id} value={m.id}>[{m.unites_enseignement?.code ?? '?'}] {m.nom}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.75rem' }}>
                  <div>
                    <label>Date</label>
                    <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
                  </div>
                  <div>
                    <label>Type</label>
                    <select value={formType} onChange={e => setFormType(e.target.value as TypeSeance)} style={{ width: '100%', marginTop: 4 }}>
                      <option value="CM">Cours magistral (CM)</option>
                      <option value="TD">Travaux dirigés (TD)</option>
                      <option value="TP">Travaux pratiques (TP)</option>
                      <option value="examen">Examen</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.75rem' }}>
                  <div>
                    <label>Heure début</label>
                    <input type="time" value={formDebut} onChange={e => setFormDebut(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
                  </div>
                  <div>
                    <label>Heure fin</label>
                    <input type="time" value={formFin} onChange={e => setFormFin(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label>Observations</label>
                  <input type="text" value={formObs} onChange={e => setFormObs(e.target.value)} placeholder="Optionnel…" style={{ width: '100%', marginTop: 4 }} />
                </div>

                <button onClick={handleCreerSeance} disabled={creerLoading || !formMatId}
                  style={{ width: '100%', background: '#1e3a5f', color: '#fff', border: 'none', padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: creerLoading || !formMatId ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !formMatId ? .5 : 1 }}>
                  {creerLoading ? 'Création…' : 'Créer la séance et saisir les présences'}
                </button>
              </div>

              {/* Séances récentes */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '1rem' }}>
                  📅 Séances récentes ({seances.length})
                </div>
                {seances.length === 0
                  ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Aucune séance enregistrée</p>
                  : seances.slice(0, 10).map(s => (
                    <div key={s.id}
                      onClick={() => setModalSeance({ seanceId: s.id, nom: s.matieres_lmd?.nom ?? 'Séance' })}
                      style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem', background: '#f9fafb', borderRadius: 8, marginBottom: '.4rem', border: '1px solid #f3f4f6', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.matieres_lmd?.nom ?? '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                          {s.date_seance} · <span className="badge gray" style={{ fontSize: 9, padding: '1px 5px' }}>{s.type_seance}</span>
                        </div>
                      </div>
                      <button className="btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setModalSeance({ seanceId: s.id, nom: s.matieres_lmd?.nom ?? 'Séance' }); }}>Saisir</button>
                      <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={e => { e.stopPropagation(); handleSupprimerSeance(s.id); }}>🗑</button>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* ── TAB SUIVI ── */}
          {tab === 'suivi' && (
            loading ? <div className="loading">Chargement…</div> :
            Object.keys(parUE).length === 0
              ? <div className="empty-state"><div className="es-ico">📊</div><h3>Aucune donnée de présence</h3><p>Saisissez des séances pour voir le suivi</p></div>
              : Object.entries(parUE).map(([ueId, ue]) => (
                <div key={ueId} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem' }}>
                    <span className="badge blue">{ue.code}</span>
                    <strong style={{ fontSize: 13 }}>{ue.intitule}</strong>
                    <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Étudiant</th>
                          <th style={{ textAlign: 'center' }}>Séances</th>
                          <th style={{ textAlign: 'center' }}>Présents</th>
                          <th style={{ textAlign: 'center' }}>Absences</th>
                          <th style={{ textAlign: 'center' }}>Justifiées</th>
                          <th style={{ textAlign: 'center' }}>Retards</th>
                          <th style={{ textAlign: 'center' }}>Taux absence</th>
                          <th style={{ textAlign: 'center' }}>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ue.etudiants.map(a => {
                          const taux = parseFloat(a.taux_absence_pct as any) || 0;
                          const risk = taux >= seuil ? 'red' : taux >= seuil / 2 ? 'amber' : 'green';
                          const riskColor = risk === 'red' ? '#dc2626' : risk === 'amber' ? '#d97706' : '#059669';
                          return (
                            <tr key={a.etudiant_id}>
                              <td>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.etudiant_nom} {a.etudiant_prenom}</div>
                                <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.matricule ?? '—'}</div>
                              </td>
                              <td style={{ textAlign: 'center' }}>{a.nb_seances_total}</td>
                              <td style={{ textAlign: 'center', color: '#059669', fontWeight: 600 }}>{a.nb_presents}</td>
                              <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 600 }}>{a.nb_absences}</td>
                              <td style={{ textAlign: 'center', color: '#6b7280' }}>{a.nb_absences_justifiees}</td>
                              <td style={{ textAlign: 'center', color: '#d97706' }}>{a.nb_retards}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: riskColor }}>{taux}%</span>
                                  <div style={{ width: 60, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(taux, 100)}%`, background: riskColor, borderRadius: 3 }} />
                                  </div>
                                </div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {a.est_exclu
                                  ? <span className="badge red">Exclu</span>
                                  : taux >= seuil
                                    ? <span className="badge amber">À risque</span>
                                    : <span className="badge green">OK</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
          )}

          {/* ── TAB EXCLUSIONS ── */}
          {tab === 'exclusions' && (
            loading ? <div className="loading">Chargement…</div> : (
              <>
                {/* KPI */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: '1rem' }}>
                  <div className="card"><div className="c-ico">⚠️</div><div className="c-val">{absRisque.length}</div><div className="c-lbl">Étudiants à risque</div><div className="c-sub">Taux ≥ {seuil}%</div></div>
                  <div className="card"><div className="c-ico">🚫</div><div className="c-val">{exclusions.length}</div><div className="c-lbl">Exclusions actives</div></div>
                  <div className="card"><div className="c-ico">📋</div><div className="c-val">{absRisque.length + exclusions.length}</div><div className="c-lbl">Cas recensés</div></div>
                </div>

                {/* Actions auto */}
                <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center', padding: '.85rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                  <div style={{ flex: 1, fontSize: 12, color: '#065f46' }}>Seuil : <strong>{seuil}%</strong> d'absences injustifiées — configurable dans Paramètres → Règles</div>
                  <button className="btn-sm btn-blue" onClick={handleExclusionsAuto}>⚡ Appliquer exclusions auto</button>
                </div>

                {/* Étudiants à risque */}
                {absRisque.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>⚠️ Étudiants à risque (non exclus)</span>
                      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Étudiant</th><th>UE</th><th style={{ textAlign: 'center' }}>Taux absence</th><th style={{ textAlign: 'center' }}>Absences</th><th></th></tr></thead>
                        <tbody>
                          {absRisque.map((a, i) => (
                            <tr key={i}>
                              <td>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.etudiant_nom} {a.etudiant_prenom}</div>
                                <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.matricule ?? '—'}</div>
                              </td>
                              <td><span className="badge blue">{a.ue_code}</span> {a.ue_intitule}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{a.taux_absence_pct}%</td>
                              <td style={{ textAlign: 'center' }}>{a.nb_absences} / {a.nb_seances_total}</td>
                              <td>
                                <button className="btn-sm btn-red" onClick={() => handleExclure(a)}>Exclure de l'UE</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Exclusions actives */}
                {exclusions.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>🚫 Exclusions actives</span>
                      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Étudiant</th><th>UE exclue</th><th>Motif</th><th>Date</th><th></th></tr></thead>
                        <tbody>
                          {exclusions.map(ex => (
                            <tr key={ex.id}>
                              <td>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{ex.etudiant_nom} {ex.etudiant_prenom}</div>
                                <div style={{ fontSize: 11, color: '#9ca3af' }}>{ex.matricule ?? '—'}</div>
                              </td>
                              <td><span className="badge red">{ex.ue_code}</span> {ex.ue_intitule}</td>
                              <td style={{ fontSize: 12, color: '#6b7280' }}>
                                {ex.motif}
                                {ex.source === 'auto' && <span className="badge blue" style={{ fontSize: 9, padding: '1px 5px', marginLeft: 4 }}>auto</span>}
                              </td>
                              <td style={{ fontSize: 12, color: '#6b7280' }}>{ex.date_exclusion}</td>
                              <td><button className="btn-sm btn-secondary" onClick={() => handleLeverExclusion(ex.id)}>Lever</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {absRisque.length === 0 && exclusions.length === 0 && (
                  <div className="empty-state"><div className="es-ico">✅</div><h3>Aucune exclusion active</h3><p>Tous les étudiants ont un taux d'absence inférieur à {seuil}%</p></div>
                )}
              </>
            )
          )}
        </>
      )}

      {/* Modal saisie présence */}
      {modalSeance && (
        <ModalSaisiePresence
          seanceId={modalSeance.seanceId}
          matiereNom={modalSeance.nom}
          etudiants={etudiants}
          ecoleId={ecoleId}
          onClose={() => { setModalSeance(null); loadSaisie(); }}
        />
      )}
    </div>
  );
}
