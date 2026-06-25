// src/modules/enseignants/index.tsx
// Fix TS : statut 'actif'|'inactif' aligné DB, MatiereLien corrigé, xlsx typé
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

interface Enseignant {
  id: string;
  ecole_id: string;
  nom: string;
  prenom: string | null;
  grade: string | null;
  specialite: string | null;
  email: string | null;
  telephone: string | null;
  statut: 'actif' | 'inactif';           // ← aligné sur la DB
}

// Fix erreur 161 : unites_enseignement est un objet unique (not-many), pas un tableau
interface MatiereLien {
  id: string; nom: string; code: string; coefficient: number; ue_id: string;
  unites_enseignement?: { code: string; intitule: string; credits_cect: number } | null;
}

interface EcoleOption { id: string; nom: string }

const GRADES = ['Professeur Titulaire', 'Maître de Conférences', 'Maître-Assistant', 'Prof Agrégé', 'Chargé de Cours', 'Docteur', 'Vacataire'];

const GRADE_COLOR: Record<string, string> = {
  'Professeur Titulaire': 'purple',
  'Maître de Conférences': 'blue',
  'Maître Assistant': 'teal',
  'Assistant': 'green',
  'ATER': 'gray',
  'Vacataire': 'amber',
  'Autre': 'gray',
};

interface ImportLigne {
  nom: string; prenom?: string; grade?: string; specialite?: string;
  email?: string; telephone?: string; statut?: string;
  _ok?: boolean; _err?: string;
}

// Fix erreur 199 : type pour import dynamique xlsx CDN
type XLSXModule = {
  read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (ws: unknown, opts?: { defval?: unknown }) => Record<string, string>[] };
};

