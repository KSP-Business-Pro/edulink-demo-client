// src/pages/DashboardReseauPage.tsx
// Dashboard Réseau — Vue multi-établissements — Superadmin uniquement
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';

interface EcoleStats {
  id: string;
  nom: string;
  code_ecole: string;
  etudiants: number;
  enseignants: number;
  promotions: number;
  factures_total: number;
  factures_encaissees: number;
  taux_recouvrement: number;
  etudiants_risque: number;
  semestres_actifs: number;
  deliberations_pending: number;
}

interface AlerteReseau {
  type: 'warning' | 'error' | 'info';
  ecole: string;
  message: string;
  href: string;
}

function StatCard({ ico, val, label, sub, color = '#1e3a5f' }: {
  ico: string; val: string | number; label: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '1rem 1.25rem',
      border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 24 }}>{ico}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, width: '100%' }}>
      <div style={{ background: color, borderRadius: 4, height: 6, width: `${pct}%`, transition: 'width .3s' }} />
    </div>
  );
}

export function DashboardReseauPage() {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [ecoles, setEcoles] = useState<EcoleStats[]>([]);
  const [alertes, setAlertes] = useState<AlerteReseau[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [showNvEcole, setShowNvEcole] = useState(false)
  const [nvForm, setNvForm] = useState({ nom: '', code_ecole: '', type_etablissement: 'universite', ville: '', pays: 'Benin' })
  const [nvSaving, setNvSaving] = useState(false)
  const [nvError, setNvError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Charger les écoles
      const { data: ecolesData } = await supabase
        .from('ecoles')
        .select('id, nom, code_ecole')
        .eq('actif', true)
        .order('nom');

      if (!ecolesData) return;

      const stats: EcoleStats[] = [];
      const newAlertes: AlerteReseau[] = [];

      for (const ecole of ecolesData) {
        // Étudiants
        const { count: nbEtudiants } = await supabase
          .from('etudiants')
          .select('*', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id)

        // Enseignants
        const { count: nbEnseignants } = await supabase
          .from('enseignants')
          .select('*', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id);

        // Promotions
        const { count: nbPromotions } = await supabase
          .from('promotions')
          .select('*', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id);

        // Semestres actifs
        const { count: nbSemestres } = await supabase
          .from('semestres')
          .select('*', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id)
          .eq('statut', 'en_cours');

        // Factures
        const { data: factures } = await supabase
          .from('factures')
          .select('montant_total, montant_paye')
          .eq('ecole_id', ecole.id);

        const totalAttendu = (factures ?? []).reduce((s, f) => s + (f.montant_total ?? 0), 0);
        const totalEncaisse = (factures ?? []).reduce((s, f) => s + (f.montant_paye ?? 0), 0);
        const tauxRecouvrement = totalAttendu > 0 ? Math.round((totalEncaisse / totalAttendu) * 100) : 0;

        // Étudiants à risque (absences > 30%)
        const { data: presencesData } = await supabase
          .from('presences')
          .select('etudiant_id, statut')
          .eq('ecole_id', ecole.id);
        const parEtudiant: Record<string, { total: number; absents: number }> = {};
        (presencesData ?? []).forEach((p: { etudiant_id: string; statut: string }) => {
          const e = parEtudiant[p.etudiant_id] ?? { total: 0, absents: 0 };
          e.total += 1;
          if (p.statut === 'absent') e.absents += 1;
          parEtudiant[p.etudiant_id] = e;
        });
        const nbRisque = Object.values(parEtudiant).filter(e => e.total > 0 && (e.absents / e.total) > 0.3).length;

        // Délibérations en attente (semestres en_cours sans PV)
        const { data: semActifs } = await supabase
          .from('semestres')
          .select('id')
          .eq('ecole_id', ecole.id)
          .eq('statut', 'en_cours');

        let deliberationsPending = 0;
        if (semActifs && semActifs.length > 0) {
          const semIds = semActifs.map(s => s.id);
          const { count: nbDelibs } = await supabase
            .from('deliberations')
            .select('*', { count: 'exact', head: true })
              .in('semestre_id', semIds)
            .eq('statut', 'validee');
          deliberationsPending = (semActifs.length) - (nbDelibs ?? 0);
        }

        // Générer alertes
        if (tauxRecouvrement < 70 && totalAttendu > 0) {
          newAlertes.push({
            type: 'warning',
            ecole: ecole.nom,
            message: `Taux de recouvrement faible : ${tauxRecouvrement}%`,
            href: '/comptabilite',
          });
        }
        if ((nbRisque ?? 0) > 0) {
          newAlertes.push({
            type: 'warning',
            ecole: ecole.nom,
            message: `${nbRisque} étudiant(s) à risque d'exclusion`,
            href: '/presences',
          });
        }
        if (deliberationsPending > 0) {
          newAlertes.push({
            type: 'info',
            ecole: ecole.nom,
            message: `${deliberationsPending} semestre(s) sans délibération validée`,
            href: '/deliberations',
          });
        }

        stats.push({
          id: ecole.id,
          nom: ecole.nom,
          code_ecole: ecole.code_ecole ?? '—',
          etudiants: nbEtudiants ?? 0,
          enseignants: nbEnseignants ?? 0,
          promotions: nbPromotions ?? 0,
          factures_total: totalAttendu,
          factures_encaissees: totalEncaisse,
          taux_recouvrement: tauxRecouvrement,
          etudiants_risque: nbRisque ?? 0,
          semestres_actifs: nbSemestres ?? 0,
          deliberations_pending: deliberationsPending,
        });
      }

      setEcoles(stats);
      setAlertes(newAlertes);
      setLastSync(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) { navigate('/dashboard'); return; }
    loadStats();
  }, [isSuperAdmin, loadStats, navigate]);

  if (!isSuperAdmin) return null;

  // Totaux réseau
  const totalEtudiants   = ecoles.reduce((s, e) => s + e.etudiants, 0);
  const totalEnseignants = ecoles.reduce((s, e) => s + e.enseignants, 0);
  const totalFA          = ecoles.reduce((s, e) => s + e.factures_total, 0);
  const totalFE          = ecoles.reduce((s, e) => s + e.factures_encaissees, 0);
  const tauxReseau       = totalFA > 0 ? Math.round((totalFE / totalFA) * 100) : 0;

  const COLORS = ['#1e3a5f', '#0e7490', '#7c3aed', '#d97706', '#059669', '#dc2626'];

  async function creerEcole() {
    if (!nvForm.nom.trim()) { setNvError('Nom requis'); return }
    if (!nvForm.code_ecole.trim()) { setNvError('Code requis'); return }
    setNvSaving(true); setNvError(null)
    const slug = nvForm.nom.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-')
    const { error: e } = await supabase.from('ecoles').insert({ nom: nvForm.nom.trim(), code_ecole: nvForm.code_ecole.trim().toUpperCase(), type_etablissement: nvForm.type_etablissement, ville: nvForm.ville.trim(), pays: nvForm.pays.trim(), slug, portail_actif: false })
    setNvSaving(false)
    if (e) { setNvError(e.message); return }
    setShowNvEcole(false)
    setNvForm({ nom: '', code_ecole: '', type_etablissement: 'universite', ville: '', pays: 'Benin' })
    loadStats()
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>
            🌐 Dashboard Réseau
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Vue consolidée · {ecoles.length} établissement(s) actif(s)
            {lastSync && <span style={{ marginLeft: 8, color: '#9ca3af' }}>x Sync {lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <button onClick={() => setShowNvEcole(true)} style={{ padding: '9px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>+ Nouvel etablissement</button>
        <button
          onClick={loadStats}
          disabled={loading}
          style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '⟳ Chargement…' : '⟳ Actualiser'}
        </button>
      </div>

      {/* KPIs réseau */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard ico="🎓" val={totalEtudiants} label="Étudiants réseau" sub="Tous établissements" />
        <StatCard ico="👨‍🏫" val={totalEnseignants} label="Enseignants réseau" sub="Corps enseignant total" />
        <StatCard ico="🏫" val={ecoles.length} label="Établissements" sub="Actifs" color="#0e7490" />
        <StatCard ico="💰" val={`${tauxReseau}%`} label="Recouvrement réseau" sub={`${(totalFE/1000000).toFixed(1)}M / ${(totalFA/1000000).toFixed(1)}M FCFA`} color={tauxReseau >= 80 ? '#059669' : tauxReseau >= 60 ? '#d97706' : '#dc2626'} />
        <StatCard ico="⚠️" val={alertes.filter(a => a.type === 'warning' || a.type === 'error').length} label="Alertes actives" sub="Nécessitent attention" color="#d97706" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.25rem', alignItems: 'start' }}>
        {/* Tableau comparatif */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>📊 Comparatif établissements</h2>
          </div>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Établissement', 'Étudiants', 'Enseignants', 'Promotions', 'Semestres actifs', 'Recouvrement', 'Alertes'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ecoles.map((ecole, idx) => (
                    <tr key={ecole.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[idx % COLORS.length], flexShrink: 0 }} />
                          <div>
                            <div>{ecole.nom}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{ecole.code_ecole}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{ecole.etudiants}</span>
                      </td>
                      <td style={{ padding: '12px', color: '#374151' }}>{ecole.enseignants}</td>
                      <td style={{ padding: '12px', color: '#374151' }}>{ecole.promotions}</td>
                      <td style={{ padding: '12px', color: '#374151' }}>
                        <span style={{ background: ecole.semestres_actifs > 0 ? '#dcfce7' : '#f1f5f9', color: ecole.semestres_actifs > 0 ? '#166534' : '#6b7280', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                          {ecole.semestres_actifs} en cours
                        </span>
                      </td>
                      <td style={{ padding: '12px', minWidth: 120 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span style={{ fontWeight: 600, color: ecole.taux_recouvrement >= 80 ? '#059669' : ecole.taux_recouvrement >= 60 ? '#d97706' : '#dc2626' }}>{ecole.taux_recouvrement}%</span>
                            <span style={{ color: '#9ca3af' }}>{(ecole.factures_encaissees/1000).toFixed(0)}k / {(ecole.factures_total/1000).toFixed(0)}k</span>
                          </div>
                          <ProgressBar value={ecole.factures_encaissees} max={ecole.factures_total} color={ecole.taux_recouvrement >= 80 ? '#059669' : ecole.taux_recouvrement >= 60 ? '#d97706' : '#dc2626'} />
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {alertes.filter(a => a.ecole === ecole.nom).length > 0 ? (
                          <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                            {alertes.filter(a => a.ecole === ecole.nom).length} alerte(s)
                          </span>
                        ) : (
                          <span style={{ color: '#059669', fontSize: 12 }}>✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panneau droite : alertes + accès rapide */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Alertes */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>🔔 Alertes réseau</h2>
            </div>
            <div style={{ padding: '.75rem', maxHeight: 280, overflowY: 'auto' }}>
              {alertes.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '1rem' }}>
                  ✅ Aucune alerte active
                </div>
              ) : alertes.map((a, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '8px', borderRadius: 8, marginBottom: 4,
                  background: a.type === 'error' ? '#fef2f2' : a.type === 'warning' ? '#fffbeb' : '#eff6ff',
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{a.type === 'error' ? '🔴' : a.type === 'warning' ? '🟡' : '🔵'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{a.ecole}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{a.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Accès rapide par école */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>⚡ Accès rapide réseau</h2>
            </div>
            <div style={{ padding: '.75rem' }}>
              {ecoles.map((ecole, idx) => (
                <div key={ecole.id} style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS[idx % COLORS.length], marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS[idx % COLORS.length] }} />
                    {ecole.nom}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {[
                      { ico: '🎓', label: 'Étudiants', href: '/etudiants' },
                      { ico: '📝', label: 'Notes', href: '/saisie-notes' },
                      { ico: '📊', label: 'Résultats', href: '/resultats' },
                      { ico: '💰', label: 'Compta', href: '/comptabilite' },
                      { ico: '⚖️', label: 'Délibérations', href: '/deliberations' },
                      { ico: '📄', label: 'Relevés', href: '/releves' },
                    ].map(m => (
                      <button
                        key={m.href}
                        onClick={() => navigate(m.href)}
                        style={{
                          background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8,
                          padding: '6px 8px', fontSize: 11, cursor: 'pointer', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 6, color: '#374151',
                          transition: 'background .15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#f8fafc')}
                      >
                        <span>{m.ico}</span>{m.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showNvEcole && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setShowNvEcole(false) }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>Nouvel etablissement</div>
              <button onClick={() => setShowNvEcole(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>x</button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              {nvError && <div style={{ background: '#fef2f2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{nvError}</div>}
              {[{ label: 'Nom officiel', key: 'nom', ph: 'Ecole Superieure de Management' }, { label: 'Code', key: 'code_ecole', ph: 'ESM' }, { label: 'Ville', key: 'ville', ph: 'Cotonou' }, { label: 'Pays', key: 'pays', ph: 'Benin' }].map(f => (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>{f.label}</label>
                  <input value={nvForm[f.key as keyof typeof nvForm]} onChange={e => setNvForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              ))}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Type</label>
                <select value={nvForm.type_etablissement} onChange={e => setNvForm(p => ({ ...p, type_etablissement: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: '100%', background: '#fff', outline: 'none' }}>
                  <option value='universite'>Universite</option>
                  <option value='ecole'>Ecole</option>
                  <option value='institut'>Institut</option>
                  <option value='centre'>Centre de formation</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowNvEcole(false)} style={{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={creerEcole} disabled={nvSaving} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{nvSaving ? 'Creation...' : 'Creer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
