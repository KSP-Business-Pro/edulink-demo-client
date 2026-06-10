// src/modules/etudiants/index.tsx
// Module Étudiants React — liste, recherche, filtres, pagination, fiche, import Excel

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchEtudiants, deleteEtudiant,
  type Etudiant, type EtudiantStatut
} from './etudiants.service';
import { FicheEtudiant }    from './components/FicheEtudiant';
import { ImportEtudiants }  from './components/ImportEtudiants';

const PAGE_SIZE = 20;

const STATUT_COLORS: Record<EtudiantStatut, string> = {
  actif:     '#d1fae5',
  inactif:   '#f3f4f6',
  diplome:   '#ede9fe',
  abandonne: '#fee2e2',
};
const STATUT_TEXT: Record<EtudiantStatut, string> = {
  actif:     '#065f46',
  inactif:   '#374151',
  diplome:   '#4c1d95',
  abandonne: '#991b1b',
};

const NIVEAUX = ['L1','L2','L3','M1','M2','D1','D2','D3'];

export default function EtudiantsPage() {
  const { user } = useAuth();
  const [etudiants,  setEtudiants]  = useState<Etudiant[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');
  const [filterNiv,  setFilterNiv]  = useState('');
  const [page,       setPage]       = useState(0);
  const [ficheId,    setFicheId]    = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const [ecoleId, setEcoleId] = useState<string | null>(user?.ecole_id ?? null);

  useEffect(() => {
    if (user?.ecole_id) { setEcoleId(user.ecole_id); return; }
    import('../../services/supabase').then(({ supabase }) => {
      supabase.from('ecoles').select('id,nom').order('nom').limit(1).maybeSingle().then(({ data }) => {
        if (data?.id) setEcoleId(data.id);
      });
    });
  }, [user?.ecole_id]);

  const load = async () => {
    if (!ecoleId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchEtudiants(ecoleId);
      setEtudiants(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (ecoleId) load(); }, [ecoleId]);

  const filtered = useMemo(() => {
    let l = etudiants;
    if (search) {
      const s = search.toLowerCase();
      l = l.filter(e => `${e.nom} ${e.prenom} ${e.matricule ?? ''}`.toLowerCase().includes(s));
    }
    if (filterNiv) l = l.filter(e => e.niveau === filterNiv);
    return l;
  }, [etudiants, search, filterNiv]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleDelete = async (id: string, nom: string) => {
    if (!confirm(`Supprimer ${nom} ? Cette action est irréversible.`)) return;
    try {
      await deleteEtudiant(id);
      setEtudiants(prev => prev.filter(e => e.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erreur suppression');
    }
  };

  if (ficheId) {
    return <FicheEtudiant etudiantId={ficheId} onClose={() => setFicheId(null)} />;
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>🧑‍🎓 Étudiants</h1>
          <p style={S.sub}>
            {loading ? '…' : `${etudiants.length} étudiant${etudiants.length > 1 ? 's' : ''} enregistré${etudiants.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btnSecondary} onClick={() => setShowImport(true)}>
            📥 Importer Excel
          </button>
          <button style={S.btnPrimary} onClick={() => alert('Modal ajout — à implémenter')}>
            + Nouvel étudiant
          </button>
        </div>
      </div>

      {/* Modal import */}
      {showImport && ecoleId && (
        <ImportEtudiants
          ecoleId={ecoleId}
          onClose={() => setShowImport(false)}
          onSuccess={(count) => {
            setShowImport(false);
            load();
            alert(`✅ ${count} étudiant${count > 1 ? 's' : ''} importé${count > 1 ? 's' : ''} avec succès`);
          }}
        />
      )}

      {/* Filtres */}
      <div style={S.filters}>
        <input
          type="text"
          placeholder="🔍 Rechercher par nom, prénom, matricule…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={S.input}
        />
        <select
          value={filterNiv}
          onChange={e => { setFilterNiv(e.target.value); setPage(0); }}
          style={{ ...S.input, maxWidth: 140 }}
        >
          <option value="">Tous niveaux</option>
          {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={S.centered}><div style={S.spinner} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
      ) : filtered.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🧑‍🎓</div>
          <p>Aucun étudiant{search ? ' correspondant à la recherche' : ''}</p>
          {!search && (
            <button style={{ ...S.btnSecondary, marginTop: 12 }} onClick={() => setShowImport(true)}>
              📥 Importer depuis Excel
            </button>
          )}
        </div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr style={S.thead}>
                <th style={S.th}>Matricule</th>
                <th style={S.th}>Nom & Prénom</th>
                <th style={S.th}>Filière</th>
                <th style={S.th}>Niveau</th>
                <th style={S.th}>Statut</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(e => (
                <tr key={e.id} style={S.tr}>
                  <td style={S.td}>
                    <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                      {e.matricule ?? '—'}
                    </code>
                  </td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: e.sexe === 'F' ? '#fce7f3' : '#dbeafe',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                        color: e.sexe === 'F' ? '#be185d' : '#1d4ed8',
                      }}>
                        {(e.nom?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{e.nom} {e.prenom}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{e.email_auth ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...S.td, fontSize: 12, color: '#6b7280' }}>{e.filiere ?? '—'}</td>
                  <td style={S.td}>
                    {e.niveau
                      ? <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{e.niveau}</span>
                      : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={S.td}>
                    <span style={{
                      background: STATUT_COLORS[e.statut] ?? '#f3f4f6',
                      color:      STATUT_TEXT[e.statut]   ?? '#374151',
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
                    }}>
                      {e.statut}
                    </span>
                  </td>
                  <td style={{ ...S.td, display: 'flex', gap: 4 }}>
                    <button style={S.btnGhost} onClick={() => setFicheId(e.id)}>Fiche</button>
                    <button style={S.btnGhost} onClick={() => alert(`Modifier ${e.nom} — à implémenter`)}>✏️</button>
                    <button style={{ ...S.btnGhost, color: '#dc2626' }} onClick={() => handleDelete(e.id, `${e.nom} ${e.prenom}`)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <div style={S.pagination}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} sur {filtered.length} étudiant{filtered.length > 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={S.btnGhost} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Préc.</button>
            <span style={{ fontSize: 12, padding: '4px 10px', background: '#f3f4f6', borderRadius: 6 }}>Page {page + 1} / {totalPages}</span>
            <button style={S.btnGhost} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Suiv. →</button>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  page:       { padding: '1.5rem 2rem', maxWidth: 1100, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:         { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:        { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  filters:    { display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' as const },
  input:      { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', flex: 1, minWidth: 200, fontFamily: 'inherit' } as React.CSSProperties,
  tableWrap:  { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  table:      { width: '100%', borderCollapse: 'collapse' as const },
  thead:      { background: '#f8fafc' },
  th:         { padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9' },
  tr:         { borderBottom: '1px solid #f9fafb' },
  td:         { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' as const },
  btnPrimary: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:{ padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnGhost:   { padding: '5px 10px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '8px 0' } as React.CSSProperties,
  centered:   { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:    { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:      { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
};
