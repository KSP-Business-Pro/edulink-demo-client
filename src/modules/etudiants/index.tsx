// src/modules/etudiants/index.tsx
// Module Étudiants — matricule auto-généré par trigger SQL (B3.1)

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import {
  fetchEtudiants, deleteEtudiant, upsertEtudiant,
  type Etudiant, type EtudiantStatut, type EtudiantCreatePayload
} from './etudiants.service';
import { FicheEtudiant }   from './components/FicheEtudiant';
import { ImportEtudiants } from './components/ImportEtudiants';

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

const NIVEAUX   = ['L1','L2','L3','M1','M2','D1','D2','D3'];
const FILIERES  = ['Informatique','Gestion','Comptabilité','Finance','Droit','Marketing','RH','Autre'];

// ── Valeurs initiales du formulaire ────────────────────────────────────────
const FORM_INIT: EtudiantCreatePayload = {
  nom: '', prenom: '', sexe: 'M',
  email_auth: '', filiere: '', niveau: 'L1',
  date_naissance: '', lieu_naissance: '',
  telephone_parent: '', email_parent: '', adresse: '',
  statut: 'actif',
};

export default function EtudiantsPage() {
  const { user } = useAuth();
  const { error, loading, run, runAction } = useErrorHandler();

  const [etudiants,   setEtudiants]   = useState<Etudiant[]>([]);
  const [search,      setSearch]      = useState('');
  const [filterNiv,   setFilterNiv]   = useState('');
  const [page,        setPage]        = useState(0);
  const [ficheId,     setFicheId]     = useState<string | null>(null);
  const [showImport,  setShowImport]  = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [form,        setForm]        = useState<EtudiantCreatePayload>(FORM_INIT);
  const [saving,      setSaving]      = useState(false);
  const [newMatricule, setNewMatricule] = useState<string | null>(null); // matricule généré après création
  const [ecoleId,     setEcoleId]     = useState<string | null>(user?.ecole_id ?? null);

  useEffect(() => {
    if (user?.ecole_id) { setEcoleId(user.ecole_id); return; }
    import('../../services/supabase').then(({ supabase }) => {
      supabase.from('ecoles').select('id,nom').order('nom').limit(1).maybeSingle().then(({ data }) => {
        if (data?.id) setEcoleId(data.id);
      });
    });
  }, [user?.ecole_id]);

  const load = async () => {
    if (!ecoleId) return;
    const data = await run(
      () => fetchEtudiants(ecoleId),
      { context: 'Chargement étudiants', inline: true }
    );
    if (data) setEtudiants(data);
  };

  useEffect(() => { if (ecoleId) load(); }, [ecoleId]);

  // ── Filtres + pagination ──────────────────────────────────────────────────
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

  // ── Suppression ───────────────────────────────────────────────────────────
  const handleDelete = async (id: string, nom: string) => {
    if (!confirm(`Supprimer ${nom} ? Cette action est irréversible.`)) return;
    const ok = await runAction(() => deleteEtudiant(id), 'Suppression étudiant');
    if (ok !== null) setEtudiants(prev => prev.filter(e => e.id !== id));
  };

  // ── Création étudiant ─────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!ecoleId) return;
    if (!form.nom.trim() || !form.prenom.trim()) {
      import('../../hooks/useErrorHandler').then(({ addToast }) =>
        addToast('Nom et prénom sont obligatoires', 'warning')
      );
      return;
    }
    setSaving(true);
    try {
      // matricule NON inclus → le trigger SQL fn_generate_matricule le génère
      const id = await upsertEtudiant({ ...form, ecole_id: ecoleId });
      // Recharger pour récupérer le matricule généré par le trigger
      const data = await fetchEtudiants(ecoleId);
      if (data) {
        setEtudiants(data);
        const created = data.find(e => e.id === id);
        if (created?.matricule) setNewMatricule(created.matricule);
      }
      setForm(FORM_INIT);
      setShowModal(false);
    } catch (err) {
      import('../../hooks/useErrorHandler').then(({ addToast }) =>
        addToast(`Erreur création : ${err instanceof Error ? err.message : 'Inconnue'}`, 'error')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleField = (k: keyof EtudiantCreatePayload, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const openModal = () => {
    setForm(FORM_INIT);
    setNewMatricule(null);
    setShowModal(true);
  };

  // ── Vue fiche ─────────────────────────────────────────────────────────────
  if (ficheId) {
    return <FicheEtudiant etudiantId={ficheId} onClose={() => setFicheId(null)} />;
  }

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>🧑‍🎓 Étudiants</h1>
          <p style={S.sub}>
            {loading ? '…' : `${etudiants.length} étudiant${etudiants.length > 1 ? 's' : ''} enregistré${etudiants.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btnSecondary} onClick={() => setShowImport(true)}>📥 Importer Excel</button>
          <button style={S.btnPrimary}   onClick={openModal}>+ Nouvel étudiant</button>
        </div>
      </div>

      {/* ── Toast matricule généré ── */}
      {newMatricule && (
        <div style={S.successBanner}>
          <span>✅ Étudiant créé — matricule généré : <strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{newMatricule}</strong></span>
          <button style={S.closeBannerBtn} onClick={() => setNewMatricule(null)}>✕</button>
        </div>
      )}

      {/* ── Modal import Excel ── */}
      {showImport && ecoleId && (
        <ImportEtudiants
          ecoleId={ecoleId}
          onClose={() => setShowImport(false)}
          onSuccess={(count) => {
            setShowImport(false);
            load();
            import('../../hooks/useErrorHandler').then(({ addToast }) =>
              addToast(`✅ ${count} étudiant${count > 1 ? 's' : ''} importé${count > 1 ? 's' : ''} avec succès`, 'info')
            );
          }}
        />
      )}

      {/* ── Modal création étudiant ── */}
      {showModal && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={S.modal}>
            {/* En-tête modal */}
            <div style={S.modalHeader}>
              <div>
                <div style={S.modalTitle}>+ Nouvel étudiant</div>
                <div style={S.modalSub}>
                  Le matricule sera généré automatiquement à l'enregistrement
                </div>
              </div>
              <button style={S.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>

            {/* Corps modal */}
            <div style={S.modalBody}>

              {/* Bloc identité */}
              <div style={S.section}>
                <div style={S.sectionTitle}>👤 Identité</div>
                <div style={S.formGrid}>
                  <div style={S.field}>
                    <label style={S.label}>Nom <span style={S.req}>*</span></label>
                    <input style={S.input}
                      value={form.nom}
                      onChange={e => handleField('nom', e.target.value.toUpperCase())}
                      placeholder="KPADONOU"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Prénom <span style={S.req}>*</span></label>
                    <input style={S.input}
                      value={form.prenom}
                      onChange={e => handleField('prenom', e.target.value)}
                      placeholder="Fidèle"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Sexe</label>
                    <select style={S.input} value={form.sexe} onChange={e => handleField('sexe', e.target.value)}>
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Date de naissance</label>
                    <input style={S.input} type="date"
                      value={form.date_naissance}
                      onChange={e => handleField('date_naissance', e.target.value)}
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Lieu de naissance</label>
                    <input style={S.input}
                      value={form.lieu_naissance}
                      onChange={e => handleField('lieu_naissance', e.target.value)}
                      placeholder="Cotonou"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Adresse</label>
                    <input style={S.input}
                      value={form.adresse}
                      onChange={e => handleField('adresse', e.target.value)}
                      placeholder="Quartier, ville"
                    />
                  </div>
                </div>
              </div>

              {/* Bloc académique */}
              <div style={S.section}>
                <div style={S.sectionTitle}>🎓 Parcours académique</div>
                <div style={S.formGrid}>
                  <div style={S.field}>
                    <label style={S.label}>Filière <span style={S.req}>*</span></label>
                    <select style={S.input} value={form.filiere} onChange={e => handleField('filiere', e.target.value)}>
                      <option value="">— Choisir —</option>
                      {FILIERES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Niveau</label>
                    <select style={S.input} value={form.niveau} onChange={e => handleField('niveau', e.target.value)}>
                      {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Email étudiant</label>
                    <input style={S.input} type="email"
                      value={form.email_auth}
                      onChange={e => handleField('email_auth', e.target.value.toLowerCase())}
                      placeholder="etudiant@email.com"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Statut</label>
                    <select style={S.input} value={form.statut} onChange={e => handleField('statut', e.target.value)}>
                      <option value="actif">Actif</option>
                      <option value="inactif">Inactif</option>
                    </select>
                  </div>
                </div>

                {/* Aperçu matricule */}
                <div style={S.matriculePreview}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Matricule généré automatiquement :</span>
                  <code style={S.matriculeCode}>
                    {form.filiere
                      ? `HEMEC / #### / ${form.filiere.replace(/\s+/g,'').slice(0,4).toUpperCase()} / ${new Date().getFullYear()}`
                      : 'HEMEC / #### / ???? / ' + new Date().getFullYear()
                    }
                  </code>
                </div>
              </div>

              {/* Bloc contact parent */}
              <div style={S.section}>
                <div style={S.sectionTitle}>👨‍👩‍👦 Contact parent / tuteur</div>
                <div style={S.formGrid}>
                  <div style={S.field}>
                    <label style={S.label}>Téléphone parent</label>
                    <input style={S.input}
                      value={form.telephone_parent}
                      onChange={e => handleField('telephone_parent', e.target.value)}
                      placeholder="+229 97 00 00 00"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Email parent</label>
                    <input style={S.input} type="email"
                      value={form.email_parent}
                      onChange={e => handleField('email_parent', e.target.value.toLowerCase())}
                      placeholder="parent@email.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Pied modal */}
            <div style={S.modalFooter}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                🔑 Matricule auto-généré · format ÉCOLE/N°/FILIÈRE/ANNÉE
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.btnSecondary} onClick={() => setShowModal(false)} disabled={saving}>
                  Annuler
                </button>
                <button style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleCreate} disabled={saving}>
                  {saving ? '⏳ Enregistrement…' : '✅ Créer l\'étudiant'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filtres ── */}
      <div style={S.filters}>
        <input
          type="text"
          placeholder="🔍 Rechercher par nom, prénom, matricule…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={S.filterInput}
        />
        <select
          value={filterNiv}
          onChange={e => { setFilterNiv(e.target.value); setPage(0); }}
          style={{ ...S.filterInput, maxWidth: 140 }}
        >
          <option value="">Tous niveaux</option>
          {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* ── Erreur inline ── */}
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
          <div style={{ fontSize: 40, marginBottom: 8 }}>🧑‍🎓</div>
          <p>Aucun étudiant{search ? ' correspondant à la recherche' : ''}</p>
          {!search && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <button style={S.btnSecondary} onClick={() => setShowImport(true)}>📥 Importer depuis Excel</button>
              <button style={S.btnPrimary}   onClick={openModal}>+ Créer manuellement</button>
            </div>
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
                    <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#1e3a5f' }}>
                      {e.matricule ?? <span style={{ color: '#f97316' }}>En cours…</span>}
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
                    <button style={{ ...S.btnGhost, color: '#dc2626' }} onClick={() => handleDelete(e.id, `${e.nom} ${e.prenom}`)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div style={S.pagination}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} sur {filtered.length} étudiant{filtered.length > 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={S.btnGhost} disabled={page === 0}             onClick={() => setPage(p => p - 1)}>← Préc.</button>
            <span style={{ fontSize: 12, padding: '4px 10px', background: '#f3f4f6', borderRadius: 6 }}>Page {page + 1} / {totalPages}</span>
            <button style={S.btnGhost} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Suiv. →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  page:          { padding: '1.5rem 2rem', maxWidth: 1100, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:            { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:           { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  filters:       { display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' as const },
  filterInput:   { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', flex: 1, minWidth: 200, fontFamily: 'inherit' } as React.CSSProperties,
  errorBanner:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  successBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f0fdf4', color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 12, fontSize: 13, border: '1px solid #bbf7d0' } as React.CSSProperties,
  closeBannerBtn:{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 14, padding: '0 4px' } as React.CSSProperties,
  retryBtn:      { padding: '5px 12px', background: '#fff', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#dc2626', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  tableWrap:     { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  table:         { width: '100%', borderCollapse: 'collapse' as const },
  thead:         { background: '#f8fafc' },
  th:            { padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151', textAlign: 'left' as const, borderBottom: '1px solid #f1f5f9' },
  tr:            { borderBottom: '1px solid #f9fafb' },
  td:            { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' as const },
  pagination:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '8px 0' } as React.CSSProperties,
  centered:      { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 } as React.CSSProperties,
  spinner:       { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:         { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
  btnPrimary:    { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary:  { padding: '8px 16px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnGhost:      { padding: '5px 10px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
  // Modal
  overlay:       { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:         { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  modalHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  modalTitle:    { fontSize: 17, fontWeight: 700, color: '#1e293b' } as React.CSSProperties,
  modalSub:      { fontSize: 11, color: '#94a3b8', marginTop: 3 } as React.CSSProperties,
  closeBtn:      { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', lineHeight: 1, padding: 4 } as React.CSSProperties,
  modalBody:     { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' },
  modalFooter:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', gap: 8 },
  section:       { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  sectionTitle:  { fontSize: 13, fontWeight: 600, color: '#1e293b', padding: '0 0 4px', borderBottom: '1px solid #f1f5f9' } as React.CSSProperties,
  formGrid:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  field:         { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label:         { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  req:           { color: '#dc2626' },
  input:         { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fafafa' } as React.CSSProperties,
  matriculePreview: { display: 'flex', alignItems: 'center', gap: 10, background: '#f0f9ff', border: '1px dashed #bae6fd', borderRadius: 8, padding: '8px 12px', marginTop: 4 } as React.CSSProperties,
  matriculeCode:    { fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '3px 8px', borderRadius: 5 } as React.CSSProperties,
};
