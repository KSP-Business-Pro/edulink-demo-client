// ─────────────────────────────────────────────────────────────────────────────
//  ProgrammesPage.tsx — Référentiel académique LMD (Sprint 2)
//  Tabs : Programmes | Unités d'enseignement | Semestres
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type {
  Programme, UniteEnseignement, Semestre, AnneeAcademique,
} from '../../types/referentiel.types';
import { GRADE_LABEL, CREDITS_DEFAULTS, STATUT_SEMESTRE_LABEL } from '../../types/referentiel.types';
import {
  fetchProgrammes, fetchUEs, fetchSemestres, fetchAnneesAcademiques,
  deleteProgramme, deleteUE, deleteSemestre, checkCreditsUE,
} from '../../services/referentiel.service';
import { supabase } from '../../services/supabase';

import ModalProgramme       from './components/ModalProgramme';
import ModalUE              from './components/ModalUE';
import ModalSemestre        from './components/ModalSemestre';
import ModalMatieres        from './components/ModalMatieres';
import CreditsBadge         from './components/CreditsBadge';
import ModalImportMatieres  from './components/ModalImportMatieres';

type Tab = 'programmes' | 'ues' | 'semestres';

interface Enseignant { id: string; nom: string; prenom: string }
interface EcoleOption { id: string; nom: string }

