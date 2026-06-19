// src/modules/inscriptions/index.tsx
// Module Inscriptions semestrielles — B3.1

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import {
  fetchInscriptions, fetchSemestres, fetchPromotions,
  updateStatutInscription, deleteInscription,
  type Inscription, type InscriptionStatut, type Semestre, type Promotion, type BatchResult,
} from './inscriptions.service';
import { ModalInscriptionBatch } from './components/ModalInscriptionBatch';
import { ModalInscriptionIndiv } from './components/ModalInscriptionIndiv';

const STATUT_STYLE: Record<InscriptionStatut, { bg: string; color: string; label: string }> = {
  active:     { bg: '#d1fae5', color: '#065f46', label: 'Active'     },
  suspendue:  { bg: '#fef3c7', color: '#92400e', label: 'Suspendue'  },
  abandonnee: { bg: '#fee2e2', color: '#991b1b', label: 'Abandonnée' },
};

const FACTURE_STYLE: Record<string, { bg: string; color: string }> = {
  payee:      { bg: '#d1fae5', color: '#065f46' },
  impayee:    { bg: '#fee2e2', color: '#991b1b' },
  partielle:  { bg: '#fef3c7', color: '#92400e' },
};

export default function InscriptionsPage() {
  const { user } = useAuth();
  const { error, loading, run, runAction } = useErrorHandler();

  const ecoleId = user?.ecole_id ?? '';

  const [inscriptions,  setInscriptions]  = useState<Inscription[]>([]);
  const [semestres,     setSemestres]     = useState<Semestre[]>([]);
  const [promotions,    setPromotions]    = useState<Promotion[]>([]);
  const [filterSem,     setFilterSem]     = useState('');
  const [filterStatut,  setFilterStatut]  = useState('');
  const [filterPromo,   setFilterPromo]   = useState('');
  const [search,        setSearch]        = useState('');
  const [showBatch,     setShowBatch]     = useState(false);
  const [showIndiv,     setShowIndiv]     = useState(false);

  // Chargement initial
  const load = async () => {
    if (!ecoleId) return;
    const [ins, sem, prom] = await Promise.all([
      run(() => fetchInscriptions(ecoleId), { context: 'Chargement inscriptions', inline: true }),
      fetchSemestres(ecoleId).catch(() => [] as Semestre[]),
      fetchPromotions(ecoleId).catch(() => [] as Promotion[]),
    ]);
    if (ins) setInscriptions(ins);
    setSemestres(sem);
    setPromotions(prom);
  };

  useEffect(() => { if (ecoleId) load(); }, [ecoleId]);

  // ── Filtres ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let l = inscriptions;
    if (filterSem)    l = l.filter(i => i.semestre_id    === filterSem);
    if (filterStatut) l = l.filter(i => i.statut         === filterStatut);
    if (filterPromo)  l = l.filter(i => i.promotion_id   === filterPromo);
    if (search) {
      const s = search.toLowerCase();
      l = l.filter(i =>
        `${i.etudiant_nom} ${i.etudiant_prenom ?? ''} ${i.etudiant_matricule ?? ''}`.toLowerCase().includes(s)
      );
    }
    return l;
  }, [inscriptions, filterSem, filterStatut, filterPromo, search]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total:      inscriptions.length,
    actives:    inscriptions.filter(i => i.statut === 'active').length,
    suspendues: inscriptions.filter(i => i.statut === 'suspendue').length,
    abandonnees:inscriptions.filter(i => i.statut === 'abandonnee').length,
    impayees:   inscriptions.filter(i => i.facture_statut === 'impayee').length,
  }), [inscriptions]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleStatut = async (inscriptionId: string, statut: InscriptionStatut) => {
    const ok = await runAction(
      () => updateStatutInscription(inscriptionId, statut),
      'Mise à jour statut'
    );
    if (ok !== null) {
      setInscriptions(prev => prev.map(i =>
        i.inscription_id === inscriptionId ? { ...i, statut } : i
      ));
    }
  };

  const handleDelete = async (inscriptionId: string, nom: string) => {
    if (!confirm(`Supprimer l'inscription de ${nom} ? Cette action est irréversible.`)) return;
    const ok = await runAction(
      () => deleteInscription(inscriptionId),
      'Suppression inscription'
    );
    if (ok !== null) {
      setInscriptions(prev => prev.filter(i => i.inscription_id !== inscriptionId));
    }
  };

  const handleBatchSuccess = (result: BatchResult) => {
    import('../../hooks/useErrorHandler').then(({ addToast }) =>
      addToast(
        `✅ ${result.inscrits} inscrit(s) · ${result.doublons} doublon(s)${result.factures > 0 ? ` · ${result.factures} facture(s) générée(s)` : ''}`,
        'info'
      )
    );
    load();
  };

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>📋 Inscriptions semestrielles</h1>
          <p style={S.sub}>
            {loading ? '…' : `${inscriptions.length} inscription${inscriptions.length > 1 ? 's' : ''} au total`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btnSecondary} onClick={() => setShowIndiv(true)}>
            ➕ Inscription individuelle
          </button>
          <button style={S.btnPrimary} onClick={() => setShowBatch(true)}>
            👥 Inscrire une promotion
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={S.kpiGrid}>
        {[
          { ico: '📋', val: kpis.total,       lbl: 'Total',       bg: '#f8fafc', color: '#1e293b' },
          { ico: '✅', val: kpis.actives,      lbl: 'Actives',     bg: '#f0fdf4', color: '#065f46' },
          { ico: '⏸️', val: kpis.suspendues,   lbl: 'Suspendues',  bg: '#fffbeb', color: '#92400e' },
          { ico: '❌', val: kpis.abandonnees,  lbl: 'Abandonnées', bg: '#fef2f2', color: '#991b1b' },
          { ico: '💰', val: kpis.impayees,     lbl: 'Impayées',    bg: '#fef2f2', color: '#dc2626' },
        ].map(({ ico, val, lbl, bg, color }) => (
          <div key={lbl} style={{ ...S.kpiCard, background: bg }}>
            <div style={{ fontSize: 20 }}>{ico}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* ── Filtres ── */}
      <div style={S.filters}>
        <input
          type="text"
          placeholder="🔍 Nom, prénom, matricule…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...S.filterInput, flex: 2 }}
        />
        <select style={S.filterInput} value={filterSem} onChange={e => setFilterSem(e.target.value)}>
          <option value="">Tous les semestres</option>
          {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
        </select>
        <select style={S.filterInput} value={filterPromo} onChange={e => setFilterPromo(e.target.value)}>
          <option value="">Toutes les promotions</option>
          {promotions.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <select style={{ ...S.filterInput, maxWidth: 150 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="active">Active</option>
          <option value="suspendue">Suspendue</option>
          <option value="abandonnee">Abandonnée</option>
        </select>
        {(filterSem || filterStatut || filterPromo || search) && (
          <button style={S.btnGhost} onClick={() => { setFilterSem(''); setFilterStatut(''); setFilterPromo(''); setSearch(''); }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* ── Erreur ── */}
      {error && (
        <div style={S.errorBanner}>
          {error}
          <button style={S.retryBtn} onClick={load}>🔄 Réessayer</button>
        </div>
      )}

      {/* ── Tableau ── */}
      {loading ? (
        <div style={S.centered}>
          <div style={S.spinner} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <p>{search || filterSem || filterStatut || filterPromo ? 'Aucun résultat pour ces filtres' : 'Aucune inscription enregistrée'}</p>
          {!search && !filterSem && !filterStatut && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <button style={S.btnSecondary} onClick={() => setShowIndiv(true)}>➕ Individuelle</button>
              <button style={S.btnPrimary}   onClick={() => setShowBatch(true)}>👥 Par promotion</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr style={S.thead}>
                  <th style={S.th}>Étudiant</th>
                  <th style={S.th}>Semestre</th>
                  <th style={S.th}>Promotion</th>
                  <th style={S.th}>Statut</th>
                  <th style={S.th}>Facture</th>
                  <th style={S.th}>Date</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ins => {
                  const st = STATUT_STYLE[ins.statut] ?? STATUT_STYLE.active;
                  const fac = ins.facture_statut ? FACTURE_STYLE[ins.facture_statut] : null;
                  return (
                    <tr key={ins.inscription_id} style={S.tr}>
                      {/* Étudiant */}
                      <td style={S.td}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>
                          {ins.etudiant_nom} {ins.etudiant_prenom ?? ''}
                        </div>
                        <code style={{ fontSize: 10, color: '#64748b', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>
                          {ins.etudiant_matricule ?? '—'}
                        </code>
                      </td>
                      {/* Semestre */}
                      <td style={{ ...S.td, fontSize: 12, color: '#374151', maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ins.semestre_libelle}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{ins.annee_libelle ?? ''}</div>
                      </td>
                      {/* Promotion */}
                      <td style={{ ...S.td, fontSize: 12, color: '#6b7280' }}>
                        {ins.promotion_nom ?? '—'}
                      </td>
                      {/* Statut inscription */}
                      <td style={S.td}>
                        <select
                          value={ins.statut}
                          onChange={e => handleStatut(ins.inscription_id, e.target.value as InscriptionStatut)}
                          style={{
                            background: st.bg, color: st.color,
                            border: 'none', borderRadius: 999,
                            fontSize: 11, fontWeight: 600,
                            padding: '3px 8px', cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <option value="active">Active</option>
                          <option value="suspendue">Suspendue</option>
                          <option value="abandonnee">Abandonnée</option>
                        </select>
                      </td>
                      {/* Facture */}
                      <td style={S.td}>
                        {fac ? (
                          <div>
                            <span style={{ background: fac.bg, color: fac.color, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 999 }}>
                              {ins.facture_statut}
                            </span>
                            {ins.facture_montant_total && (
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                                {Number(ins.facture_montant_total).toLocaleString('fr-FR')} F
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                        )}
                      </td>
                      {/* Date */}
                      <td style={{ ...S.td, fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' as const }}>
                        {ins.date_inscription
                          ? new Date(ins.date_inscription).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      {/* Actions */}
                      <td style={{ ...S.td }}>
                        <button
                          style={{ ...S.btnGhost, color: '#dc2626', fontSize: 12 }}
                          onClick={() => handleDelete(ins.inscription_id, `${ins.etudiant_nom} ${ins.etudiant_prenom ?? ''}`)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, textAlign: 'right' as const }}>
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}{filtered.length !== inscriptions.length ? ` sur ${inscriptions.length}` : ''}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {showBatch && (
        <ModalInscriptionBatch
          ecoleId={ecoleId}
          semestres={semestres}
          promotions={promotions}
          onClose={() => setShowBatch(false)}
          onSuccess={handleBatchSuccess}
        />
      )}
      {showIndiv && (
        <ModalInscriptionIndiv
          ecoleId={ecoleId}
          semestres={semestres}
          promotions={promotions}
          onClose={() => setShowIndiv(false)}
          onSuccess={load}
        />
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 1200, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  kpiGrid:     { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: '1.25rem' } as React.CSSProperties,
  kpiCard:     { borderRadius: 12, padding: '1rem', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, textAlign: 'center' as const },
  filters:     { display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' as const, alignItems: 'center' },
  filterInput: { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', flex: 1, minWidth: 160, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  errorBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  retryBtn:    { padding: '5px 12px', background: '#fff', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#dc2626', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  tableWrap:   { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  table:       { width: '100%', borderCollapse: 'collapse' as const },
  thead:       { background: '#f8fafc' },
  th:          { padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9' },
  tr:          { borderBottom: '1px solid #f9fafb' },
  td:          { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' as const },
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:     { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:       { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
  btnPrimary:  { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnGhost:    { padding: '5px 10px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
};
