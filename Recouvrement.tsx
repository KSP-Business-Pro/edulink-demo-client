// src/modules/comptabilite/components/Recouvrement.tsx
// Bloc 3 comptabilité — Suivi et recouvrement

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../services/supabase';
import ResponsiveTable, { type RTColumn } from '../../../components/ResponsiveTable';
import { fmt } from '../../../services/comptabilite.service';
import {
  type Impaye, type Relance, type Derogation, TYPE_DEROGATION_LABEL,
  fetchImpayes, fetchRelancesEtudiant, enregistrerRelance,
  fetchDerogationsEtudiant, accorderDerogation, revoquerDerogation,
} from '../../../services/recouvrement.service';

interface Props { ecoleId: string }

function graviteColor(jours: number): string {
  if (jours === 0) return 'gray';
  if (jours < 15) return 'amber';
  return 'red';
}

export default function Recouvrement({ ecoleId }: Props) {
  const { user } = useAuth();
  const [impayes, setImpayes] = useState<Impaye[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [relanceModal, setRelanceModal] = useState<Impaye | null>(null);
  const [relanceCanal, setRelanceCanal] = useState<Relance['canal']>('email');
  const [relanceMessage, setRelanceMessage] = useState('');
  const [relanceEmail, setRelanceEmail] = useState<string | null>(null);
  const [savingRelance, setSavingRelance] = useState(false);
  const [historique, setHistorique] = useState<{ relances: Relance[]; derogations: Derogation[] } | null>(null);

  const [derogModal, setDerogModal] = useState<Impaye | null>(null);
  const [derogType, setDerogType] = useState<Derogation['type_derogation']>('acces_releve');
  const [derogMotif, setDerogMotif] = useState('');
  const [derogFin, setDerogFin] = useState('');
  const [savingDerog, setSavingDerog] = useState(false);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try { setImpayes(await fetchImpayes(ecoleId)); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  function messageParDefaut(imp: Impaye): string {
    return `Bonjour,\n\nNous vous rappelons que le solde de ${fmt(imp.solde)} reste dû pour ${imp.etudiant!.nom} ${imp.etudiant!.prenom} (${imp.etudiant!.matricule ?? '—'})${imp.joursRetard > 0 ? `, en retard de ${imp.joursRetard} jour${imp.joursRetard > 1 ? 's' : ''}` : ''}.\n\nMerci de bien vouloir régulariser cette situation dans les meilleurs délais.\n\nCordialement.`;
  }

  async function openRelance(imp: Impaye) {
    setRelanceModal(imp);
    setRelanceCanal('email');
    setRelanceMessage(messageParDefaut(imp));
    setRelanceEmail(null);
    const { data } = await supabase.from('etudiants').select('email_auth,email_parent').eq('id', imp.etudiant!.id).maybeSingle();
    setRelanceEmail(data?.email_parent || data?.email_auth || null);
  }

  async function openHistorique(imp: Impaye) {
    const [r, d] = await Promise.all([
      fetchRelancesEtudiant(imp.etudiant!.id),
      fetchDerogationsEtudiant(imp.etudiant!.id),
    ]);
    setHistorique({ relances: r, derogations: d });
  }

  function handleOuvrirMailto() {
    if (!relanceEmail || !relanceModal) return;
    const sujet = encodeURIComponent(`Rappel de paiement — ${relanceModal.etudiant!.nom} ${relanceModal.etudiant!.prenom}`);
    const corps = encodeURIComponent(relanceMessage);
    window.open(`mailto:${relanceEmail}?subject=${sujet}&body=${corps}`, '_blank');
  }

  async function handleEnregistrerRelance(e: React.FormEvent) {
    e.preventDefault();
    if (!relanceModal || !user) return;
    setSavingRelance(true);
    try {
      await enregistrerRelance({
        ecoleId, etudiantId: relanceModal.etudiant!.id, canal: relanceCanal, message: relanceMessage,
        montantDu: relanceModal.solde, authUserId: user.id, envoyeParNom: `${user.nom}${user.prenom ? ' ' + user.prenom : ''}`,
      });
      setRelanceModal(null);
      await load();
      showToast('Relance enregistrée ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setSavingRelance(false); }
  }

  async function handleAccorderDerogation(e: React.FormEvent) {
    e.preventDefault();
    if (!derogModal || !user || !derogMotif.trim()) return;
    setSavingDerog(true);
    try {
      await accorderDerogation({
        ecoleId, etudiantId: derogModal.etudiant!.id, type: derogType, motif: derogMotif, dateFin: derogFin || null,
        authUserId: user.id, accordeeParNom: `${user.nom}${user.prenom ? ' ' + user.prenom : ''}`,
      });
      setDerogModal(null); setDerogMotif(''); setDerogFin('');
      showToast('Dérogation accordée ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setSavingDerog(false); }
  }

  async function handleRevoquer(id: string) {
    if (!user || !confirm('Révoquer cette dérogation ?')) return;
    try {
      await revoquerDerogation(id, user.id);
      if (relanceModal) await openHistorique(relanceModal);
      showToast('Dérogation révoquée');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  const columns: RTColumn<Impaye>[] = [
    {
      key: 'etudiant', label: 'Étudiant', primary: true,
      render: imp => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{imp.etudiant!.nom} {imp.etudiant!.prenom}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{imp.etudiant!.matricule ?? '—'} · {imp.etudiant!.filiere ?? ''}</div>
        </div>
      ),
    },
    { key: 'solde', label: 'Solde dû', render: imp => <span style={{ fontWeight: 700, color: '#dc2626', fontSize: 13 }}>{fmt(imp.solde)}</span> },
    {
      key: 'retard', label: 'Retard',
      render: imp => imp.joursRetard > 0
        ? <span className={`badge ${graviteColor(imp.joursRetard)}`}>{imp.joursRetard} j</span>
        : <span className="badge gray">À échoir</span>,
    },
    {
      key: 'relances', label: 'Relances',
      render: imp => imp.nbRelances > 0
        ? <span style={{ fontSize: 12 }}>{imp.nbRelances} · dernière {imp.derniereRelance ? new Date(imp.derniereRelance).toLocaleDateString('fr-FR') : '—'}</span>
        : <span style={{ fontSize: 12, color: '#9ca3af' }}>Aucune</span>,
    },
  ];

  const toastBg = { success: '#059669', error: '#dc2626' };

  if (loading) return <div className="loading">Chargement…</div>;

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Étudiants débiteurs</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>{impayes.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Total impayé</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>{fmt(impayes.reduce((s, i) => s + i.solde, 0))}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>En retard &gt; 30 j</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#991b1b' }}>{impayes.filter(i => i.joursRetard > 30).length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Jamais relancés</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706' }}>{impayes.filter(i => i.nbRelances === 0).length}</div>
        </div>
      </div>

      {impayes.length === 0 ? (
        <div className="empty-state"><div className="es-ico">🎉</div><h3>Aucun impayé</h3><p>Tous les étudiants sont à jour de paiement.</p></div>
      ) : (
        <div className="table-wrap">
          <ResponsiveTable<Impaye>
            columns={columns}
            data={impayes}
            keyExtractor={imp => imp.etudiant!.id}
            actions={imp => (
              <>
                <button className="btn-ghost btn-sm" onClick={() => openRelance(imp)}>📣 Relancer</button>
                <button className="btn-ghost btn-sm" onClick={() => setDerogModal(imp)}>🔓 Dérogation</button>
                <button className="btn-ghost btn-sm" onClick={() => { setRelanceModal(imp); openHistorique(imp); }}>🧾</button>
              </>
            )}
          />
        </div>
      )}

      {/* ── Modal Relance ── */}
      {relanceModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setRelanceModal(null)}>
          <div className="modal" style={{ width: 560, padding: '1.5rem', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>📣 Relancer — {relanceModal.etudiant!.nom} {relanceModal.etudiant!.prenom}</h3>
              <button className="btn-ghost btn-sm" onClick={() => { setRelanceModal(null); setHistorique(null); }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: '1rem' }}>
              Solde dû : <strong style={{ color: '#dc2626' }}>{fmt(relanceModal.solde)}</strong>
              {relanceModal.joursRetard > 0 && ` · Retard : ${relanceModal.joursRetard} jour(s)`}
            </div>

            <form onSubmit={handleEnregistrerRelance} autoComplete="off">
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="rel-canal">Canal</label>
                <select id="rel-canal" name="canal" value={relanceCanal} onChange={e => setRelanceCanal(e.target.value as Relance['canal'])}
                  style={{ width: '100%', marginTop: 4 }}>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="appel">Appel téléphonique</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="rel-message">Message</label>
                <textarea id="rel-message" name="message" value={relanceMessage} onChange={e => setRelanceMessage(e.target.value)}
                  rows={6} style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {relanceCanal === 'email' && (
                <div style={{ marginBottom: '.85rem' }}>
                  {relanceEmail ? (
                    <button type="button" onClick={handleOuvrirMailto}
                      style={{ background: '#eef2ff', color: '#4338ca', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      ✉️ Ouvrir dans ma messagerie ({relanceEmail})
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: '#d97706' }}>⚠️ Aucun email connu pour cet étudiant/parent.</div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => { setRelanceModal(null); setHistorique(null); }}>Fermer</button>
                <button type="submit" className="btn-blue" disabled={savingRelance}>{savingRelance ? 'Enregistrement…' : "Marquer comme envoyée →"}</button>
              </div>
            </form>

            {historique && (
              <div style={{ marginTop: '1.3rem', paddingTop: '1rem', borderTop: '1px dashed #e5e7eb' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.6rem' }}>
                  Historique relances ({historique.relances.length})
                </div>
                {historique.relances.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: '1rem' }}>Aucune relance précédente.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '1rem' }}>
                    {historique.relances.map(r => (
                      <div key={r.id} style={{ fontSize: 11, padding: '.4rem .6rem', background: '#f9fafb', borderRadius: 6 }}>
                        <strong>{r.canal}</strong> · {fmt(r.montant_du)} · {new Date(r.envoye_le).toLocaleDateString('fr-FR')} · {r.envoye_par_nom}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.6rem' }}>
                  Dérogations ({historique.derogations.length})
                </div>
                {historique.derogations.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Aucune dérogation.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {historique.derogations.map(d => (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '.4rem .6rem', background: d.active ? '#f0fdf4' : '#f9fafb', borderRadius: 6 }}>
                        <span className={`badge ${d.active ? 'green' : 'gray'}`}>{d.active ? 'Active' : 'Révoquée'}</span>
                        <span style={{ flex: 1 }}>{TYPE_DEROGATION_LABEL[d.type_derogation]} · {d.motif} · {d.accordee_par_nom}{d.date_fin ? ` · jusqu'au ${new Date(d.date_fin).toLocaleDateString('fr-FR')}` : ''}</span>
                        {d.active && <button onClick={() => handleRevoquer(d.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '2px 6px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Révoquer</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal Dérogation ── */}
      {derogModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setDerogModal(null)}>
          <div className="modal" style={{ width: 480, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>🔓 Accorder une dérogation</h3>
              <button className="btn-ghost btn-sm" onClick={() => setDerogModal(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: '1rem' }}>{derogModal.etudiant!.nom} {derogModal.etudiant!.prenom} · Solde dû : {fmt(derogModal.solde)}</div>
            <form onSubmit={handleAccorderDerogation} autoComplete="off">
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="dg-type">Type de dérogation *</label>
                <select id="dg-type" name="type_derogation" value={derogType} onChange={e => setDerogType(e.target.value as Derogation['type_derogation'])}
                  style={{ width: '100%', marginTop: 4 }} required>
                  {(Object.keys(TYPE_DEROGATION_LABEL) as Derogation['type_derogation'][]).map(t => <option key={t} value={t}>{TYPE_DEROGATION_LABEL[t]}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="dg-motif">Motif *</label>
                <input id="dg-motif" name="motif" type="text" autoComplete="off" value={derogMotif} onChange={e => setDerogMotif(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }} placeholder="ex : bourse en cours de traitement" required />
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="dg-fin">Date de fin <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(optionnel, illimitée sinon)</span></label>
                <input id="dg-fin" name="date_fin" type="date" value={derogFin} onChange={e => setDerogFin(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setDerogModal(null)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={savingDerog}>{savingDerog ? 'Enregistrement…' : 'Accorder →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
