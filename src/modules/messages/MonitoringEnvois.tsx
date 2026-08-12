// src/modules/messages/MonitoringEnvois.tsx
// Sprint B17 — Monitoring des envois de notifications externes (email / SMS / push)
// Section du tableau de bord du module Messages, basée sur journal_notifications.
// Décision du 11/08/2026 : monitoring applicatif via cette table (pas de Sentry
// sur les Edge Functions). Un envoi est compté en échec dès que statut ≠ 'envoye'.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';

interface LigneJournal {
  id: string;
  canal: string | null;
  type: string | null;
  statut: string | null;
  erreur: string | null;
  destinataire_nom: string | null;
  envoye_le: string;
}

const CANAUX = ['email', 'sms', 'push'] as const;

const CANAL_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  email: { bg: '#dbeafe', color: '#1d4ed8', label: 'Email' },
  sms:   { bg: '#ccfbf1', color: '#0f766e', label: 'SMS' },
  push:  { bg: '#ede9fe', color: '#7c3aed', label: 'Push' },
};

// Motifs d'échec journalisés par les Edge Functions (send-notification-email,
// send-notification-sms-push) — tout le reste est regroupé en erreur technique.
const MOTIF_LABELS: Record<string, string> = {
  no_email:           'Email famille manquant',
  no_phone:           'Téléphone parent manquant',
  no_token:           'Aucun abonnement push',
  opt_out:            'Désactivé par la famille (préférences)',
  aucun_modele_actif: 'Aucun modèle de notification actif',
  inconnu:            'Motif non renseigné',
  erreur_technique:   'Erreur technique (provider)',
};

export default function MonitoringEnvois({ ecoleId }: { ecoleId: string }) {
  const [periodeJours, setPeriodeJours] = useState<7 | 30>(7);
  const [lignes, setLignes] = useState<LigneJournal[]>([]);
  const [loading, setLoading] = useState(false);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    setErreurChargement(null);
    try {
      const depuis = new Date();
      depuis.setDate(depuis.getDate() - periodeJours);
      const { data, error } = await supabase
        .from('journal_notifications')
        .select('id,canal,type,statut,erreur,destinataire_nom,envoye_le')
        .eq('ecole_id', ecoleId)
        .gte('envoye_le', depuis.toISOString())
        .order('envoye_le', { ascending: false })
        .limit(1000);
      if (error) throw error;
      setLignes((data ?? []) as LigneJournal[]);
    } catch (err: any) {
      setErreurChargement(err.message ?? 'Erreur de chargement');
    } finally { setLoading(false); }
  }, [ecoleId, periodeJours]);

  useEffect(() => { load(); }, [load]);

  // ── Agrégats par canal ─────────────────────────────────────────────────────
  const parCanal = CANAUX.map(c => {
    const rows    = lignes.filter(l => l.canal === c);
    const echecs  = rows.filter(l => l.statut !== 'envoye').length;
    const total   = rows.length;
    const taux    = total > 0 ? Math.round((echecs / total) * 100) : 0;
    return { canal: c, total, envoyes: total - echecs, echecs, taux };
  });
  const totalLignes = lignes.length;
  const totalEchecs = parCanal.reduce((s, c) => s + c.echecs, 0);

  // ── Répartition des motifs d'échec ─────────────────────────────────────────
  const motifs = new Map<string, number>();
  lignes.filter(l => l.statut !== 'envoye').forEach(l => {
    const brut = (l.erreur ?? '').trim();
    const cle = brut === '' ? 'inconnu' : (MOTIF_LABELS[brut] ? brut : 'erreur_technique');
    motifs.set(cle, (motifs.get(cle) ?? 0) + 1);
  });
  const motifsTries = Array.from(motifs.entries()).sort((a, b) => b[1] - a[1]);

  const derniersEchecs = lignes.filter(l => l.statut !== 'envoye').slice(0, 10);

  function formatDateCourt(iso: string) {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function couleurTaux(taux: number, total: number): string {
    if (total === 0) return '#9ca3af';
    if (taux === 0) return '#059669';
    if (taux < 10) return '#d97706';
    return '#dc2626';
  }

  return (
    <div style={{ marginTop: '1.75rem' }}>
      {/* ── En-tête de section + sélecteur de période ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f' }}>📡 Monitoring des envois</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
            Santé des notifications externes (email, SMS, push) — journal des envois de l'établissement
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([7, 30] as const).map(j => (
            <button key={j} type="button" onClick={() => setPeriodeJours(j)}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: periodeJours === j ? '#1e3a5f' : '#fff', color: periodeJours === j ? '#fff' : '#6b7280', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {j} jours
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Chargement…</div>
      ) : erreurChargement ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '.8rem 1rem', fontSize: 12.5, color: '#991b1b' }}>
          Impossible de charger le journal des notifications : {erreurChargement}
        </div>
      ) : totalLignes === 0 ? (
        <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12, padding: '1.1rem', fontSize: 12.5, color: '#9ca3af' }}>
          Aucune notification externe envoyée sur les {periodeJours} derniers jours.
        </div>
      ) : (
        <>
          {/* ── Taux d'échec par canal ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            {parCanal.map(({ canal, total, envoyes, echecs, taux }) => {
              const st = CANAL_STYLE[canal];
              return (
                <div key={canal} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color }}>{st.label}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>taux d'échec</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: couleurTaux(taux, total) }}>
                    {total === 0 ? '—' : `${taux}%`}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                    {total === 0 ? 'Aucun envoi sur la période' : `${envoyes} envoyé(s) · ${echecs} échec(s)`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Répartition des motifs d'échec ── */}
          {totalEchecs === 0 ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '.8rem 1rem', fontSize: 12.5, color: '#059669', fontWeight: 600, marginBottom: 12 }}>
              ✓ Aucun échec d'envoi sur les {periodeJours} derniers jours ({totalLignes} notification(s) délivrée(s)).
            </div>
          ) : (
            <>
              <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.1rem', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Motifs d'échec ({totalEchecs})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {motifsTries.map(([cle, nb]) => (
                    <span key={cle} style={{ fontSize: 11, fontWeight: 600, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 4, padding: '3px 8px' }}>
                      {MOTIF_LABELS[cle] ?? cle} : {nb}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
                  Données manquantes (email/téléphone/abonnement) et désactivations famille sont des échecs « attendus » ;
                  les erreurs techniques provider méritent une investigation.
                </div>
              </div>

              {/* ── Derniers échecs ── */}
              <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.1rem' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  Derniers échecs{derniersEchecs.length === 10 ? ' (10 plus récents)' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {derniersEchecs.map(l => {
                    const st = CANAL_STYLE[l.canal ?? ''] ?? { bg: '#f3f4f6', color: '#6b7280', label: l.canal ?? '?' };
                    return (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: '#f8fafc', borderRadius: 8, padding: '6px 10px' }}>
                        <span style={{ color: '#374151', fontWeight: 600, flexShrink: 0 }}>{formatDateCourt(l.envoye_le)}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                        {l.type && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eef2ff', color: '#4338ca', flexShrink: 0, textTransform: 'uppercase' }}>{l.type}</span>}
                        <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{l.destinataire_nom ?? '—'}</span>
                        <span style={{ color: '#991b1b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220, flexShrink: 0 }} title={l.erreur ?? ''}>
                          {l.erreur ?? 'motif non renseigné'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {totalLignes === 1000 && (
            <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 8 }}>
              ⚠ Période tronquée aux 1000 envois les plus récents — les taux sont calculés sur cet échantillon.
            </div>
          )}
        </>
      )}
    </div>
  );
}