export default function ProgrammesPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').order('nom')
      .then(({ data }) => {
        setEcoles(data ?? []);
        if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
      });
  }, [isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab]           = useState<Tab>('programmes');
  const [programmes, setProgs]  = useState<Programme[]>([]);
  const [ues, setUEs]           = useState<UniteEnseignement[]>([]);
  const [semestres, setSems]    = useState<Semestre[]>([]);
  const [annees, setAnnees]     = useState<AnneeAcademique[]>([]);
  const [enseignants, setEns]   = useState<Enseignant[]>([]);
  const [loading, setLoading]   = useState(true);

  const [modalProg, setModalProg]         = useState<{ open: boolean; item: Programme | null }>({ open: false, item: null });
  const [modalUE, setModalUE]             = useState<{ open: boolean; item: UniteEnseignement | null }>({ open: false, item: null });
  const [modalSem, setModalSem]           = useState<{ open: boolean; item: Semestre | null }>({ open: false, item: null });
  const [modalMat, setModalMat]           = useState<{ open: boolean; ueId: string; ueNom: string } | null>(null);
  const [showImportMat, setShowImportMat] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const anneeActiveId = annees[0]?.id;

  const loadAll = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const [p, u, s, a] = await Promise.all([
        fetchProgrammes(ecoleId),
        fetchUEs(ecoleId),
        fetchSemestres(ecoleId),
        fetchAnneesAcademiques(ecoleId),
      ]);
      setProgs(p); setUEs(u); setSems(s); setAnnees(a);
      const { data: ens } = await supabase
        .from('enseignants').select('id,nom,prenom')
        .eq('ecole_id', ecoleId).eq('statut', 'actif').order('nom');
      setEns(ens ?? []);
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleDeleteProg(p: Programme) {
    if (!confirm(`Supprimer "${p.intitule}" ? Cette action est irréversible.`)) return;
    try { await deleteProgramme(p.id); await loadAll(); }
    catch (err: any) { alert('Erreur : ' + err.message); }
  }

  async function handleDeleteUE(u: UniteEnseignement) {
    if (!confirm(`Supprimer l'UE "${u.intitule}" ? Action irréversible.`)) return;
    try { await deleteUE(u.id); await loadAll(); }
    catch (err: any) { alert('Erreur : ' + err.message); }
  }

  async function handleDeleteSem(s: Semestre) {
    if (!confirm(`Supprimer "${s.libelle}" ? Attention : notes et présences liées seront perdues.`)) return;
    try { await deleteSemestre(s.id); await loadAll(); }
    catch (err: any) { alert('Erreur : ' + err.message); }
  }

  const gradeOrder = ['licence', 'master', 'doctorat'] as const;
  const gradeGroups = gradeOrder
    .map(g => ({ grade: g, items: programmes.filter(p => p.grade === g) }))
    .filter(g => g.items.length > 0);

  const creditCheck = checkCreditsUE(ues);

  const statutColor: Record<string, string> = {
    planifie: 'gray', en_cours: 'green', cloture: 'amber', archive: 'blue',
  };
  const typeUEColor: Record<string, string> = {
    fondamentale: 'blue', optionnelle: 'amber', transversale: 'purple',
  };
  const gradeColor: Record<string, string> = {
    licence: 'blue', master: 'purple', doctorat: 'teal',
  };

  const toastBg = { success: '#059669', error: '#dc2626', info: '#1e3a5f' };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      <div className="top">
        <div>
          <h2>Programmes &amp; UE</h2>
          <div className="page-subtitle">Référentiel académique LMD-CAMES</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select value={ecoleId} onChange={(e) => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          {tab === 'programmes' && (
            <button className="btn-blue" onClick={() => setModalProg({ open: true, item: null })}>+ Programme</button>
          )}
          {tab === 'ues' && (
            <>
              <button className="btn-ghost" onClick={() => setShowImportMat(true)}>⬆ Import Matières</button>
              <button className="btn-blue" onClick={() => setModalUE({ open: true, item: null })}>+ Unité d'Enseignement</button>
            </>
          )}
          {tab === 'semestres' && (
            <button className="btn-blue" onClick={() => setModalSem({ open: true, item: null })}>+ Semestre</button>
          )}
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: '1.25rem' }}>
        {([
          ['programmes', `Programmes (${programmes.length})`],
          ['ues',        `Unités d'enseignement (${ues.length})`],
          ['semestres',  `Semestres (${semestres.length})`],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Chargement...</div>
      ) : (
        <>
          {/* TAB PROGRAMMES */}
          {tab === 'programmes' && (
            gradeGroups.length === 0
              ? (
                <div className="empty-state">
                  <div className="es-ico">🎓</div>
                  <h3>Aucun programme configuré</h3>
                  <p>Créez votre premier programme LMD</p>
                  <button onClick={() => setModalProg({ open: true, item: null })}>+ Programme</button>
                </div>
              )
              : gradeGroups.map(({ grade, items }) => (
                <div key={grade} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem' }}>
                    <span className={`badge ${gradeColor[grade]}`} style={{ fontSize: 12, padding: '4px 12px' }}>
                      {GRADE_LABEL[grade]}
                    </span>
                    <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Code</th><th>Intitulé</th><th>Crédits</th><th>Durée</th><th>Statut</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(p => (
                          <tr key={p.id}>
                            <td><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{p.code}</code></td>
                            <td><strong>{p.intitule}</strong></td>
                            <td>
                              <span className="badge gray">{p.credits_total} CECT</span>
                              {p.credits_total !== CREDITS_DEFAULTS[p.grade].credits && (
                                <span className="badge amber" style={{ marginLeft: 4, fontSize: 10 }}>≠CAMES</span>
                              )}
                            </td>
                            <td>{p.duree_annees} ans</td>
                            <td><span className={`badge ${p.actif ? 'green' : 'gray'}`}>{p.actif ? 'Actif' : 'Inactif'}</span></td>
                            <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <button className="btn-ghost btn-sm" onClick={() => setModalProg({ open: true, item: p })}>✏</button>
                              <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDeleteProg(p)}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
          )}

          {/* TAB UE */}
          {tab === 'ues' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', padding: '.75rem 1rem', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Contrôle CAMES (30 CECT/semestre) :</span>
                <CreditsBadge check={creditCheck} label="total UE" showDetail />
              </div>
              {ues.length === 0
                ? (
                  <div className="empty-state">
                    <div className="es-ico">📚</div>
                    <h3>Aucune unité d'enseignement</h3>
                    <p>Créez vos premières UE</p>
                  </div>
                )
                : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Code</th><th>Intitulé</th><th>Type</th><th>Crédits</th><th>CC / Exam</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ues.map(u => (
                          <tr key={u.id}>
                            <td><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{u.code}</code></td>
                            <td><strong>{u.intitule}</strong></td>
                            <td><span className={`badge ${typeUEColor[u.type_ue] ?? 'gray'}`}>{u.type_ue}</span></td>
                            <td><span className="badge teal">{u.credits_cect} CECT</span></td>
                            <td style={{ fontSize: 12 }}>CC {Math.round(u.poids_cc * 100)}% · Exam {Math.round(u.poids_examen * 100)}%</td>
                            <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <button className="btn-ghost btn-sm" onClick={() => setModalMat({ open: true, ueId: u.id, ueNom: u.intitule })}>Matières</button>
                              <button className="btn-ghost btn-sm" onClick={() => setModalUE({ open: true, item: u })}>✏</button>
                              <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDeleteUE(u)}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </>
          )}

          {/* TAB SEMESTRES */}
          {tab === 'semestres' && (
            semestres.length === 0
              ? (
                <div className="empty-state">
                  <div className="es-ico">📅</div>
                  <h3>Aucun semestre configuré</h3>
                  <p>Créez votre premier semestre</p>
                </div>
              )
              : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>N°</th><th>Libellé</th><th>Programme</th><th>Niveau</th><th>Année</th><th>Statut</th><th>Dates</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {semestres.map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 700, color: '#1e3a5f' }}>S{s.numero}</td>
                          <td><strong>{s.libelle}</strong></td>
                          <td style={{ fontSize: 12, color: '#6b7280' }}>{s.programmes_lmd?.intitule ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
                          <td><span className="badge blue">{s.niveau}</span></td>
                          <td style={{ fontSize: 12, color: '#6b7280' }}>{s.annees_academiques?.libelle ?? '—'}</td>
                          <td><span className={`badge ${statutColor[s.statut] ?? 'gray'}`}>{STATUT_SEMESTRE_LABEL[s.statut]}</span></td>
                          <td style={{ fontSize: 11, color: '#9ca3af' }}>{s.date_debut ? `${s.date_debut} → ${s.date_fin ?? '?'}` : '—'}</td>
                          <td style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-ghost btn-sm" onClick={() => setModalSem({ open: true, item: s })}>✏</button>
                            <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDeleteSem(s)}>🗑</button>
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

      {/* Modals */}
      {modalProg.open && (
        <ModalProgramme ecoleId={ecoleId} programme={modalProg.item}
          onClose={() => setModalProg({ open: false, item: null })} onSaved={loadAll} />
      )}
      {modalUE.open && (
        <ModalUE ecoleId={ecoleId} ue={modalUE.item} programmes={programmes}
          onClose={() => setModalUE({ open: false, item: null })} onSaved={loadAll} />
      )}
      {modalSem.open && (
        <ModalSemestre ecoleId={ecoleId} semestre={modalSem.item} programmes={programmes}
          annees={annees} anneeActiveId={anneeActiveId}
          onClose={() => setModalSem({ open: false, item: null })} onSaved={loadAll} />
      )}
      {modalMat && (
        <ModalMatieres ecoleId={ecoleId} ueId={modalMat.ueId} ueNom={modalMat.ueNom}
          enseignants={enseignants} onClose={() => setModalMat(null)} />
      )}
      {showImportMat && (
        <ModalImportMatieres
          ecoleId={ecoleId}
          onClose={() => setShowImportMat(false)}
          onImported={(ok, skip) => {
            showToast(
              `${ok} matière(s) importée(s)${skip ? ` · ${skip} erreur(s)` : ''}`,
              skip ? 'info' : 'success'
            );
            setShowImportMat(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}
