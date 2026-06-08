// src/modules/monitoring/index.tsx
// Dashboard monitoring production — super-admin uniquement
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

interface MetriqueEcole {
  id: string; nom: string;
  nbEtudiants: number; nbSemestresActifs: number;
  nbFacturesImpayees: number; montantImpaye: number;
  nbReleves: number; nbExclusions: number;
  nbProspects: number;
  dernierCalcul: string | null;
}

interface AlerteItem {
  type: 'warning' | 'error' | 'info';
  ecole: string;
  message: string;
  valeur?: string;
}

interface StatGlobal {
  totalEcoles: number;
  totalEtudiants: number;
  totalSemestresActifs: number;
  totalFacturesImpayees: number;
  totalMontantImpaye: number;
  totalReleves: number;
  totalProspects: number;
}

const SEUILS = {
  impaye_critique: 500000,   // 500k FCFA
  impaye_warning:  100000,   // 100k FCFA
  exclusions_warning: 3,
};

export default function MonitoringPage() {
  const { isSuperAdmin } = useAuth();
  const [ecoles, setEcoles]   = useState<MetriqueEcole[]>([]);
  const [stats, setStats]     = useState<StatGlobal | null>(null);
  const [alertes, setAlertes] = useState<AlerteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Charger toutes les écoles
      const { data: ecolesData } = await supabase.from('ecoles').select('id,nom').order('nom');
      if (!ecolesData?.length) { setLoading(false); return; }

      const metriques: MetriqueEcole[] = [];
      const alertesList: AlerteItem[] = [];

      for (const ecole of ecolesData) {
        const [
          { count: nbEtu },
          { count: nbSem },
          { data: factures },
          { count: nbRel },
          { data: exclusions },
          { count: nbProsp },
          { data: dernierCalc },
        ] = await Promise.all([
          supabase.from('etudiants').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('statut', 'actif'),
          supabase.from('semestres').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('statut', 'en_cours'),
          supabase.from('factures').select('montant_total,montant,montant_paye').eq('ecole_id', ecole.id).in('statut', ['en_attente', 'partiel']),
          supabase.from('releves_notes').select('id', { count: 'exact', head: true }).eq('semestre_id',
            // Sous-requête simplifiée — compter tous les relevés de l'école via inscriptions
            // On utilise une approche directe
            '00000000-0000-0000-0000-000000000000' // placeholder, on recalcule ci-dessous
          ),
          supabase.from('resultats_cache').select('etudiant_id').eq('ecole_id', ecole.id).eq('decision', 'ajourné').limit(20),
          supabase.from('prospects_diagnostic').select('id', { count: 'exact', head: true }),
          supabase.from('resultats_cache').select('created_at').eq('ecole_id', ecole.id).order('created_at', { ascending: false }).limit(1),
        ]);

        // Recalcul relevés via inscriptions
        const { count: nbReleves } = await supabase
          .from('releves_notes')
          .select('id', { count: 'exact', head: true })
          .in('semestre_id',
            (await supabase.from('semestres').select('id').eq('ecole_id', ecole.id).limit(100)).data?.map(s => s.id) ?? []
          );

        const montantImpaye = (factures ?? []).reduce((s, f) => {
          const total = f.montant_total || f.montant || 0;
          return s + Math.max(total - (f.montant_paye || 0), 0);
        }, 0);

        const m: MetriqueEcole = {
          id:               ecole.id,
          nom:              ecole.nom,
          nbEtudiants:      nbEtu ?? 0,
          nbSemestresActifs: nbSem ?? 0,
          nbFacturesImpayees: (factures ?? []).length,
          montantImpaye,
          nbReleves:        nbReleves ?? 0,
          nbExclusions:     (exclusions ?? []).length,
          nbProspects:      nbProsp ?? 0,
          dernierCalcul:    dernierCalc?.[0]?.created_at ?? null,
        };
        metriques.push(m);

        // Générer alertes
        if (montantImpaye >= SEUILS.impaye_critique) {
          alertesList.push({ type: 'error', ecole: ecole.nom, message: 'Impayés critiques', valeur: `${Math.round(montantImpaye).toLocaleString('fr-FR')} FCFA` });
        } else if (montantImpaye >= SEUILS.impaye_warning) {
          alertesList.push({ type: 'warning', ecole: ecole.nom, message: 'Impayés élevés', valeur: `${Math.round(montantImpaye).toLocaleString('fr-FR')} FCFA` });
        }
        if ((exclusions ?? []).length >= SEUILS.exclusions_warning) {
          alertesList.push({ type: 'warning', ecole: ecole.nom, message: 'Exclusions en cours', valeur: `${(exclusions ?? []).length} exclusion(s)` });
        }
        if (nbSem === 0) {
          alertesList.push({ type: 'info', ecole: ecole.nom, message: 'Aucun semestre en cours' });
        }
      }

      setEcoles(metriques);
      setAlertes(alertesList);
      setStats({
        totalEcoles:          ecolesData.length,
        totalEtudiants:       metriques.reduce((s, m) => s + m.nbEtudiants, 0),
        totalSemestresActifs: metriques.reduce((s, m) => s + m.nbSemestresActifs, 0),
        totalFacturesImpayees: metriques.reduce((s, m) => s + m.nbFacturesImpayees, 0),
        totalMontantImpaye:   metriques.reduce((s, m) => s + m.montantImpaye, 0),
        totalReleves:         metriques.reduce((s, m) => s + m.nbReleves, 0),
        totalProspects:       metriques.reduce((s, m) => s + m.nbProspects, 0),
      });
      setLastRefresh(new Date());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh toutes les 5 minutes
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  if (!isSuperAdmin) {
    return (
      <div className="empty-state">
        <div className="es-ico">🔒</div>
        <h3>Accès restreint</h3>
        <p>Ce module est réservé au super-administrateur</p>
      </div>
    );
  }

  const alertColor: Record<string, string> = { error: '#dc2626', warning: '#d97706', info: '#1d4ed8' };
  const alertBg:    Record<string, string> = { error: '#fee2e2', warning: '#fef3c7', info: '#dbeafe' };
  const alertIcon:  Record<string, string> = { error: '🔴', warning: '🟡', info: '🔵' };

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {/* En-tête */}
      <div className="top">
        <div>
          <h2>Monitoring</h2>
          <div className="page-subtitle">
            Santé production — réseau EduLink Sup
            {lastRefresh && <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>· Actualisé à {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        </div>
        <div className="top-actions">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ width: 14, height: 14, margin: 0 }} />
            Auto-refresh 5 min
          </label>
          <button onClick={load} disabled={loading}
            style={{ background: '#f3f4f6', color: '#374151', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {loading ? '⏳ Chargement…' : '🔄 Actualiser'}
          </button>
        </div>
      </div>

      {loading && !stats && <div className="loading">Chargement des métriques production…</div>}

      {stats && (
        <>
          {/* KPI réseau global */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1.5rem' }}>
            {[
              { ico: '🏫', val: stats.totalEcoles,          lbl: 'Écoles actives',        color: '#1e3a5f' },
              { ico: '🎓', val: stats.totalEtudiants,       lbl: 'Étudiants actifs',       color: '#059669' },
              { ico: '📅', val: stats.totalSemestresActifs, lbl: 'Semestres en cours',     color: '#7c3aed' },
              { ico: '📄', val: stats.totalReleves,         lbl: 'Relevés publiés',        color: '#1d4ed8' },
            ].map(({ ico, val, lbl, color }) => (
              <div key={lbl} className="card" style={{ padding: '.85rem' }}>
                <div className="c-ico">{ico}</div>
                <div className="c-val" style={{ fontSize: 22, color }}>{val}</div>
                <div className="c-lbl">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Alertes */}
          {alertes.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: '.75rem' }}>
                ⚡ Alertes ({alertes.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {alertes.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.75rem 1rem', background: alertBg[a.type], borderRadius: 8, border: `1px solid ${alertColor[a.type]}22` }}>
                    <span>{alertIcon[a.type]}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: alertColor[a.type], minWidth: 180 }}>{a.ecole}</span>
                    <span style={{ fontSize: 12, color: alertColor[a.type], flex: 1 }}>{a.message}</span>
                    {a.valeur && <span style={{ fontSize: 12, fontWeight: 700, color: alertColor[a.type] }}>{a.valeur}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {alertes.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.75rem 1rem', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', marginBottom: '1.5rem' }}>
              <span>✅</span>
              <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>Tous les indicateurs sont nominaux</span>
            </div>
          )}

          {/* Tableau par école */}
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: '.75rem' }}>
            📊 Métriques par école
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>École</th>
                  <th style={{ textAlign: 'center' }}>Étudiants</th>
                  <th style={{ textAlign: 'center' }}>Semestres actifs</th>
                  <th style={{ textAlign: 'center' }}>Relevés publiés</th>
                  <th style={{ textAlign: 'center' }}>Exclusions</th>
                  <th style={{ textAlign: 'center' }}>Impayés</th>
                  <th style={{ textAlign: 'center' }}>Dernier calcul</th>
                  <th style={{ textAlign: 'center' }}>Santé</th>
                </tr>
              </thead>
              <tbody>
                {ecoles.map(e => {
                  const sante = e.montantImpaye >= SEUILS.impaye_critique ? 'error'
                    : e.montantImpaye >= SEUILS.impaye_warning || e.nbExclusions >= SEUILS.exclusions_warning ? 'warning'
                    : 'ok';
                  const santeConfig = {
                    ok:      { label: '✅ OK',       badge: 'green', bg: '#f0fdf4' },
                    warning: { label: '⚠️ Attention', badge: 'amber', bg: '#fef9c3' },
                    error:   { label: '🔴 Critique',  badge: 'red',   bg: '#fff5f5' },
                  }[sante];

                  return (
                    <tr key={e.id} style={{ background: sante === 'error' ? '#fff5f5' : sante === 'warning' ? '#fffbeb' : undefined }}>
                      <td><strong>{e.nom}</strong></td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge teal">{e.nbEtudiants}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${e.nbSemestresActifs > 0 ? 'green' : 'gray'}`}>{e.nbSemestresActifs}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge blue">{e.nbReleves}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${e.nbExclusions >= SEUILS.exclusions_warning ? 'amber' : 'gray'}`}>{e.nbExclusions}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {e.montantImpaye > 0 ? (
                          <span className={`badge ${e.montantImpaye >= SEUILS.impaye_critique ? 'red' : e.montantImpaye >= SEUILS.impaye_warning ? 'amber' : 'gray'}`}>
                            {Math.round(e.montantImpaye).toLocaleString('fr-FR')} FCFA
                          </span>
                        ) : <span className="badge green">Soldé</span>}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
                        {e.dernierCalcul
                          ? new Date(e.dernierCalcul).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${santeConfig.badge}`}>{santeConfig.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Finances réseau */}
          <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.2rem' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '1rem' }}>💰 Finances réseau</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.6rem .75rem', background: '#fef2f2', borderRadius: 7 }}>
                  <span style={{ fontSize: 12, color: '#dc2626' }}>Total impayés réseau</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{Math.round(stats.totalMontantImpaye).toLocaleString('fr-FR')} FCFA</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.6rem .75rem', background: '#fef9c3', borderRadius: 7 }}>
                  <span style={{ fontSize: 12, color: '#92400e' }}>Factures en attente / partiel</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>{stats.totalFacturesImpayees}</span>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '1.2rem' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '1rem' }}>🎯 Pipeline commercial</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.6rem .75rem', background: '#f0fdf4', borderRadius: 7 }}>
                  <span style={{ fontSize: 12, color: '#059669' }}>Prospects formulaire</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{stats.totalProspects}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.6rem .75rem', background: '#f9fafb', borderRadius: 7 }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>Écoles déployées</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f' }}>{stats.totalEcoles}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Services externes */}
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '.75rem' }}>🔗 Services externes</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[
                { nom: 'Supabase', url: 'https://supabase.com/dashboard/project/kcfpvnrgutkhakogbjip', ico: '🗄️', desc: 'Base de données + Auth + Storage' },
                { nom: 'Vercel', url: 'https://vercel.com/dashboard', ico: '▲', desc: 'Déploiement + Edge Functions proxy' },
                { nom: 'Brevo', url: 'https://app.brevo.com', ico: '📧', desc: 'Emails relevés + notifications' },
              ].map(s => (
                <a key={s.nom} href={s.url} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.85rem 1rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', transition: 'all .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#1e3a5f')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}>
                  <span style={{ fontSize: 20 }}>{s.ico}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{s.nom}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.desc}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>↗</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
