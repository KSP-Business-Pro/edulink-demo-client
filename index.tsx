// src/modules/saisie-notes/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type {
  SessionEvaluation, Evaluation, NoteLMD,
  EtudiantSaisie, MatiereSaisie, UESaisie,
} from '../../types/saisie.types';
import {
  fetchSemestresActifsSaisie, fetchUEsBySemestre, fetchMatieresByUESaisie,
  fetchSessions, creerSessions, changerStatutSession,
  fetchEvaluations, ajouterEvaluation,
  fetchEtudiantsInscrits, fetchNotes,
} from '../../services/saisie.service';
import GrilleNotes      from './components/GrilleNotes';
import ModalImportNotes from './components/ModalImportNotes';

interface SemestreOption { id: string; libelle: string; niveau: string }
interface EcoleOption    { id: string; nom: string }

type SessionMode = 'normale' | 'rattrapage';

export default function SaisieNotesPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  // Super-admin : charger liste écoles
  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').order('nom')
      .then(({ data }) => {
        setEcoles(data ?? []);
        if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
      });
  }, [isSuperAdmin]); // eslint-disable-line

  // ── Sélecteurs ──────────────────────────────────────────────────────────────
  const [semestres, setSemestres]     = useState<SemestreOption[]>([]);
  const [semId, setSemId]             = useState('');
  const [ues, setUEs]                 = useState<UESaisie[]>([]);
  const [ueId, setUeId]               = useState('');
  const [matieres, setMatieres]       = useState<MatiereSaisie[]>([]);
  const [matId, setMatId]             = useState('');
  const [sessionMode, setSessionMode] = useState<SessionMode>('normale');

  // ── Données grille ──────────────────────────────────────────────────────────
  const [sessions, setSessions]   = useState<SessionEvaluation[]>([]);
  const [evals, setEvals]         = useState<Evaluation[]>([]);
  const [etudiants, setEtudiants] = useState<EtudiantSaisie[]>([]);
  const [notes, setNotes]         = useState<NoteLMD[]>([]);
  const [matiere, setMatiere]     = useState<MatiereSaisie | null>(null);

  const [loadingGrille, setLoadingGrille] = useState(false);
  const [showImport, setShowImport]       = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Chargement semestres (déclenché par ecoleId) ──────────────────────────
  useEffect(() => {
    if (!ecoleId) return;
    setSemestres([]); setSemId('');
    fetchSemestresActifsSaisie(ecoleId).then(data => setSemestres(data as SemestreOption[]));
  }, [ecoleId]);

  // ── Semestre → UE ────────────────────────────────────────────────────────────
  useEffect(() => {
    setUEs([]); setUeId(''); setMatieres([]); setMatId('');
    setMatiere(null); setEvals([]); setNotes([]);
    if (!semId) return;
    fetchUEsBySemestre(semId).then(data => setUEs(data));
  }, [semId]);

  // ── UE → Matières ────────────────────────────────────────────────────────────
  useEffect(() => {
    setMatieres([]); setMatId(''); setMatiere(null); setEvals([]); setNotes([]);
    if (!ueId) return;
    fetchMatieresByUESaisie(ueId).then(data => setMatieres(data));
  }, [ueId]);

  // ── Matière → Grille ──────────────────────────────────────────────────────
  const loadGrille = useCallback(async () => {
    if (!matId || !semId) return;
    setLoadingGrille(true);
    try {
      const [sess, etus] = await Promise.all([
        fetchSessions(semId),
        fetchEtudiantsInscrits(semId),
      ]);
      const mat = matieres.find(m => m.id === matId) ?? null;
      setSessions(sess); setEtudiants(etus); setMatiere(mat);
      const allEvals = await fetchEvaluations(matId, sess.map(s => s.id));
      setEvals(allEvals);
      setNotes(await fetchNotes(allEvals.map(e => e.id)));
    } finally {
      setLoadingGrille(false);
    }
  }, [matId, semId, matieres]);

  useEffect(() => { loadGrille(); }, [loadGrille]);

  // ── Sessions ─────────────────────────────────────────────────────────────────
  const sessNorm   = sessions.find(s => s.type_session === 'normale');
  const sessRatt   = sessions.find(s => s.type_session === 'rattrapage');
  const sessActive = sessionMode === 'rattrapage' ? sessRatt : sessNorm;

  const evalsCC = evals.filter(e => e.categorie === 'CC'     && e.session_id === sessActive?.id);
  const evalsEX = evals.filter(e => e.categorie === 'EXAMEN' && e.session_id === sessActive?.id);
  const notesSession = notes.filter(n =>
    evals.filter(e => e.session_id === sessActive?.id).map(e => e.id).includes(n.evaluation_id)
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleCreerSessions() {
    try { await creerSessions(semId, ecoleId); showToast('Sessions créées ✓'); await loadGrille(); }
    catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleChangerStatut(statut: string) {
    if (!sessActive) return;
    if (statut === 'close' && !confirm('Clôturer cette session ? Les saisies seront verrouillées.')) return;
    try {
      await changerStatutSession(sessActive.id, statut);
      showToast(statut === 'close' ? 'Session clôturée 🔒' : 'Session rouverte 🔓');
      await loadGrille();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleAjouterEval(cat: 'CC' | 'EXAMEN') {
    if (!sessActive || !matId) return;
    const intitule = prompt(`Intitulé (${cat}) :`, cat === 'CC' ? 'Devoir 1' : 'Examen final');
    if (!intitule) return;
    try {
      await ajouterEvaluation(matId, sessActive.id, ecoleId, cat, intitule, evals);
      showToast('Évaluation créée ✓');
      await loadGrille();
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

      <div className="top">
        <div>
          <h2>Saisie des notes</h2>
          <div className="page-subtitle">Grille de saisie par matière</div>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Sélecteur école super-admin */}
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

        {ues.length > 0 && (
          <select value={ueId} onChange={e => setUeId(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 180 }}>
            <option value="">Sélectionner une UE…</option>
            {ues.map(u => <option key={u.id} value={u.id}>{u.code} — {u.intitule}</option>)}
          </select>
        )}

        {matieres.length > 0 && (
          <select value={matId} onChange={e => setMatId(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 180 }}>
            <option value="">Sélectionner une matière…</option>
            {matieres.map(m => <option key={m.id} value={m.id}>{m.code} — {m.nom} (coef {m.coefficient})</option>)}
          </select>
        )}

        {matId && sessions.length > 0 && (
          <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginLeft: 'auto' }}>
            {(['normale', 'rattrapage'] as SessionMode[]).map(mode => (
              <button key={mode} onClick={() => setSessionMode(mode)}
                style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: sessionMode === mode ? (mode === 'rattrapage' ? '#f97316' : '#1e3a5f') : '#fff', color: sessionMode === mode ? '#fff' : '#6b7280' }}>
                {mode === 'normale' ? 'Normale' : 'Rattrapage'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* États vides */}
      {!semId && (
        <div className="empty-state">
          <div className="es-ico">✏️</div>
          <h3>Sélectionnez un semestre</h3>
          <p>Choisissez un semestre pour commencer la saisie</p>
        </div>
      )}
      {semId && !ueId && ues.length === 0 && <div className="empty-state"><div className="es-ico">📚</div><h3>Aucune UE pour ce semestre</h3><p>Configurez les UE dans Programmes &amp; UE</p></div>}
      {semId && ueId && !matId && matieres.length === 0 && <div className="empty-state"><div className="es-ico">📖</div><h3>Aucune matière pour cette UE</h3></div>}
      {semId && ueId && !matId && matieres.length > 0 && <div className="empty-state"><div className="es-ico">✏️</div><h3>Sélectionnez une matière</h3></div>}

      {/* Grille */}
      {matId && sessActive && matiere && !loadingGrille && (
        <GrilleNotes
          matiere={matiere} session={sessActive}
          evalsCC={evalsCC} evalsEX={evalsEX}
          etudiants={etudiants} notes={notesSession}
          ecoleId={ecoleId} onRefresh={loadGrille}
          onAjouterEval={handleAjouterEval}
          onChangerStatut={handleChangerStatut}
          onImporter={() => setShowImport(true)}
        />
      )}

      {/* Pas de session */}
      {matId && sessions.length === 0 && !loadingGrille && (
        <div className="empty-state">
          <div className="es-ico">⚠️</div>
          <h3>Aucune session d'évaluation</h3>
          <p>Aucune session n'est associée à ce semestre.</p>
          <button style={{ marginTop: '.75rem' }} onClick={handleCreerSessions}>Créer les sessions (normale + rattrapage)</button>
        </div>
      )}

      {/* Rattrapage non activé */}
      {matId && sessionMode === 'rattrapage' && sessRatt?.statut === 'planifiee' && !loadingGrille && (
        <div style={{ marginTop: '1rem', padding: '.85rem 1rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#9a3412' }}>Session rattrapage non encore activée.</span>
          <button onClick={async () => { if (!sessRatt) return; await changerStatutSession(sessRatt.id, 'ouverte'); showToast('Rattrapage activé ✓'); await loadGrille(); }}
            style={{ background: '#f97316', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            ▶ Activer le rattrapage
          </button>
        </div>
      )}

      {loadingGrille && <div className="loading">Chargement de la grille…</div>}

      {/* Modal import */}
      {showImport && matiere && (
        <ModalImportNotes
          evaluations={[...evalsCC, ...evalsEX]}
          etudiants={etudiants} ecoleId={ecoleId}
          onClose={() => setShowImport(false)}
          onImported={(ok, skip) => { showToast(`${ok} note(s) importée(s)${skip ? `, ${skip} ignorée(s)` : ''}`, skip ? 'info' : 'success'); loadGrille(); }}
        />
      )}
    </div>
  );
}
