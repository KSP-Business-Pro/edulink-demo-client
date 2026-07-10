// src/modules/comptabilite/components/ModalFicheComptable.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import type { Facture, ModePaiement } from '../../../services/comptabilite.service';
import { fetchFacturesEtudiant, enregistrerPaiement, supprimerFacture, fmt, RUBRIQUE_LABELS } from '../../../services/comptabilite.service';
import { addToast } from '../../../hooks/useErrorHandler';
import { fetchDonneesRecu } from '../../../services/comptabilite.service';
import { ReceiptModal } from './ReceiptPDF';
import { fetchPaiementsFacture, type Paiement } from '../../../services/comptabilite.service';

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
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<Awaited<ReturnType<typeof fetchDonneesRecu>> | null>(null);
  const [expandedFactureId, setExpandedFactureId] = useState<string | null>(null);
  const [paiementsCache, setPaiementsCache] = useState<Record<string, Paiement[]>>({});
  const [loadingPaiements, setLoadingPaiements] = useState(false);

  async function reload() {
    setLoading(true);
    try { setFactures(await fetchFacturesEtudiant(etudiantId)); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line

  const totalAttendu  = factures.reduce((s, f) => s + (f.montant_total || f.montant || 0), 0);
  const totalEncaisse = factures.reduce((s, f) => s + (f.montant_paye || 0), 0);
  const totalRestant  = totalAttendu - totalEncaisse;

  async function togglePaiements(factureId: string) {
    if (expandedFactureId === factureId) { setExpandedFactureId(null); return; }
    setExpandedFactureId(factureId);
    if (!paiementsCache[factureId]) {
      setLoadingPaiements(true);
      try {
        const data = await fetchPaiementsFacture(factureId);
        setPaiementsCache(prev => ({ ...prev, [factureId]: data }));
      } catch (e: any) { addToast("Erreur : " + e.message, "error"); }
      finally { setLoadingPaiements(false); }
    }
  }

  async function handleVoirRecu(paiementId: string) {
    try {
      const donnees = await fetchDonneesRecu(paiementId);
      setReceiptData(donnees);
    } catch (e: any) { addToast("Erreur : " + e.message, "error"); }
  }

  async function handlePaiement(e: React.FormEvent) {
    e.preventDefault();
    if (!paiementModal) return;
    setSaving(true); setError(null);
    try {
      const { numeroRecu, paiementId } = await enregistrerPaiement(paiementModal.factureId, parseFloat(paiementMontant), paiementMode, { authUserId: user!.id, caissierNom: user?.prenom ? `${user.prenom} ${user.nom}` : user!.nom });
      setPaiementModal(null);
      await reload();
      onRefresh();
      try {
        const donnees = await fetchDonneesRecu(paiementId);
        setReceiptData(donnees);
      } catch (e) { addToast("Paiement enregistré, mais le reçu n'a pas pu être chargé.", "error"); }
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleSupprimer(factureId: string) {
    if (!confirm('Supprimer cette facture ?')) return;
    try { await supprimerFacture(factureId); await reload(); onRefresh(); }
    catch (err: any) { addToast('Erreur : ' + err.message, 'error'); }
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 620, padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Fiche comptable — {nom}</h3>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Fermer la fenêtre">✕</button>
        </div>

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
                      <button onClick={() => handleSupprimer(f.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                        🗑 Supprimer
                      </button>
                      <button onClick={() => togglePaiements(f.id)} style={{ background: "none", border: "1px solid #e5e7eb", color: "#374151", padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginLeft: 6 }}>
                        {expandedFactureId === f.id ? "Masquer" : "Paiements"}
                      </button>
                      {restantF > 0 ? (
                        <button onClick={() => { setPaiementModal({ factureId: f.id, restant: restantF }); setPaiementMontant(String(Math.round(restantF))); }}
                          style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '5px 14px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          + Enregistrer un paiement
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Soldée</span>
                      )}
                    </div>
                    {expandedFactureId === f.id && (
                      <div style={{ marginTop: ".6rem", paddingTop: ".6rem", borderTop: "1px dashed #e5e7eb" }}>
                        {loadingPaiements ? (
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>Chargement…</div>
                        ) : (paiementsCache[f.id] ?? []).length === 0 ? (
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>Aucun paiement enregistre</div>
                        ) : (
                          (paiementsCache[f.id] ?? []).map(p => (
                            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".4rem 0", borderBottom: "1px solid #f9fafb", fontSize: 11 }}>
                              <div>
                                <span style={{ fontFamily: "monospace", color: "#0369a1" }}>{p.numero_recu}</span>
                                <span style={{ color: "#9ca3af", marginLeft: 8 }}>{new Date(p.date_paiement).toLocaleDateString("fr-FR")} - {fmt(p.montant)}</span>
                              </div>
                              <button onClick={() => handleVoirRecu(p.id)} style={{ background: "none", border: "1px solid #ede9fe", color: "#7c3aed", padding: "2px 8px", borderRadius: 5, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}>Recu</button>
                            </div>
                          ))
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
              <button className="btn-ghost btn-sm" onClick={() => setPaiementModal(null)} aria-label="Fermer la fenêtre">✕</button>
            </div>
            <form onSubmit={handlePaiement}>
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="paie-montant">Montant payé (FCFA) *</label>
                <input type="number" id="paie-montant" name="montant" value={paiementMontant} onChange={e => setPaiementMontant(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }} min={1} step="any" required autoFocus aria-describedby={error ? 'paie-error' : undefined} />
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="paie-mode">Mode de paiement *</label>
                <select id="paie-mode" name="mode" value={paiementMode} onChange={e => setPaiementMode(e.target.value as ModePaiement)}
                  style={{ width: '100%', marginTop: 4 }} required>
                  {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {error && <div id="paie-error" role="alert" style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setPaiementModal(null)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal reçu de paiement */}
      {receiptData && (
        <ReceiptModal data={receiptData} onClose={() => setReceiptData(null)} />
      )}
    </div>
  );
}
