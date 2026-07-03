// src/modules/comptabilite/components/Pilotage.tsx
// Bloc 4 comptabilité — Pilotage financier

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { fmt } from '../../../services/comptabilite.service';
import {
  type StatsGlobales, type EntreeAudit, type Cloture,
  fetchStatsGlobales, fetchJournalPaiements, fetchAuditComptable, fetchClotures, cloturerPeriode,
} from '../../../services/pilotage.service';

interface Props { ecoleId: string }

const RUBRIQUE_COLOR: Record<string, string> = { scolarite: '#1e3a5f', inscription: '#7c3aed', examen: '#d97706', bibliotheque: '#0d9488', autre: '#6b7280' };
const ACTION_LABEL: Record<string, string> = { INSERT: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' };

function moisCourant() {
  const d = new Date();
  return { debut: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, fin: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) };
}

export default function Pilotage({ ecoleId }: Props) {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsGlobales | null>(null);
  const [audit, setAudit] = useState<EntreeAudit[]>([]);
  const [clotures, setClotures] = useState<Cloture[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [dateDebut, setDateDebut] = useState(moisCourant().debut);
  const [dateFin, setDateFin]     = useState(moisCourant().fin);
  const [exporting, setExporting] = useState(false);

  const [clotureModal, setClotureModal] = useState(false);
  const [clotureLibelle, setClotureLibelle] = useState('');
  const [clotureObs, setClotureObs] = useState('');
  const [savingCloture, setSavingCloture] = useState(false);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const [s, a, c] = await Promise.all([
        fetchStatsGlobales(ecoleId),
        fetchAuditComptable(ecoleId),
        fetchClotures(ecoleId),
      ]);
      setStats(s); setAudit(a); setClotures(c);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const rows = await fetchJournalPaiements(ecoleId, dateDebut, dateFin);
      if (rows.length === 0) { showToast('Aucun paiement sur cette période', 'error'); return; }
      const XLSX = await import('xlsx');
      const data = rows.map((r: any) => ({
        'N° Reçu':      r.numero_recu,
        'Date':         new Date(r.date_paiement).toLocaleDateString('fr-FR'),
        'Étudiant':     r.etudiants ? `${r.etudiants.nom} ${r.etudiants.prenom}` : '',
        'Matricule':    r.etudiants?.matricule ?? '',
        'Facture':      r.factures?.libelle ?? '',
        'Montant':      r.montant,
        'Mode':         r.mode_paiement,
        'Référence':    r.reference ?? '',
        'Caissier':     r.caissier_nom,
        'Statut':       r.statut,
        "Motif annulation": r.motif_annulation ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Journal paiements');
      XLSX.writeFile(wb, `journal-paiements_${dateDebut}_${dateFin}.xlsx`);
      showToast(`${rows.length} paiement(s) exporté(s) ✓`);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur export', 'error'); }
    finally { setExporting(false); }
  }

  async function handleCloturer(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !stats) return;
    setSavingCloture(true);
    try {
      await cloturerPeriode({
        ecoleId, periodeDebut: dateDebut, periodeFin: dateFin, libelle: clotureLibelle.trim(),
        totalAttendu: stats.totalAttendu, totalEncaisse: stats.totalEncaisse, observations: clotureObs,
        authUserId: user.id, clotureeParNom: `${user.nom}${user.prenom ? ' ' + user.prenom : ''}`,
      });
      setClotureModal(false); setClotureLibelle(''); setClotureObs('');
      await load();
      showToast('Période clôturée ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setSavingCloture(false); }
  }

  const toastBg = { success: '#059669', error: '#dc2626' };

  if (loading || !stats) return <div className="loading">Chargement…</div>;

  const maxMois = Math.max(...stats.evolutionMensuelle.map(m => m.montant), 1);
  const maxType = Math.max(...stats.parType.map(t => t.attendu), 1);

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* ── KPI ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: '1.75rem' }}>
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.1rem' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Total attendu</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#1e3a5f' }}>{fmt(stats.totalAttendu)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.1rem' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Total encaissé</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#059669' }}>{fmt(stats.totalEncaisse)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.1rem' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Total impayé</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#dc2626' }}>{fmt(stats.totalImpaye)}</div>
        </div>
        <div style={{ background: '#1e3a5f', borderRadius: 12, padding: '1.1rem', color: '#fff' }}>
          <div style={{ fontSize: 11, opacity: .8, marginBottom: 4 }}>Taux de recouvrement</div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{stats.tauxRecouvrement}%</div>
          <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,.25)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
            <div style={{ height: '100%', width: `${stats.tauxRecouvrement}%`, background: '#fff', borderRadius: 3 }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
        {/* ── Évolution mensuelle ── */}
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.2rem' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>📈 Encaissements — 6 derniers mois</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
            {stats.evolutionMensuelle.map(m => (
              <div key={m.mois} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>{m.montant > 0 ? Math.round(m.montant / 1000) + 'k' : ''}</div>
                <div style={{ width: '100%', height: Math.max((m.montant / maxMois) * 90, 2), background: '#1e3a5f', borderRadius: '4px 4px 0 0' }} />
                <div style={{ fontSize: 10, color: '#6b7280' }}>{m.mois}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Répartition par type ── */}
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.2rem' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>📂 Répartition par type de frais</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stats.parType.map(t => (
              <div key={t.type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: '#374151' }}>{t.label}</span>
                  <span style={{ color: '#6b7280' }}>{fmt(t.attendu)}</span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(t.attendu / maxType) * 100}%`, background: RUBRIQUE_COLOR[t.type] ?? '#6b7280', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Export + Clôture (même période) ── */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.2rem', marginBottom: '1.75rem' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', marginBottom: '.9rem' }}>📤 Rapports & Clôture de période</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <label htmlFor="pil-debut" style={{ fontSize: 10 }}>Du</label>
            <input id="pil-debut" name="date_debut" type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={{ marginTop: 3 }} />
          </div>
          <div>
            <label htmlFor="pil-fin" style={{ fontSize: 10 }}>Au</label>
            <input id="pil-fin" name="date_fin" type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} style={{ marginTop: 3 }} />
          </div>
          <button onClick={handleExport} disabled={exporting}
            style={{ background: '#f0fdf4', color: '#059669', border: '1px solid #bbf7d0', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {exporting ? 'Export…' : '📊 Exporter journal des paiements (Excel)'}
          </button>
          <button onClick={() => { setClotureLibelle(''); setClotureModal(true); }}
            style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            🔒 Clôturer cette période
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
          ℹ️ La clôture enregistre un instantané des totaux à titre de suivi — elle ne bloque pas techniquement la saisie ultérieure sur cette période.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* ── Audit ── */}
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.2rem' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', marginBottom: '.9rem' }}>🕵️ Journal d'audit (dernières actions)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
            {audit.length === 0 ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Aucune activité récente.</div> : audit.map(a => (
              <div key={a.id} style={{ fontSize: 11, padding: '.5rem .7rem', background: a.statut === 'WARNING' || a.statut === 'warning' ? '#fffbeb' : '#f9fafb', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600 }}>{ACTION_LABEL[a.action] ?? a.action}</span>
                  <span style={{ color: '#9ca3af' }}>{new Date(a.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ color: '#6b7280' }}>{a.details}</div>
                {a.user_email && <div style={{ color: '#9ca3af', marginTop: 2 }}>par {a.user_email}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Historique clôtures ── */}
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.2rem' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', marginBottom: '.9rem' }}>🔒 Clôtures précédentes</div>
          {clotures.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Aucune période clôturée pour l'instant.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clotures.map(c => (
                <div key={c.id} style={{ fontSize: 11, padding: '.5rem .7rem', background: '#f9fafb', borderRadius: 6 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{c.libelle}</div>
                  <div style={{ color: '#6b7280' }}>
                    Attendu {fmt(c.total_attendu)} · Encaissé {fmt(c.total_encaisse)} · Impayé {fmt(c.total_impaye)}
                  </div>
                  <div style={{ color: '#9ca3af', marginTop: 2 }}>Par {c.cloturee_par_nom} le {new Date(c.created_at).toLocaleDateString('fr-FR')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Clôture ── */}
      {clotureModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setClotureModal(false)}>
          <div className="modal" style={{ width: 460, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>🔒 Clôturer la période</h3>
              <button className="btn-ghost btn-sm" onClick={() => setClotureModal(false)}>✕</button>
            </div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: '1rem', padding: '.7rem .9rem', background: '#f9fafb', borderRadius: 8 }}>
              Du {new Date(dateDebut).toLocaleDateString('fr-FR')} au {new Date(dateFin).toLocaleDateString('fr-FR')}<br />
              Attendu : <strong>{fmt(stats.totalAttendu)}</strong> · Encaissé : <strong>{fmt(stats.totalEncaisse)}</strong> · Impayé : <strong>{fmt(stats.totalImpaye)}</strong>
            </div>
            <form onSubmit={handleCloturer} autoComplete="off">
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="clot-libelle">Libellé *</label>
                <input id="clot-libelle" name="libelle" type="text" autoComplete="off" value={clotureLibelle}
                  onChange={e => setClotureLibelle(e.target.value)} style={{ width: '100%', marginTop: 4 }} placeholder="ex : Juin 2026" required />
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="clot-obs">Observations</label>
                <input id="clot-obs" name="observations" type="text" autoComplete="off" value={clotureObs}
                  onChange={e => setClotureObs(e.target.value)} style={{ width: '100%', marginTop: 4 }} placeholder="Optionnel…" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setClotureModal(false)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={savingCloture}>{savingCloture ? 'Clôture…' : 'Clôturer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
