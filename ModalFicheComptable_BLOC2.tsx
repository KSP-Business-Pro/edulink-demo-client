// src/modules/comptabilite/components/ModalFicheComptable.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import type { Facture, ModePaiement, Paiement } from '../../../services/comptabilite.service';
import {
  fetchFacturesEtudiant, enregistrerPaiement, supprimerFacture, fmt, RUBRIQUE_LABELS,
  fetchPaiementsFacture, annulerPaiement,
} from '../../../services/comptabilite.service';

interface Props {
  etudiantId: string;
  nom: string;
  onClose: () => void;
  onRefresh: () => void;
}

const STATUT_COLOR: Record<string, string> = { paye: 'green', partiel: 'amber', en_attente: 'red', annule: 'gray' };
const MODES: { value: ModePaiement; label: string }[] = [
  { value: 'especes', label: 'Espèces' },
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'cheque', label: 'Chèque' },
];

export default function ModalFicheComptable({ etudiantId, nom, onClose, onRefresh }: Props) {
  const { user } = useAuth();
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading]   = useState(true);
  const [paiementModal, setPaiementModal] = useState<{ factureId: string; restant: number } | null>(null);
  const [paiementMontant, setPaiementMontant] = useState('');
  const [paiementMode, setPaiementMode]       = useState<ModePaiement>('especes');
  const [paiementReference, setPaiementReference] = useState('');
  const [paiementObservation, setPaiementObservation] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [dernierRecu, setDernierRecu] = useState<string | null>(null);

  // Historique paiements par facture (chargé à la demande)
  const [historiqueOuvert, setHistoriqueOuvert] = useState<string | null>(null);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  async function reload() {
    setLoading(true);
    try { setFactures(await fetchFacturesEtudiant(etudiantId)); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line

  const totalAttendu  = factures.reduce((s, f) => s + (f.montant_total || f.montant || 0), 0);
  const totalEncaisse = factures.reduce((s, f) => s + (f.montant_paye || 0), 0);
  const totalRestant  = totalAttendu - totalEncaisse;

  async function handlePaiement(e: React.FormEvent) {
    e.preventDefault();
    if (!paiementModal || !user) return;
    setSaving(true); setError(null);
    try {
      const { numeroRecu } = await enregistrerPaiement(
        paiementModal.factureId, parseFloat(paiementMontant), paiementMode,
        {
          reference: paiementReference, observation: paiementObservation,
          authUserId: user.id, caissierNom: `${user.nom}${user.prenom ? ' ' + user.prenom : ''}`,
        }
      );
      setPaiementModal(null);
      setPaiementReference(''); setPaiementObservation('');
      setDernierRecu(numeroRecu);
      await reload();
      onRefresh();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function toggleHistorique(factureId: string) {
    if (historiqueOuvert === factureId) { setHistoriqueOuvert(null); return; }
    setHistoriqueOuvert(factureId);
    setLoadingHist(true);
    try { setPaiements(await fetchPaiementsFacture(factureId)); }
    finally { setLoadingHist(false); }
  }

  async function handleAnnulerPaiement(p: Paiement) {
    if (!user) return;
    const motif = prompt(`Motif d'annulation du paiement ${p.numero_recu} (${fmt(p.montant)}) :`);
    if (!motif || !motif.trim()) return;
    try {
      await annulerPaiement(p.id, motif, user.id);
      if (historiqueOuvert) setPaiements(await fetchPaiementsFacture(historiqueOuvert));
      await reload(); onRefresh();
    } catch (err: any) { alert('Erreur : ' + err.message); }
  }

  async function handleSupprimer(factureId: string) {
    if (!confirm('Supprimer cette facture ?')) return;
    try { await supprimerFacture(factureId); await reload(); onRefresh(); }
    catch (err: any) { alert('Erreur : ' + err.message); }
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 620, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Fiche comptable — {nom}</h3>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {dernierRecu && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: 10, marginBottom: '1rem', fontSize: 13, border: '1px solid #bbf7d0' }}>
            <span>✅ Paiement enregistré — reçu <strong style={{ fontFamily: 'monospace' }}>{dernierRecu}</strong></span>
            <button onClick={() => setDernierRecu(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 14 }}>✕</button>
          </div>
        )}

        {/* Résumé financier */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem', marginBottom: '1.2rem' }}>
          {[
            { label: 'Encaissé', val: totalEncaisse, color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
            { label: 'Reste dû', val: totalRestant, color: totalRestant > 0 ? '#dc2626' : '#059669', bg: totalRestant > 0 ? '#fef2f2' : '#f0fdf4', border: totalRestant > 0 ? '#fecaca' : '#bbf7d0' },
            { label: 'Total attendu', val: totalAttendu, color: '#1e3a5f', bg: '#f8fafc', border: '#e2e8f0' },
          ].map(({ label, val, color, bg, border }) => (
            <div key={label} style={{ background: bg, borderRadius: 10, padding: '.85rem', textAlign: 'center', border: `1px solid ${border}` }}>
              <div style={{ fontSize: 18, fontWeight: 800, color }}>{fmt(val)}</div>
              <div style={{ fontSize: 10.5, color, opacity: .8 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Factures */}
        {loading ? <div className="loading">Chargement…</div> : (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>
              Historique des factures ({factures.length})
            </div>
            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {factures.map(f => {
                const montantF  = f.montant_total || f.montant || 0;
                const restantF  = montantF - (f.montant_paye || 0);
                return (
                  <div key={f.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '.85rem 1rem', marginBottom: '.5rem', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.4rem' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{f.libelle || RUBRIQUE_LABELS[f.type_frais] || 'Facture'}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{f.reference ?? '—'} · {f.annee_scolaire ?? '—'}</div>
                      </div>
                      <span className={`badge ${STATUT_COLOR[f.statut] ?? 'gray'}`}>{f.statut}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '.5rem', marginTop: '.5rem' }}>
                      {[
                        { label: 'Montant', val: fmt(montantF), color: '#374151' },
                        { label: 'Payé',    val: fmt(f.montant_paye || 0), color: '#059669' },
                        { label: 'Reste',   val: fmt(restantF), color: restantF > 0 ? '#dc2626' : '#059669' },
                        { label: 'Échéance', val: f.date_echeance ? new Date(f.date_echeance).toLocaleDateString('fr-FR') : '—', color: '#374151' },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ background: '#f9fafb', borderRadius: 6, padding: '.4rem .6rem' }}>
                          <div style={{ fontSize: 9.5, color: '#9ca3af' }}>{label}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {f.mode_paiement && <div style={{ marginTop: '.4rem', fontSize: 11, color: '#6b7280' }}>Mode : {f.mode_paiement}</div>}
                    <div style={{ marginTop: '.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '.6rem', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleSupprimer(f.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                          🗑 Supprimer
                        </button>
                        <button onClick={() => toggleHistorique(f.id)} style={{ background: 'none', border: '1px solid #e2e8f0', color: '#374151', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                          🧾 {historiqueOuvert === f.id ? 'Masquer' : 'Historique'}
                        </button>
                      </div>
                      {restantF > 0 ? (
                        <button onClick={() => { setPaiementModal({ factureId: f.id, restant: restantF }); setPaiementMontant(String(Math.round(restantF))); }}
                          style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '5px 14px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          + Enregistrer un paiement
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Soldée</span>
                      )}
                    </div>

                    {/* Historique des paiements de cette facture */}
                    {historiqueOuvert === f.id && (
                      <div style={{ marginTop: '.6rem', paddingTop: '.6rem', borderTop: '1px dashed #e5e7eb' }}>
                        {loadingHist ? (
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>Chargement…</div>
                        ) : paiements.length === 0 ? (
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>Aucun paiement enregistré pour cette facture.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {paiements.map(p => (
                              <div key={p.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '.4rem .6rem',
                                background: p.statut === 'annule' ? '#fef2f2' : '#f9fafb', borderRadius: 6,
                                border: `1px solid ${p.statut === 'annule' ? '#fecaca' : '#f3f4f6'}`,
                                opacity: p.statut === 'annule' ? 0.7 : 1,
                              }}>
                                <code style={{ fontSize: 10, background: '#fff', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>{p.numero_recu}</code>
                                <div style={{ flex: 1, fontSize: 11, color: '#374151', minWidth: 0 }}>
                                  <strong style={{ color: p.statut === 'annule' ? '#dc2626' : '#111827' }}>{fmt(p.montant)}</strong>
                                  {' · '}{p.mode_paiement}
                                  {p.reference && ` · réf. ${p.reference}`}
                                  {' · '}{new Date(p.date_paiement).toLocaleDateString('fr-FR')}
                                  {p.caissier_nom && ` · ${p.caissier_nom}`}
                                  {p.statut === 'annule' && <span style={{ color: '#dc2626' }}> · ANNULÉ ({p.motif_annulation})</span>}
                                </div>
                                {p.statut === 'valide' && (
                                  <button onClick={() => handleAnnulerPaiement(p)} title="Annuler ce paiement"
                                    style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '2px 6px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                                    Annuler
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal paiement */}
      {paiementModal && (
        <div className="modal-overlay open" style={{ zIndex: 110 }} onClick={e => e.target === e.currentTarget && setPaiementModal(null)}>
          <div className="modal" style={{ width: 420, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Enregistrer un paiement</h3>
              <button className="btn-ghost btn-sm" onClick={() => setPaiementModal(null)}>✕</button>
            </div>
            <form onSubmit={handlePaiement} autoComplete="off">
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="pmt-montant">Montant payé (FCFA) *</label>
                <input id="pmt-montant" name="montant" type="number" value={paiementMontant} onChange={e => setPaiementMontant(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }} min={1} step="any" required autoFocus />
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="pmt-mode">Mode de paiement *</label>
                <select id="pmt-mode" name="mode_paiement" value={paiementMode} onChange={e => setPaiementMode(e.target.value as ModePaiement)}
                  style={{ width: '100%', marginTop: 4 }} required>
                  {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {(paiementMode === 'virement' || paiementMode === 'mobile_money') && (
                <div style={{ marginBottom: '.85rem' }}>
                  <label htmlFor="pmt-reference">Référence de transaction *</label>
                  <input id="pmt-reference" name="reference" type="text" autoComplete="off" value={paiementReference}
                    onChange={e => setPaiementReference(e.target.value)}
                    style={{ width: '100%', marginTop: 4 }} placeholder="ex : TXN-2026-004821" required />
                </div>
              )}
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="pmt-observation">Observation <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(optionnel)</span></label>
                <input id="pmt-observation" name="observation" type="text" autoComplete="off" value={paiementObservation}
                  onChange={e => setPaiementObservation(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }} placeholder="Note interne…" />
              </div>
              {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setPaiementModal(null)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