export default function EnseignantsPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState('');

  // ── CRUD modal ────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  // Fix erreurs 117 + 392 : statut aligné sur 'actif'|'inactif'
  const [form, setForm] = useState({
    nom: '', prenom: '', grade: GRADES[5], specialite: '',
    email: '', telephone: '', statut: 'actif' as 'actif' | 'inactif',
  });

  // ── Modal matières ─────────────────────────────────────────────────────────
  const [matiereModal, setMatiereModal]     = useState<Enseignant | null>(null);
  const [matieres, setMatieres]             = useState<MatiereLien[]>([]);
  const [matiereLoading, setMatiereLoading] = useState(false);

  // ── Import Excel ───────────────────────────────────────────────────────────
  const [showImport, setShowImport]         = useState(false);
  const [importRows, setImportRows]         = useState<ImportLigne[] | null>(null);
  const [importParseErr, setImportParseErr] = useState<string | null>(null);
  const [importing, setImporting]           = useState(false);
  const importFileRef                       = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Chargement ─────────────────────────────────────────────────────────────
  const loadEnseignants = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('enseignants')
        .select('*')
        .eq('ecole_id', ecoleId)
        .order('nom');
      if (error) throw error;
      setEnseignants(data ?? []);
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { loadEnseignants(); }, [loadEnseignants]);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function openCreate() {
    setEditId(null);
    setForm({ nom: '', prenom: '', grade: GRADES[5], specialite: '', email: '', telephone: '', statut: 'actif' });
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(e: Enseignant) {
    setEditId(e.id);
    // Fix erreur 117 : e.statut est déjà 'actif'|'inactif' — assignation directe OK
    setForm({
      nom: e.nom,
      prenom: e.prenom ?? '',
      grade: e.grade ?? GRADES[5],
      specialite: e.specialite ?? '',
      email: e.email ?? '',
      telephone: e.telephone ?? '',
      statut: e.statut,
    });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.nom.trim()) { setFormError('Le nom est obligatoire.'); return; }
    setSaving(true); setFormError('');
    try {
      const payload = {
        ecole_id:   ecoleId,
        nom:        form.nom.trim().toUpperCase(),
        prenom:     form.prenom.trim() || null,
        grade:      form.grade || null,
        specialite: form.specialite.trim() || null,
        email:      form.email.trim() || null,
        telephone:  form.telephone.trim() || null,
        statut:     form.statut,
      };
      if (editId) {
        const { error } = await supabase.from('enseignants').update(payload).eq('id', editId);
        if (error) throw error;
        showToast('Enseignant modifié ✓');
      } else {
        const { error } = await supabase.from('enseignants').insert(payload);
        if (error) throw error;
        showToast('Enseignant créé ✓');
      }
      setModalOpen(false);
      await loadEnseignants();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally { setSaving(false); }
  }

  async function handleDelete(e: Enseignant) {
    if (!confirm(`Supprimer ${e.nom} ${e.prenom ?? ''} ?\nLes matières assignées seront désassignées.`)) return;
    try {
      await supabase.from('matieres_lmd').update({ enseignant_id: null }).eq('enseignant_id', e.id);
      const { error } = await supabase.from('enseignants').delete().eq('id', e.id);
      if (error) throw error;
      showToast('Enseignant supprimé');
      await loadEnseignants();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  // ── Modal matières ─────────────────────────────────────────────────────────
  async function openMatieres(e: Enseignant) {
    setMatiereModal(e); setMatiereLoading(true);
    // Fix erreur 161 : cast via unknown pour contourner incompatibilité Supabase générique
    const { data } = await supabase
      .from('matieres_lmd')
      .select('id,nom,code,coefficient,ue_id,unites_enseignement(code,intitule,credits_cect)')
      .eq('enseignant_id', e.id);
    setMatieres((data ?? []) as unknown as MatiereLien[]);
    setMatiereLoading(false);
  }

  // ── Import Excel ───────────────────────────────────────────────────────────
  async function handleImportFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setImportParseErr(null); setImportRows(null);
    try {
      let rows: ImportLigne[] = [];
      if (file.name.endsWith('.csv')) {
        const text  = await file.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
        const col = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));
        const iNom    = col(['nom', 'name', 'last']);
        const iPrenom = col(['prenom', 'first', 'prénom']);
        const iGrade  = col(['grade']);
        const iSpec   = col(['spec', 'special']);
        const iEmail  = col(['email', 'mail', 'courriel']);
        const iTel    = col(['tel', 'phone', 'mobile']);
        if (iNom < 0) throw new Error('Colonne "Nom" introuvable dans le CSV');
        rows = lines.slice(1).map(l => {
          const c = l.split(/[,;]/);
          return {
            nom:        c[iNom]?.trim() ?? '',
            prenom:     iPrenom >= 0 ? c[iPrenom]?.trim() : undefined,
            grade:      iGrade  >= 0 ? c[iGrade]?.trim()  : undefined,
            specialite: iSpec   >= 0 ? c[iSpec]?.trim()   : undefined,
            email:      iEmail  >= 0 ? c[iEmail]?.trim()  : undefined,
            telephone:  iTel    >= 0 ? c[iTel]?.trim()    : undefined,
          };
        }).filter(r => r.nom);
      } else {
        // Fix erreur 199 : typage explicite du module xlsx chargé dynamiquement
        let XLSX = (window as unknown as { XLSX?: XLSXModule }).XLSX;
        if (!XLSX) {
          const mod = await import(
            /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'
          ) as { default?: XLSXModule } & XLSXModule;
          XLSX = mod.default ?? mod;
        }
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        rows = data.map(row => {
          const key = (names: string[]) =>
            Object.keys(row).find(k => names.some(n => k.toLowerCase().includes(n)));
          return {
            nom:        String(row[key(['nom','name','last'])       ?? ''] ?? '').trim(),
            prenom:     String(row[key(['prenom','first','prénom']) ?? ''] ?? '').trim() || undefined,
            grade:      String(row[key(['grade'])                   ?? ''] ?? '').trim() || undefined,
            specialite: String(row[key(['spec','special'])          ?? ''] ?? '').trim() || undefined,
            email:      String(row[key(['email','mail','courriel']) ?? ''] ?? '').trim() || undefined,
            telephone:  String(row[key(['tel','phone','mobile'])    ?? ''] ?? '').trim() || undefined,
          };
        }).filter(r => r.nom);
      }
      if (!rows.length) throw new Error('Aucune ligne valide détectée');
      setImportRows(rows);
    } catch (err: unknown) {
      setImportParseErr(err instanceof Error ? err.message : 'Erreur de lecture');
    }
  }

  async function handleImport() {
    if (!importRows?.length) return;
    setImporting(true);
    let ok = 0, skip = 0;
    const results: ImportLigne[] = [];
    for (const row of importRows) {
      const gradeVal = GRADES.find(g =>
        g.toLowerCase().includes((row.grade ?? '').toLowerCase())
      ) ?? 'Vacataire';
      const { error } = await supabase.from('enseignants').insert({
        ecole_id:   ecoleId,
        nom:        row.nom.toUpperCase(),
        prenom:     row.prenom  || null,
        grade:      gradeVal,
        specialite: row.specialite || null,
        email:      row.email   || null,
        telephone:  row.telephone || null,
        statut:     'Permanent',    // ← valeur DB correcte
      });
      if (!error) { ok++; results.push({ ...row, _ok: true }); }
      else        { skip++; results.push({ ...row, _ok: false, _err: error.message }); }
    }
    setImporting(false);
    showToast(
      `${ok} enseignant(s) importé(s)${skip ? ` · ${skip} erreur(s)` : ''}`,
      skip ? 'info' : 'success'
    );
    setImportRows(results);
    if (ok > 0) await loadEnseignants();
  }

  // ── Filtrage ───────────────────────────────────────────────────────────────
  const liste = enseignants.filter(e => {
    if (!search) return true;
    const s = search.toLowerCase();
    return `${e.nom} ${e.prenom ?? ''} ${e.specialite ?? ''}`.toLowerCase().includes(s);
  });

  const toastBg = { success: '#059669', error: '#dc2626', info: '#1e3a5f' };

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* En-tête */}
      <div className="top">
        <div>
          <h2>Enseignants</h2>
          <div className="page-subtitle">Corps enseignant · matières · grades CAMES</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher…"
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: 200 }} />
          <button className="btn-ghost" onClick={() => setShowImport(true)}>⬆ Import Excel</button>
          <button className="btn-blue" onClick={openCreate}>+ Nouvel enseignant</button>
        </div>
      </div>

      {/* KPI */}
      {enseignants.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1rem' }}>
          {[
            { ico: '👨‍🏫', val: enseignants.length, lbl: 'Total' },
            { ico: '✅',  val: enseignants.filter(e => e.statut === 'actif').length, lbl: 'Actifs' },
            { ico: '🎓',  val: enseignants.filter(e => ['Professeur Titulaire','Maître de Conférences','Maître-Assistant','Prof Agrégé','Docteur','Chargé de Cours'].includes(e.grade ?? '')).length, lbl: 'Permanents' },
            { ico: '🔄',  val: enseignants.filter(e => e.grade === 'Vacataire').length, lbl: 'Vacataires' },
          ].map(({ ico, val, lbl }) => (
            <div key={lbl} className="card" style={{ padding: '.75rem' }}>
              <div className="c-ico">{ico}</div>
              <div className="c-val">{val}</div>
              <div className="c-lbl">{lbl}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="loading">Chargement…</div> : (
        liste.length === 0 ? (
          <div className="empty-state">
            <div className="es-ico">👨‍🏫</div>
            <h3>{search ? 'Aucun résultat' : 'Aucun enseignant'}</h3>
            <p>{search ? 'Modifiez votre recherche.' : 'Créez votre premier enseignant ou importez depuis Excel.'}</p>
            {!search && <button style={{ marginTop: '.75rem' }} onClick={openCreate}>+ Créer un enseignant</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Spécialité</th>
                  <th style={{ textAlign: 'center' }}>Grade</th>
                  <th>Téléphone</th>
                  <th style={{ textAlign: 'center' }}>Statut</th>
                  <th style={{ minWidth: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {liste.map(e => (
                  <tr key={e.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{e.nom}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{e.prenom ?? ''}</div>
                    </td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>{e.specialite ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {e.grade
                        ? <span className={`badge ${GRADE_COLOR[e.grade] ?? 'gray'}`}>{e.grade}</span>
                        : <span className="badge gray">—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>{e.telephone ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${e.statut === 'actif' ? 'green' : 'gray'}`}>{e.statut}</span>
                    </td>
                    <td style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 160 }}>
                      <button className="btn-ghost btn-sm" onClick={() => openMatieres(e)}>Matières</button>
                      <button className="btn-ghost btn-sm" onClick={() => openEdit(e)}>✏</button>
                      <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => handleDelete(e)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Modal CRUD ── */}
      {modalOpen && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ width: 500, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {editId ? 'Modifier enseignant' : '+ Nouvel Enseignant'}
              </h3>
              <button className="btn-ghost btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} autoComplete="off">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label>Nom *</label>
                  <input type="text" value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="NOM (majuscules)" required autoFocus />
                </div>
                <div>
                  <label>Prénom</label>
                  <input type="text" value={form.prenom}
                    onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="Prénom" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label>Grade *</label>
                  <select value={form.grade}
                    onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} required>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label>Statut *</label>
                  {/* Fix erreur 392 : cast aligné sur 'actif'|'inactif' */}
                  <select value={form.statut}
                    onChange={e => setForm(f => ({ ...f, statut: e.target.value as 'actif' | 'inactif' }))}
                    style={{ width: '100%', marginTop: 4 }} required>
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label>Spécialité</label>
                <input type="text" value={form.specialite}
                  onChange={e => setForm(f => ({ ...f, specialite: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} placeholder="ex : Comptabilité, Marketing, Droit…" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1.2rem' }}>
                <div>
                  <label>Email</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="enseignant@email.com" />
                </div>
                <div>
                  <label>Téléphone</label>
                  <input type="tel" value={form.telephone}
                    onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="+229 …" />
                </div>
              </div>
              {formError && (
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '1rem' }}>
                  {formError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={saving}>
                  {saving ? (editId ? 'Enregistrement…' : 'Création…') : (editId ? 'Enregistrer' : 'Créer →')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal matières ── */}
      {matiereModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setMatiereModal(null)}>
          <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Matières de {matiereModal.nom}</h3>
              <button className="btn-ghost btn-sm" onClick={() => setMatiereModal(null)}>✕</button>
            </div>
            {matiereLoading ? <div className="loading">Chargement…</div> :
              matieres.length === 0
                ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Aucune matière LMD assignée</p>
                : matieres.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem', background: '#f9fafb', borderRadius: 8, marginBottom: '.4rem', border: '1px solid #f3f4f6' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{m.nom}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        UE {m.unites_enseignement?.code ?? '—'} · {m.unites_enseignement?.intitule ?? '—'}
                      </div>
                    </div>
                    <span className="badge teal">{m.unites_enseignement?.credits_cect ?? 0} CECT</span>
                    <span className="badge gray">Coef. {m.coefficient}</span>
                  </div>
                ))
            }
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6', marginTop: '.5rem' }}>
              <button className="btn-secondary btn-sm" onClick={() => setMatiereModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Import Excel ── */}
      {showImport && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setShowImport(false)}>
          <div className="modal" style={{ width: 560, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Import Enseignants</h3>
              <button className="btn-ghost btn-sm" onClick={() => { setShowImport(false); setImportRows(null); setImportParseErr(null); }}>✕</button>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '.75rem', marginBottom: '1rem', fontSize: 12, color: '#374151' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Format CSV / Excel attendu :</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
                Nom | Prenom | Grade | Specialite | Email | Telephone
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
                Seul <strong>Nom</strong> est obligatoire. Grade sera mis à "Vacataire" si non reconnu.
              </div>
            </div>
            <div style={{ marginBottom: '.85rem' }}>
              <label>Fichier CSV ou Excel *</label>
              <input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImportFile}
                style={{ width: '100%', marginTop: 4 }} />
            </div>
            {importParseErr && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: '.85rem' }}>
                {importParseErr}
              </div>
            )}
            {importRows && (
              <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: '.85rem', fontSize: 12, background: '#f9fafb', borderRadius: 8, padding: '.75rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{importRows.length} ligne(s) détectée(s)</div>
                {importRows.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    {r._ok !== undefined && (
                      <span style={{ fontSize: 11, color: r._ok ? '#059669' : '#dc2626' }}>{r._ok ? '✓' : '✗'}</span>
                    )}
                    <span style={{ flex: 1, color: r._err ? '#dc2626' : '#374151' }}>
                      {r.nom} {r.prenom ?? ''} — {r.grade ?? '—'}{r._err ? ` (${r._err})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
              <button className="btn-ghost" onClick={() => { setShowImport(false); setImportRows(null); setImportParseErr(null); }}>Annuler</button>
              <button className="btn-blue" onClick={handleImport}
                disabled={!importRows?.length || importing || importRows.some(r => r._ok !== undefined)}>
                {importing ? 'Import…' : `Importer ${importRows?.filter(r => r._ok === undefined).length ?? 0} enseignant(s) →`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
