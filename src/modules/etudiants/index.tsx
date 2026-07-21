// src/modules/etudiants/index.tsx
// Module Étudiants — matricule auto-généré par trigger SQL (B3.1)
// B9 : fetchEtudiants bascule sur recherche + pagination côté serveur (RPC fn_get_etudiants_ecole)

import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import {
  fetchEtudiants, fetchEtudiant, deleteEtudiant, upsertEtudiant,
  type Etudiant, type EtudiantStatut, type EtudiantCreatePayload
} from './etudiants.service';
import { FicheEtudiant }   from './components/FicheEtudiant';
const ImportEtudiants = lazy(() =>
  import('./components/ImportEtudiants').then(m => ({ default: m.ImportEtudiants }))
);
import ResponsiveTable, { type RTColumn } from '../../components/ResponsiveTable';

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
const FILIERES  = ['GFC','MC','ACG','CI','CIM','DP','DR','GP'];

// ── Colonnes du tableau (desktop + carte mobile via ResponsiveTable) ──────────
const etudiantColumns: RTColumn<Etudiant>[] = [
  {
    key: 'matricule',
    label: 'Matricule',
    mono: true,
    render: e => (
      <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#1e3a5f' }}>
        {e.matricule ?? <span style={{ color: '#f97316' }}>En cours…</span>}
      </code>
    ),
  },
  {
    key: 'nom',
    label: 'Nom & Prénom',
    primary: true,
    render: e => (
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
    ),
  },
  {
    key: 'filiere',
    label: 'Filière',
    render: e => <span style={{ fontSize: 12, color: '#6b7280' }}>{e.filiere ?? '—'}</span>,
  },
  {
    key: 'niveau',
    label: 'Niveau',
    render: e => e.niveau
      ? <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{e.niveau}</span>
      : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>,
  },
  {
    key: 'statut',
    label: 'Statut',
    render: e => (
      <span style={{
        background: STATUT_COLORS[e.statut] ?? '#f3f4f6',
        color:      STATUT_TEXT[e.statut]   ?? '#374151',
        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
      }}>
        {e.statut}
      </span>
    ),
  },
];

// ── Valeurs initiales du formulaire ────────────────────────────────────────
const FORM_INIT: EtudiantCreatePayload = {
  nom: '', prenom: '', sexe: 'M',
  email_auth: '', filiere: '', niveau: 'L1',
  date_naissance: '', lieu_naissance: '',
  telephone_parent: '', email_parent: '', adresse: '',
  statut: 'actif',
};

