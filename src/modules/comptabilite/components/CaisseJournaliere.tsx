// src/modules/comptabilite/components/CaisseJournaliere.tsx
// Bloc 2 comptabilité (fin) — Ouverture / clôture de caisse

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
  type CaisseJour, type RecapCaisse,
  fetchCaisseDuJour, fetchRecapCaisseDuJour, ouvrirCaisse, fermerCaisse, fetchHistoriqueCaisses,
} from '../../../services/caisse.service';

interface Props { ecoleId: string }

const MODE_LABEL: Record<string, string> = { especes: 'Espèces', virement: 'Virement', mobile_money: 'Mobile Money', cheque: 'Chèque' };

function fmt(n: number) { return n.toLocaleString('fr-FR') + ' FCFA'; }

export default function CaisseJournaliere({ ecoleId }: Props) {
  const { user } = useAuth();
  const [caisse, setCaisse]     = useState<CaisseJour | null>(null);
  const [recap, setRecap]       = useState<RecapCaisse | null>(null);
  const [historique, setHistorique] = useState<CaisseJour[]>([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [fondInitial, setFondInitial] = useState('0');
  const [saving, setSaving] = useState(false);

  const [clotureOpen, setClotureOpen] = useState(false);
  const [totalCompte, setTotalCompte] = useState('');
  const [observations, setObservations] = useState('');

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    if (!ecoleId || !user) return;
    setLoading(true);
    try {
      const [c, h] = await Promise.all([
        fetchCaisseDuJour(ecoleId, user.id),
        fetchHistoriqueCaisses(ecoleId),
      ]);
      setCaisse(c);
      setHistorique(h);
      if (c && c.statut === 'ouverte') {
        setRecap(await fetchRecapCaisseDuJour(ecoleId, user.id));
      } else {
        setRecap(null);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur de chargement', 'error');
    } finally { setLoading(false); }
  }, [ecoleId, user]);

  useEffect(() => { load(); }, [load]);

  async function handleOuvrir(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await ouvrirCaisse(ecoleId, user.id, `${user.nom}${user.prenom ? ' ' + user.prenom : ''}`, parseFloat(fondInitial) || 0);
      await load();
      showToast('Caisse ouverte ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setSaving(false); }
  }

  function ecartPrevu(): number {
    if (!caisse || !recap) return 0;
    const compte = parseFloat(totalCompte) || 0;
    return compte - (caisse.fond_initial + recap.especes);
  }

  async function handleFermer(e: React.FormEvent) {
    e.preventDefault();
    if (!caisse || !recap) return;
    const ecart = ecartPrevu();
    if (Math.abs(ecart) > 0 && !confirm(
      `Écart détecté : ${ecart > 0 ? '+' : ''}${fmt(ecart)} par rapport au théorique.\nConfirmer la clôture malgré tout ?`
    )) return;
    setSaving(true);
    try {
      await fermerCaisse(caisse.id, parseFloat(totalCompte) || 0, recap.especes, caisse.fond_initial, observations);
      setClotureOpen(false); setTotalCompte(''); setObservations('');
      await load();
      showToast('Caisse clôturée ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setSaving(false); }
  }

  const toastBg = { success: '#059669', error: '#dc2626' };

  if (loading) return <div className="loading">Chargement…</div>;

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* ── Aucune caisse ouverte aujourd'hui ── */}
      {!caisse && (
        <div style={{ maxWidth: 420, margin: '2rem auto', background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 32, textAlign: 'center', marginBottom: '.5rem' }}>🗄️</div>
          <h3 style={{ textAlign: 'center', margin: '0 0 .3rem', fontSize: 15, color: '#111827' }}>Caisse fermée</h3>
          <p style={{ textAlign: 'center', fontSize: 12.5, color: '#6b7280', marginBottom: '1.4rem' }}>
            Ouvre la caisse pour commencer à enregistrer tes encaissements du jour.
          </p>
          <form onSubmit={handleOuvrir} autoComplete="off">
            <label htmlFor="caisse-fond">Fond de caisse initial (FCFA)</label>
            <input id="caisse-fond" name="fond_initial" type="number" min={0} value={fondInitial}
              onChange={e => setFondInitial(e.target.value)} style={{ width: '100%', marginTop: 4, marginBottom: '1.2rem' }} />
            <button type="submit" className="btn-blue" style={{ width: '100%' }} disabled={saving}>
              {saving ? 'Ouverture…' : '🔓 Ouvrir la caisse'}
            </button>
          </form>
        </div>
      )}

      {/* ── Caisse ouverte : récap du jour ── */}
      {caisse && caisse.statut === 'ouverte' && recap && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
            <div>
              <span className="badge green">🔓 Caisse ouverte</span>
              <span style={{ marginLeft: 10, fontSize: 12, color: '#6b7280' }}>
                Fond initial : <strong>{fmt(caisse.fond_initial)}</strong> · Depuis {new Date(caisse.ouverte_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <button className="btn-blue" onClick={() => setClotureOpen(true)}>🔒 Clôturer la caisse</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
            {(['especes', 'virement', 'mobile_money', 'cheque'] as const).map(mode => (
              <div key={mode} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{MODE_LABEL[mode]}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1e3a5f' }}>{fmt(recap[mode])}</div>
              </div>
            ))}
            <div style={{ background: '#1e3a5f', borderRadius: 12, padding: '1rem', color: '#fff' }}>
              <div style={{ fontSize: 11, opacity: .8, marginBottom: 2 }}>Total encaissé ({recap.nbPaiements})</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(recap.total)}</div>
            </div>
          </div>

          <div style={{ padding: '.9rem 1.1rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, fontSize: 12.5, color: '#0369a1' }}>
            💡 Espèces théoriques en caisse à la clôture = fond initial ({fmt(caisse.fond_initial)}) + encaissements espèces du jour ({fmt(recap.especes)}) = <strong>{fmt(caisse.fond_initial + recap.especes)}</strong>
          </div>
        </>
      )}

      {/* ── Caisse déjà clôturée aujourd'hui ── */}
      {caisse && caisse.statut === 'fermee' && (
        <div style={{ maxWidth: 460, margin: '2rem auto', background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '1.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: '.5rem' }}>✅</div>
          <h3 style={{ margin: '0 0 .5rem', fontSize: 15 }}>Caisse déjà clôturée aujourd'hui</h3>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Compté : <strong>{fmt(caisse.total_compte ?? 0)}</strong></div>
          <div style={{ fontSize: 13, color: (caisse.ecart ?? 0) === 0 ? '#059669' : '#dc2626' }}>
            Écart : <strong>{(caisse.ecart ?? 0) > 0 ? '+' : ''}{fmt(caisse.ecart ?? 0)}</strong>
          </div>
          {caisse.observations && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8, fontStyle: 'italic' }}>{caisse.observations}</div>}
        </div>
      )}

      {/* ── Historique récent ── */}
      {historique.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.6rem' }}>Historique récent</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {historique.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.55rem .85rem', background: '#f9fafb', borderRadius: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 600, minWidth: 90 }}>{new Date(h.date_jour).toLocaleDateString('fr-FR')}</span>
                <span style={{ color: '#6b7280', flex: 1 }}>{h.caissier_nom}</span>
                <span className={`badge ${h.statut === 'ouverte' ? 'green' : 'gray'}`}>{h.statut === 'ouverte' ? 'Ouverte' : 'Fermée'}</span>
                {h.statut === 'fermee' && (
                  <span style={{ color: (h.ecart ?? 0) === 0 ? '#059669' : '#dc2626', fontWeight: 600, minWidth: 100, textAlign: 'right' }}>
                    Écart : {(h.ecart ?? 0) > 0 ? '+' : ''}{fmt(h.ecart ?? 0)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal Clôture ── */}
      {clotureOpen && caisse && recap && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setClotureOpen(false)}>
          <div className="modal" style={{ width: 460, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>🔒 Clôturer la caisse</h3>
              <button className="btn-ghost btn-sm" onClick={() => setClotureOpen(false)}>✕</button>
            </div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: '1rem', padding: '.7rem .9rem', background: '#f9fafb', borderRadius: 8 }}>
              Théorique espèces : <strong>{fmt(caisse.fond_initial + recap.especes)}</strong>
              <br />(fond initial {fmt(caisse.fond_initial)} + encaissements espèces {fmt(recap.especes)})
            </div>
            <form onSubmit={handleFermer} autoComplete="off">
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="cloture-compte">Montant compté en caisse (FCFA) *</label>
                <input id="cloture-compte" name="total_compte" type="number" min={0} value={totalCompte}
                  onChange={e => setTotalCompte(e.target.value)} style={{ width: '100%', marginTop: 4 }} required autoFocus />
              </div>
              {totalCompte && (
                <div style={{
                  padding: '.6rem .85rem', borderRadius: 8, marginBottom: '.85rem', fontSize: 13, fontWeight: 600,
                  background: ecartPrevu() === 0 ? '#f0fdf4' : '#fef2f2', color: ecartPrevu() === 0 ? '#059669' : '#dc2626',
                }}>
                  Écart : {ecartPrevu() > 0 ? '+' : ''}{fmt(ecartPrevu())}
                </div>
              )}
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="cloture-obs">Observations {ecartPrevu() !== 0 && <span style={{ color: '#dc2626' }}>(recommandé si écart)</span>}</label>
                <input id="cloture-obs" name="observations" type="text" autoComplete="off" value={observations}
                  onChange={e => setObservations(e.target.value)} style={{ width: '100%', marginTop: 4 }} placeholder="Explication de l'écart, incident…" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setClotureOpen(false)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>{saving ? 'Clôture…' : 'Clôturer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
