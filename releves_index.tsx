// src/modules/releves/index.tsx
// B4.3 — Ajout aperçu PDF + bouton ⬇ par étudiant

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import { MENTION_LABEL, MENTION_COLOR } from '../../types/deliberations.types';
import { basculerVerrouReleve } from '../../services/deliberations.service';
import { ReleveModal, type ReleveData } from './components/RelevePDF';

const RELEVE_FN_URL = `https://kcfpvnrgutkhakogbjip.supabase.co/functions/v1/publish-releve`;

async function releveHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token ?? '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

interface SemestreOption { id: string; libelle: string }
interface EcoleOption    { id: string; nom: string; code_ecole: string | null }

interface ReleveEtudiant {
  id: string; nom: string; prenom: string; matricule: string;
  filiere: string; email_auth: string | null;
}

interface ReleveNote {
  etudiant_id:    string;
  mention:        string | null;
  credits_valides:number;
  decision:       string | null;
  verrouille:     boolean;
  snapshot_notes: Record<string, unknown> | null;
  publie_le:      string;
}

interface BlocageRegles {
  blocage_releve_impaye:    boolean;
  tolerance_impaye_releve:  number;
}

export default function RelevesPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId,  setEcoleId]  = useState<string>(user?.ecole_id ?? '');
  const [ecoles,   setEcoles]   = useState<EcoleOption[]>([]);
  const [ecoleInfo,setEcoleInfo]= useState<EcoleOption | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      // Charger infos école courante
      if (ecoleId) {
        supabase.from('ecoles').select('id,nom,code_ecole').eq('id', ecoleId).single()
          .then(({ data }) => setEcoleInfo(data as EcoleOption));
      }
      return;
    }
    supabase.from('ecoles').select('id,nom,code_ecole').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId((data[0] as EcoleOption).id);
    });
  }, [isSuperAdmin, ecoleId]);

  // Charger infos école quand ecoleId change
  useEffect(() => {
    if (!ecoleId) return;
    supabase.from('ecoles').select('id,nom,code_ecole').eq('id', ecoleId).single()
      .then(({ data }) => setEcoleInfo(data as EcoleOption));
  }, [ecoleId]);

  const [semestres,   setSemestres]   = useState<SemestreOption[]>([]);
  const [semId,       setSemId]       = useState('');
  const [semLibelle,  setSemLibelle]  = useState('');
  const [etudiants,   setEtudiants]   = useState<ReleveEtudiant[]>([]);
  const [relevesMap,  setRelevesMap]  = useState<Record<string, ReleveNote>>({});
  const [soldesMap,   setSoldesMap]   = useState<Record<string, number> | null>(null);
  const [tolerance,   setTolerance]   = useState(0);
  const [sendEmail,   setSendEmail]   = useState(true);
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [pubProgress, setPubProgress] = useState<{ done: number; total: number } | null>(null);
  const [releveOpen,  setReleveOpen]  = useState<ReleveData | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    if (!ecoleId) return;
    supabase.from('semestres').select('id,libelle').eq('ecole_id', ecoleId).order('numero')
      .then(({ data }) => setSemestres((data ?? []) as SemestreOption[]));
  }, [ecoleId]);

  const loadReleves = useCallback(async () => {
    if (!semId || !ecoleId) return;
    setLoading(true);
    try {
      const [insRes, relevesRes, blocRes] = await Promise.all([
        supabase.from('inscriptions_semestre')
          .select('etudiant_id, etudiants(id,nom,prenom,matricule,filiere,email_auth)')
          .eq('semestre_id', semId).eq('statut', 'active'),
        supabase.from('releves_notes')
          .select('etudiant_id,mention,credits_valides,decision,verrouille,snapshot_notes,publie_le')
          .eq('semestre_id', semId),
        supabase.from('regles_ecole')
          .select('blocage_releve_impaye,tolerance_impaye_releve')
          .eq('ecole_id', ecoleId).maybeSingle(),
      ]);

      const etus = (((insRes.data ?? []) as Record<string, unknown>[])
        .map(i => i.etudiants as ReleveEtudiant)
        .filter(Boolean))
        .sort((a, b) => a.nom.localeCompare(b.nom));
      setEtudiants(etus);

      const rMap: Record<string, ReleveNote> = {};
      ((relevesRes.data ?? []) as ReleveNote[]).forEach(r => { rMap[r.etudiant_id] = r; });
      setRelevesMap(rMap);

      const bloc = (blocRes.data ?? { blocage_releve_impaye: false, tolerance_impaye_releve: 0 }) as BlocageRegles;
      const tol = Number(bloc.tolerance_impaye_releve) || 0;
      setTolerance(tol);

      if (bloc.blocage_releve_impaye) {
        const ids = etus.map(e => e.id);
        if (ids.length) {
          const { data: facs } = await supabase
            .from('factures').select('etudiant_id,montant_total,montant,montant_paye,statut')
            .in('etudiant_id', ids);
          const sMap: Record<string, number> = {};
          ((facs ?? []) as Record<string, unknown>[]).forEach(f => {
            if (f.statut === 'annule') return;
            const du = Math.max(((f.montant_total as number) ?? (f.montant as number) ?? 0) - ((f.montant_paye as number) || 0), 0);
            sMap[f.etudiant_id as string] = (sMap[f.etudiant_id as string] || 0) + du;
          });
          setSoldesMap(sMap);
        }
      } else {
        setSoldesMap(null);
      }
    } finally { setLoading(false); }
  }, [semId, ecoleId]);

  useEffect(() => { loadReleves(); }, [loadReleves]);

  // ── Aperçu PDF ─────────────────────────────────────────────────────────────
  function handleApercu(et: ReleveEtudiant) {
    const r = relevesMap[et.id];
    if (!r?.snapshot_notes) { showToast('Relevé non disponible — publiez-le d\'abord', 'error'); return; }
    setReleveOpen({
      etudiant: {
        nom:       et.nom,
        prenom:    et.prenom,
        matricule: et.matricule,
        filiere:   et.filiere,
      },
      ecole: {
        nom:  ecoleInfo?.nom  ?? 'École',
        code: ecoleInfo?.code_ecole ?? 'ECO',
      },
      snapshot:  r.snapshot_notes as unknown as ReleveData['snapshot'],
      decision:  r.decision,
      publie_le: r.publie_le,
    });
  }

  // ── Publication ────────────────────────────────────────────────────────────
  async function getSessionId(): Promise<string | null> {
    const { data } = await supabase.from('sessions_evaluation')
      .select('id').eq('semestre_id', semId).eq('type_session', 'normale').single();
    return (data as { id: string } | null)?.id ?? null;
  }

  async function publierUn(etudiantId: string, opts: { republish?: boolean; sendEmail?: boolean } = {}): Promise<{ success: boolean; blocked?: boolean; verrouille?: boolean; error?: string }> {
    const sessionId = await getSessionId();
    if (!sessionId) return { success: false, error: 'Aucune session normale' };
    try {
      const res = await fetch(RELEVE_FN_URL, {
        method: 'POST', headers: await releveHeaders(),
        body: JSON.stringify({
          etudiant_id: etudiantId, semestre_id: semId, session_id: sessionId,
          mode: 'publish', send_email: opts.sendEmail ?? sendEmail,
          republish: opts.republish ?? false,
        }),
      });
      const data = await res.json();
      if (data.success) return { success: true };
      if (data.detail === 'verrouille') return { success: false, verrouille: true };
      if (data.blocked) return { success: false, blocked: true };
      return { success: false, error: data.error };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
    }
  }

  async function renvoyerEmail(etudiant: ReleveEtudiant) {
    if (!etudiant.email_auth) { showToast('Aucune adresse email', 'error'); return; }
    if (!confirm(`Renvoyer le relevé par email à ${etudiant.prenom} ${etudiant.nom} ?\n${etudiant.email_auth}`)) return;
    const sessionId = await getSessionId();
    try {
      const res = await fetch(RELEVE_FN_URL, {
        method: 'POST', headers: await releveHeaders(),
        body: JSON.stringify({ etudiant_id: etudiant.id, semestre_id: semId, session_id: sessionId, mode: 'resend' }),
      });
      const data = await res.json();
      if (data.success && data.email_envoye) showToast(`📧 Relevé renvoyé à ${etudiant.prenom} ${etudiant.nom} ✓`);
      else showToast("Échec de l'envoi", 'error');
    } catch { showToast('Erreur réseau', 'error'); }
  }

  async function handlePublierTous() {
    const nonPublies = etudiants.filter(et => !relevesMap[et.id] && !(soldesMap && (soldesMap[et.id] || 0) > tolerance));
    if (!nonPublies.length) { showToast('Tous les relevés sont déjà publiés', 'info'); return; }
    if (!confirm(`Publier les relevés de ${nonPublies.length} étudiant(s) ?${sendEmail ? '\nUn email sera envoyé.' : ''}`)) return;
    setPubProgress({ done: 0, total: nonPublies.length });
    let ok = 0, blocked = 0, failed = 0;
    for (let i = 0; i < nonPublies.length; i++) {
      const r = await publierUn(nonPublies[i].id, { sendEmail });
      if (r.success) ok++; else if (r.blocked) blocked++; else failed++;
      setPubProgress({ done: i + 1, total: nonPublies.length });
    }
    setPubProgress(null);
    showToast(`${ok} relevé(s) publié(s)${blocked ? ` · ${blocked} bloqué(s)` : ''}${failed ? ` · ${failed} échec(s)` : ''}`, blocked || failed ? 'info' : 'success');
    await loadReleves();
  }

  async function handleRepublierTous() {
    const publies = Object.keys(relevesMap);
    if (!publies.length) { showToast('Aucun relevé publié', 'info'); return; }
    if (!confirm(`Recalculer et republier ${publies.length} relevé(s) ?\nAucun email ne sera envoyé.`)) return;
    setPubProgress({ done: 0, total: publies.length });
    let ok = 0, locked = 0, blocked = 0, failed = 0;
    for (let i = 0; i < publies.length; i++) {
      const r = await publierUn(publies[i], { republish: true, sendEmail: false });
      if (r.success) ok++; else if (r.verrouille) locked++; else if (r.blocked) blocked++; else failed++;
      setPubProgress({ done: i + 1, total: publies.length });
    }
    setPubProgress(null);
    let msg = `${ok} relevé(s) republié(s)`;
    if (locked)  msg += ` · ${locked} verrouillé(s)`;
    if (blocked) msg += ` · ${blocked} bloqué(s)`;
    if (failed)  msg += ` · ${failed} échec(s)`;
    showToast(msg, locked || blocked || failed ? 'info' : 'success');
    await loadReleves();
  }

  async function handlePublierUn(etudiantId: string) {
    const r = await publierUn(etudiantId, { sendEmail });
    if (r.success) { showToast('Relevé publié ✓'); await loadReleves(); }
    else if (r.blocked) showToast('Bloqué — impayé en cours', 'error');
    else showToast(`Erreur : ${r.error}`, 'error');
  }

  async function handleRepublierUn(etudiantId: string, nom: string) {
    if (!confirm(`Republier le relevé de ${nom} ?\nAucun email ne sera envoyé.`)) return;
    const r = await publierUn(etudiantId, { republish: true, sendEmail: false });
    if (r.success) { showToast(`Relevé de ${nom} republié ✓`); await loadReleves(); }
    else if (r.verrouille) showToast('Relevé verrouillé — déverrouillez-le', 'error');
    else showToast(`Erreur : ${r.error}`, 'error');
  }

  async function handleVerrou(etudiantId: string, isLocked: boolean) {
    const mode = isLocked ? 'unlock' : 'lock';
    if (!confirm(isLocked ? 'Déverrouiller ce relevé ?' : 'Verrouiller ce relevé ? Il deviendra définitif.')) return;
    try {
      await basculerVerrouReleve(etudiantId, semId, mode);
      showToast(isLocked ? 'Relevé déverrouillé 🔓' : 'Relevé verrouillé 🔒');
      await loadReleves();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const nbPublies  = Object.keys(relevesMap).length;
  const nbTotal    = etudiants.length;
  const nbBloques  = soldesMap ? etudiants.filter(et => !relevesMap[et.id] && (soldesMap[et.id] || 0) > tolerance).length : 0;
  const pctPublies = nbTotal > 0 ? Math.round(nbPublies / nbTotal * 100) : 0;

  const listeFiltree = useMemo(() => {
    if (!search) return etudiants;
    const s = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return etudiants.filter(et => {
      const hay = `${et.nom} ${et.prenom} ${et.matricule ?? ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return hay.includes(s);
    });
  }, [etudiants, search]);

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
          <h2>Relevés de notes</h2>
          <div className="page-subtitle">Publication · aperçu PDF · verrouillage · envoi email</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          <select value={semId}
            onChange={e => {
              setSemId(e.target.value);
              setSemLibelle(semestres.find(s => s.id === e.target.value)?.libelle ?? '');
            }}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 220 }}>
            <option value="">— Sélectionner un semestre —</option>
            {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </select>
        </div>
      </div>

      {!semId && (
        <div className="empty-state">
          <div className="es-ico">📄</div>
          <h3>Sélectionnez un semestre</h3>
          <p>Choisissez un semestre pour gérer les relevés de notes</p>
        </div>
      )}

      {semId && !loading && (
        <>
          {/* Barre progression + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '.85rem 1rem', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, fontSize: 13, color: '#374151' }}>
              <strong>{nbPublies}</strong> / {nbTotal} relevés publiés
              {nbBloques > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> · {nbBloques} bloqué(s) pour impayés</span>}
            </div>
            <div style={{ width: 150, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pctPublies}%`, background: '#059669', borderRadius: 3, transition: 'width .5s' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} style={{ width: 14, height: 14 }} />
              📧 Email à la publication
            </label>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher…"
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', width: 160 }} />
            <button onClick={handlePublierTous} disabled={!!pubProgress}
              style={{ background: '#059669', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {pubProgress ? `Publication… ${pubProgress.done}/${pubProgress.total}` : 'Publier tous'}
            </button>
            <button onClick={handleRepublierTous} disabled={!!pubProgress}
              style={{ background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', padding: '7px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              title="Recalculer et republier tous">
              🔄 Republier tous
            </button>
          </div>

          {/* Tableau */}
          {listeFiltree.length === 0
            ? <div className="empty-state"><div className="es-ico">📄</div><h3>Aucun étudiant inscrit</h3></div>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Étudiant</th>
                      <th>Filière</th>
                      <th style={{ textAlign: 'center' }}>Mention</th>
                      <th style={{ textAlign: 'center' }}>Crédits</th>
                      <th style={{ textAlign: 'center' }}>Décision</th>
                      <th style={{ textAlign: 'center' }}>Statut</th>
                      <th style={{ textAlign: 'center', minWidth: 160 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listeFiltree.map(et => {
                      const r = relevesMap[et.id];
                      const solde = soldesMap ? (soldesMap[et.id] || 0) : 0;
                      const bloqueImpaye = !r && soldesMap && solde > tolerance;
                      return (
                        <tr key={et.id}>
                          <td>
                            <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                              {et.matricule ?? '—'}
                            </code>
                          </td>
                          <td><strong>{et.nom} {et.prenom}</strong></td>
                          <td style={{ fontSize: 12, color: '#6b7280' }}>{et.filiere ?? '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {r?.mention
                              ? <span className={`badge ${MENTION_COLOR[r.mention] ?? 'gray'}`}>{MENTION_LABEL[r.mention] ?? r.mention}</span>
                              : <span className="badge gray">—</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {r ? <span className="badge teal">{r.credits_valides} CECT</span> : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {r?.decision
                              ? <span className={`badge ${r.decision === 'admis' ? 'green' : 'amber'}`}>{r.decision}</span>
                              : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {r
                              ? <span className="badge green">Publié{r.verrouille ? ' 🔒' : ''}</span>
                              : bloqueImpaye
                                ? <span className="badge red" title={`Solde dû : ${solde.toLocaleString('fr-FR')} FCFA`}>🔒 Impayé</span>
                                : <span className="badge gray">En attente</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {r ? (
                              <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                                {/* ── Aperçu PDF (B4.3) ── */}
                                <button onClick={() => handleApercu(et)}
                                  style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                                  title="Aperçu et impression PDF">
                                  📄 PDF
                                </button>
                                {!r.verrouille && (
                                  <button onClick={() => handleRepublierUn(et.id, `${et.prenom} ${et.nom}`)}
                                    style={{ background: 'none', border: '1px solid #e5e7eb', padding: '2px 7px', borderRadius: 5, fontSize: 11, cursor: 'pointer', color: '#6b7280', fontFamily: 'inherit' }}
                                    title="Recalculer et republier">🔄</button>
                                )}
                                <button onClick={() => renvoyerEmail(et)} disabled={!et.email_auth}
                                  style={{ background: 'none', border: '1px solid #ede9fe', padding: '2px 7px', borderRadius: 5, fontSize: 11, cursor: et.email_auth ? 'pointer' : 'not-allowed', color: '#7c3aed', fontFamily: 'inherit', opacity: et.email_auth ? 1 : .4 }}
                                  title={et.email_auth ? `Envoyer à ${et.email_auth}` : 'Aucun email'}>📧</button>
                                <button onClick={() => handleVerrou(et.id, r.verrouille)}
                                  style={{ background: 'none', border: `1px solid ${r.verrouille ? '#b45309' : '#d1d5db'}`, padding: '2px 7px', borderRadius: 5, fontSize: 11, cursor: 'pointer', color: r.verrouille ? '#b45309' : '#9ca3af', fontFamily: 'inherit' }}
                                  title={r.verrouille ? 'Déverrouiller' : 'Verrouiller'}>
                                  {r.verrouille ? '🔒' : '🔓'}
                                </button>
                              </div>
                            ) : bloqueImpaye ? (
                              <button disabled style={{ opacity: .5, cursor: 'not-allowed', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit' }}>
                                🔒 {solde.toLocaleString('fr-FR')} FCFA
                              </button>
                            ) : (
                              <button onClick={() => handlePublierUn(et.id)}
                                style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                                Publier
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </>
      )}

      {semId && loading && <div className="loading">Chargement…</div>}

      {/* ── Modal aperçu PDF ── */}
      {releveOpen && (
        <ReleveModal
          data={releveOpen}
          onClose={() => setReleveOpen(null)}
        />
      )}
    </div>
  );
}