export default function EtudiantsPage() {
  const { user, activeEcoleId } = useAuth();
  const { error, loading, run, runAction } = useErrorHandler();

  const [etudiants,    setEtudiants]    = useState<Etudiant[]>([]);
  const [total,        setTotal]        = useState(0);
  const [searchInput,  setSearchInput]  = useState('');   // valeur brute du champ (à chaque frappe)
  const [search,       setSearch]       = useState('');   // valeur debouncée, envoyée au serveur
  const [filterNiv,    setFilterNiv]    = useState('');
  const [page,         setPage]         = useState(0);
  const [ficheId,      setFicheId]      = useState<string | null>(null);
  const [showImport,   setShowImport]   = useState(false);
  const [showModal,    setShowModal]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [form,         setForm]         = useState<EtudiantCreatePayload>(FORM_INIT);
  const [saving,       setSaving]       = useState(false);
  const [newMatricule, setNewMatricule] = useState<string | null>(null); // matricule généré après création
  const ecoleId = activeEcoleId;

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Recherche : debounce 300ms avant d'interroger le serveur ──────────────
  const handleSearchChange = (v: string) => {
    setSearchInput(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearch(v);
      setPage(0);
    }, 300);
  };

  // ── Chargement (recherche + filtre + pagination côté serveur) ─────────────
  const load = async () => {
    if (!ecoleId) return;
    const result = await run(
      () => fetchEtudiants({
        ecoleId,
        search: search.trim() || undefined,
        niveau: filterNiv || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
      { context: 'Chargement étudiants', inline: true }
    );
    if (result) {
      setEtudiants(result.data);
      setTotal(result.total);
    }
  };

  useEffect(() => { if (ecoleId) load(); }, [ecoleId, search, filterNiv, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  // ── Suppression ───────────────────────────────────────────────────────────
  const handleDelete = async (id: string, nom: string) => {
    if (!confirm(`Supprimer ${nom} ? Cette action est irréversible.`)) return;
    const ok = await runAction(() => deleteEtudiant(id), 'Suppression étudiant');
    if (ok !== null) load();
  };

  // ── Création étudiant ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!ecoleId) return;
    if (!form.nom.trim() || !form.prenom.trim()) {
      import('../../hooks/useErrorHandler').then(({ addToast }) =>
        addToast('Nom et prénom sont obligatoires', 'warning')
      );
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await upsertEtudiant({ ...form, ecole_id: ecoleId, id: editingId });
        setForm(FORM_INIT);
        setEditingId(null);
        setShowModal(false);
        load();
        import('../../hooks/useErrorHandler').then(({ addToast }) =>
          addToast('✅ Étudiant modifié avec succès', 'info')
        );
      } else {
        // matricule NON inclus → le trigger SQL fn_generate_matricule le génère
        const id = await upsertEtudiant({ ...form, ecole_id: ecoleId });
        const created = await fetchEtudiant(id);
        if (created?.matricule) setNewMatricule(created.matricule);
        setForm(FORM_INIT);
        setShowModal(false);
        load();
      }
    } catch (err) {
      import('../../hooks/useErrorHandler').then(({ addToast }) =>
        addToast(`Erreur ${editingId ? 'modification' : 'création'} : ${err instanceof Error ? err.message : 'Inconnue'}`, 'error')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleField = (k: keyof EtudiantCreatePayload, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const openModal = () => {
    setForm(FORM_INIT);
    setEditingId(null);
    setNewMatricule(null);
    setShowModal(true);
  };

  const openEditModal = (e: Etudiant) => {
    setForm({
      nom: e.nom, prenom: e.prenom, sexe: e.sexe ?? 'M',
      email_auth: e.email_auth ?? '', filiere: e.filiere ?? '', niveau: e.niveau ?? 'L1',
      date_naissance: e.date_naissance ?? '', lieu_naissance: e.lieu_naissance ?? '',
      telephone_parent: e.telephone_parent ?? '', email_parent: e.email_parent ?? '',
      adresse: e.adresse ?? '', statut: e.statut,
    });
    setEditingId(e.id);
    setNewMatricule(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
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
            {loading ? '…' : `${total} étudiant${total > 1 ? 's' : ''} enregistré${total > 1 ? 's' : ''}`}
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
        <Suspense fallback={
          <div style={S.overlay}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={S.spinner} />
              <span style={{ fontSize: 13, color: '#64748b' }}>Chargement du module d'import…</span>
            </div>
          </div>
        }>
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
        </Suspense>
      )}

      {/* ── Modal création étudiant ── */}
      {showModal && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={S.modal}>
            {/* En-tête modal */}
            <div style={S.modalHeader}>
              <div>
                <div style={S.modalTitle}>{editingId ? `✏️ Modifier ${form.nom} ${form.prenom}` : '+ Nouvel étudiant'}</div>
                <div style={S.modalSub}>
                  {editingId ? "Modifiez les informations de l'étudiant" : "Le matricule sera généré automatiquement à l'enregistrement"}
                </div>
              </div>
              <button style={S.closeBtn} onClick={() => closeModal()}>✕</button>
            </div>

            {/* Corps modal */}
            <div style={S.modalBody}>

              {/* Bloc identité */}
              <div style={S.section}>
                <div style={S.sectionTitle}>👤 Identité</div>
                <div style={S.formGrid}>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-nom">Nom <span style={S.req}>*</span></label>
                    <input style={S.input} id="etu-nom" name="nom" autoComplete="off"
                      value={form.nom}
                      onChange={e => handleField('nom', e.target.value.toUpperCase())}
                      placeholder="KPADONOU"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-prenom">Prénom <span style={S.req}>*</span></label>
                    <input style={S.input} id="etu-prenom" name="prenom" autoComplete="off"
                      value={form.prenom}
                      onChange={e => handleField('prenom', e.target.value)}
                      placeholder="Fidèle"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-sexe">Sexe</label>
                    <select style={S.input} id="etu-sexe" name="sexe" value={form.sexe} onChange={e => handleField('sexe', e.target.value)}>
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-date-naissance">Date de naissance</label>
                    <input style={S.input} id="etu-date-naissance" name="date_naissance" type="date"
                      value={form.date_naissance}
                      onChange={e => handleField('date_naissance', e.target.value)}
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-lieu-naissance">Lieu de naissance</label>
                    <input style={S.input} id="etu-lieu-naissance" name="lieu_naissance" autoComplete="off"
                      value={form.lieu_naissance}
                      onChange={e => handleField('lieu_naissance', e.target.value)}
                      placeholder="Cotonou"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-adresse">Adresse</label>
                    <input style={S.input} id="etu-adresse" name="adresse" autoComplete="off"
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
                    <label style={S.label} htmlFor="etu-filiere">Filière <span style={S.req}>*</span></label>
                    <select style={S.input} id="etu-filiere" name="filiere" value={form.filiere} onChange={e => handleField('filiere', e.target.value)}>
                      <option value="">— Choisir —</option>
                      {FILIERES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-niveau">Niveau</label>
                    <select style={S.input} id="etu-niveau" name="niveau" value={form.niveau} onChange={e => handleField('niveau', e.target.value)}>
                      {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-email">Email étudiant</label>
                    <input style={S.input} id="etu-email" name="email_auth" type="email" autoComplete="off"
                      value={form.email_auth}
                      onChange={e => handleField('email_auth', e.target.value.toLowerCase())}
                      placeholder="etudiant@email.com"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-statut">Statut</label>
                    <select style={S.input} id="etu-statut" name="statut" value={form.statut} onChange={e => handleField('statut', e.target.value)}>
                      <option value="actif">Actif</option>
                      <option value="inactif">Inactif</option>
                      <option value="diplome">Diplômé</option>
                      <option value="abandonne">Abandon</option>
                    </select>
                  </div>
                </div>

                {/* Aperçu matricule (creation uniquement — inchange en edition) */}
                {!editingId && (
                  <div style={S.matriculePreview}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Matricule généré automatiquement :</span>
                    <code style={S.matriculeCode}>
                      {form.filiere
                        ? `HEMEC / #### / ${form.filiere.replace(/\s+/g,'').slice(0,4).toUpperCase()} / ${new Date().getFullYear()}`
                        : 'HEMEC / #### / ???? / ' + new Date().getFullYear()
                      }
                    </code>
                  </div>
                )}
              </div>

              {/* Bloc contact parent */}
              <div style={S.section}>
                <div style={S.sectionTitle}>👨‍👩‍👦 Contact parent / tuteur</div>
                <div style={S.formGrid}>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-tel-parent">Téléphone parent</label>
                    <input style={S.input} id="etu-tel-parent" name="telephone_parent" autoComplete="off"
                      value={form.telephone_parent}
                      onChange={e => handleField('telephone_parent', e.target.value)}
                      placeholder="+229 97 00 00 00"
                    />
                  </div>
                  <div style={S.field}>
                    <label style={S.label} htmlFor="etu-email-parent">Email parent</label>
                    <input style={S.input} id="etu-email-parent" name="email_parent" type="email" autoComplete="off"
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
                <button style={S.btnSecondary} onClick={() => closeModal()} disabled={saving}>
                  Annuler
                </button>
                <button style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? '⏳ Enregistrement…' : (editingId ? '✅ Enregistrer les modifications' : '✅ Créer l\'étudiant')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filtres ── */}
      <div style={S.filters}>
        <label htmlFor="etudiants-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Rechercher un étudiant</label>
        <input
          type="text"
          id="etudiants-search"
          name="etudiants-search"
          autoComplete="off"
          placeholder="🔍 Rechercher par nom, prénom, matricule…"
          value={searchInput}
          onChange={e => handleSearchChange(e.target.value)}
          style={S.filterInput}
        />
        <label htmlFor="etudiants-filter-niveau" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Filtrer par niveau</label>
        <select
          id="etudiants-filter-niveau"
          name="etudiants-filter-niveau"
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
      ) : etudiants.length === 0 ? (
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
          <ResponsiveTable<Etudiant>
            columns={etudiantColumns}
            data={etudiants}
            keyExtractor={e => e.id}
            actions={e => (
              <>
                <button style={S.btnGhost} onClick={() => setFicheId(e.id)}>Fiche</button>
                <button style={S.btnGhost} onClick={() => openEditModal(e)}>✏️ Modifier</button>
                <button style={{ ...S.btnGhost, color: '#dc2626' }} onClick={() => handleDelete(e.id, `${e.nom} ${e.prenom}`)}>🗑️</button>
              </>
            )}
          />
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && total > PAGE_SIZE && (
        <div style={S.pagination}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} sur {total} étudiant{total > 1 ? 's' : ''}
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


