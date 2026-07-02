// src/modules/comptabilite/components/ParametrageFinancier.tsx
// Bloc 1 comptabilité — Types de frais / Grilles tarifaires / Échéanciers

import { useState, useEffect, useCallback } from 'react';
import type { Programme, AnneeAcademique, NiveauLMD } from '../../../types/referentiel.types';
import { NIVEAUX_BY_GRADE } from '../../../types/referentiel.types';
import { fetchProgrammes, fetchAnneesAcademiques } from '../../../services/referentiel.service';
import ResponsiveTable, { type RTColumn } from '../../../components/ResponsiveTable';
import {
  type TypeFraisConfig, type GrilleTarifaire, type Echeancier,
  fetchTypesFrais, upsertTypeFrais, deleteTypeFrais,
  fetchGrillesTarifaires, upsertGrilleTarifaire, deleteGrilleTarifaire,
  fetchEcheanciers, upsertEcheance, deleteEcheance, genererEcheancierStandard,
} from '../../../services/parametrage-financier.service';

interface Props {
  ecoleId: string;
}

type SousTab = 'types' | 'grilles';

const TYPE_FORM_INIT = { code: '', libelle: '', description: '', obligatoire: true, actif: true };
const GRILLE_FORM_INIT = { programme_id: '', annee_academique_id: '', niveau: '', type_frais_id: '', montant: '', obligatoire: true };

export default function ParametrageFinancier({ ecoleId }: Props) {
  const [sousTab, setSousTab] = useState<SousTab>('types');

  const [typesFrais, setTypesFrais] = useState<TypeFraisConfig[]>([]);
  const [grilles, setGrilles]       = useState<GrilleTarifaire[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [annees, setAnnees]         = useState<AnneeAcademique[]>([]);
  const [loading, setLoading]       = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Modals Types de frais ────────────────────────────────────────────────
  const [typeModal, setTypeModal] = useState<{ open: boolean; item: TypeFraisConfig | null }>({ open: false, item: null });
  const [typeForm, setTypeForm]   = useState(TYPE_FORM_INIT);
  const [savingType, setSavingType] = useState(false);

  // ── Modals Grilles tarifaires ────────────────────────────────────────────
  const [grilleModal, setGrilleModal] = useState<{ open: boolean; item: GrilleTarifaire | null }>({ open: false, item: null });
  const [grilleForm, setGrilleForm]   = useState(GRILLE_FORM_INIT);
  const [savingGrille, setSavingGrille] = useState(false);

  // ── Modal Échéancier (par grille) ────────────────────────────────────────
  const [echeancierModal, setEcheancierModal] = useState<GrilleTarifaire | null>(null);
  const [echeances, setEcheances]             = useState<Echeancier[]>([]);
  const [loadingEch, setLoadingEch]           = useState(false);
  const [echForm, setEchForm] = useState({ tranche: '', pourcentage: '', montant: '', date_echeance: '' });

  // ── Chargement ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const [tf, gr, progs, ans] = await Promise.all([
        fetchTypesFrais(ecoleId),
        fetchGrillesTarifaires(ecoleId),
        fetchProgrammes(ecoleId),
        fetchAnneesAcademiques(ecoleId),
      ]);
      setTypesFrais(tf); setGrilles(gr); setProgrammes(progs); setAnnees(ans);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur de chargement', 'error');
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  // ── Types de frais : CRUD ────────────────────────────────────────────────
  function openCreateType() { setTypeForm(TYPE_FORM_INIT); setTypeModal({ open: true, item: null }); }
  function openEditType(t: TypeFraisConfig) {
    setTypeForm({ code: t.code, libelle: t.libelle, description: t.description ?? '', obligatoire: t.obligatoire, actif: t.actif });
    setTypeModal({ open: true, item: t });
  }
  async function saveType(e: React.FormEvent) {
    e.preventDefault(); setSavingType(true);
    try {
      await upsertTypeFrais({
        id: typeModal.item?.id, ecole_id: ecoleId,
        code: typeForm.code.trim().toUpperCase(), libelle: typeForm.libelle.trim(),
        description: typeForm.description.trim() || null,
        obligatoire: typeForm.obligatoire, actif: typeForm.actif,
      });
      setTypeModal({ open: false, item: null }); await load();
      showToast(typeModal.item ? 'Type de frais modifié ✓' : 'Type de frais créé ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setSavingType(false); }
  }
  async function removeType(t: TypeFraisConfig) {
    if (!confirm(`Supprimer le type de frais "${t.libelle}" ?`)) return;
    try { await deleteTypeFrais(t.id); await load(); showToast('Type de frais supprimé'); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  // ── Grilles tarifaires : CRUD ────────────────────────────────────────────
  function openCreateGrille() { setGrilleForm(GRILLE_FORM_INIT); setGrilleModal({ open: true, item: null }); }
  function openEditGrille(g: GrilleTarifaire) {
    setGrilleForm({
      programme_id: g.programme_id ?? '', annee_academique_id: g.annee_academique_id ?? '',
      niveau: g.niveau ?? '', type_frais_id: g.type_frais_id,
      montant: String(g.montant), obligatoire: g.obligatoire,
    });
    setGrilleModal({ open: true, item: g });
  }
  const progSelectionne = programmes.find(p => p.id === grilleForm.programme_id);
  const niveauxDispo: NiveauLMD[] = progSelectionne ? NIVEAUX_BY_GRADE[progSelectionne.grade] ?? [] : [];

  async function saveGrille(e: React.FormEvent) {
    e.preventDefault(); setSavingGrille(true);
    try {
      await upsertGrilleTarifaire({
        id: grilleModal.item?.id, ecole_id: ecoleId,
        annee_academique_id: grilleForm.annee_academique_id || null,
        programme_id: grilleForm.programme_id || null,
        niveau: grilleForm.niveau || null,
        type_frais_id: grilleForm.type_frais_id,
        montant: parseFloat(grilleForm.montant) || 0,
        obligatoire: grilleForm.obligatoire,
      });
      setGrilleModal({ open: false, item: null }); await load();
      showToast(grilleModal.item ? 'Grille tarifaire modifiée ✓' : 'Grille tarifaire créée ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setSavingGrille(false); }
  }
  async function removeGrille(g: GrilleTarifaire) {
    if (!confirm('Supprimer cette ligne de grille tarifaire ?\nSon échéancier associé sera aussi supprimé.')) return;
    try { await deleteGrilleTarifaire(g.id); await load(); showToast('Grille tarifaire supprimée'); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  // ── Échéancier ────────────────────────────────────────────────────────────
  async function openEcheancier(g: GrilleTarifaire) {
    setEcheancierModal(g);
    setLoadingEch(true);
    try { setEcheances(await fetchEcheanciers(g.id)); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
    finally { setLoadingEch(false); }
  }
  async function reloadEcheances() {
    if (!echeancierModal) return;
    setEcheances(await fetchEcheanciers(echeancierModal.id));
  }
  async function handleGenererStandard() {
    if (!echeancierModal) return;
    if (echeances.length > 0 && !confirm('Un échéancier existe déjà. Ajouter 3 tranches standard 40/30/30 en plus ?')) return;
    try {
      await genererEcheancierStandard(ecoleId, echeancierModal.id, echeancierModal.montant);
      await reloadEcheances(); showToast('Échéancier 40/30/30 généré ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }
  async function handleAjouterTranche(e: React.FormEvent) {
    e.preventDefault();
    if (!echeancierModal) return;
    try {
      await upsertEcheance({
        ecole_id: ecoleId, grille_tarifaire_id: echeancierModal.id,
        tranche: parseInt(echForm.tranche) || (echeances.length + 1),
        pourcentage: echForm.pourcentage ? parseFloat(echForm.pourcentage) : null,
        montant: echForm.montant ? parseFloat(echForm.montant) : null,
        date_echeance: echForm.date_echeance || null,
      });
      setEchForm({ tranche: '', pourcentage: '', montant: '', date_echeance: '' });
      await reloadEcheances(); showToast('Tranche ajoutée ✓');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }
  async function handleSupprimerTranche(id: string) {
    if (!confirm('Supprimer cette tranche ?')) return;
    try { await deleteEcheance(id); await reloadEcheances(); showToast('Tranche supprimée'); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Erreur', 'error'); }
  }

  // ── Colonnes tableaux ─────────────────────────────────────────────────────
  const typesColumns: RTColumn<TypeFraisConfig>[] = [
    { key: 'code', label: 'Code', mono: true, render: t => <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{t.code}</code> },
    { key: 'libelle', label: 'Libellé', primary: true, render: t => (
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{t.libelle}</div>
        {t.description && <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.description}</div>}
      </div>
    ) },
    { key: 'obligatoire', label: 'Obligatoire', render: t => <span className={`badge ${t.obligatoire ? 'blue' : 'gray'}`}>{t.obligatoire ? 'Oui' : 'Non'}</span> },
    { key: 'actif', label: 'Statut', render: t => <span className={`badge ${t.actif ? 'green' : 'gray'}`}>{t.actif ? 'Actif' : 'Inactif'}</span> },
  ];

  const grillesColumns: RTColumn<GrilleTarifaire>[] = [
    { key: 'type', label: 'Type de frais', primary: true, render: g => (
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{g.types_frais?.libelle ?? '—'}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{g.types_frais?.code}</div>
      </div>
    ) },
    { key: 'programme', label: 'Programme', render: g => <span style={{ fontSize: 12, color: '#6b7280' }}>{g.programmes_lmd?.intitule ?? 'Tous programmes'}</span> },
    { key: 'niveau', label: 'Niveau', render: g => g.niveau ? <span className="badge blue">{g.niveau}</span> : <span style={{ fontSize: 12, color: '#9ca3af' }}>Tous</span> },
    { key: 'annee', label: 'Année', render: g => <span style={{ fontSize: 12 }}>{g.annees_academiques?.libelle ?? '—'}</span> },
    { key: 'montant', label: 'Montant', render: g => <span style={{ fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>{g.montant.toLocaleString('fr-FR')} FCFA</span> },
    { key: 'obligatoire', label: 'Obligatoire', render: g => <span className={`badge ${g.obligatoire ? 'blue' : 'gray'}`}>{g.obligatoire ? 'Oui' : 'Non'}</span> },
  ];

  const toastBg = { success: '#059669', error: '#dc2626' };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toastBg[toast.type], color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Sous-onglets */}
      <div className="tabs" style={{ marginBottom: '1.25rem' }}>
        <button className={`tab${sousTab === 'types' ? ' active' : ''}`} onClick={() => setSousTab('types')}>Types de frais ({typesFrais.length})</button>
        <button className={`tab${sousTab === 'grilles' ? ' active' : ''}`} onClick={() => setSousTab('grilles')}>Grilles tarifaires ({grilles.length})</button>
      </div>

      {loading ? <div className="loading">Chargement…</div> : (
        <>
          {/* ── Types de frais ── */}
          {sousTab === 'types' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button className="btn-blue" onClick={openCreateType}>+ Type de frais</button>
              </div>
              {typesFrais.length === 0
                ? <div className="empty-state"><div className="es-ico">💰</div><h3>Aucun type de frais configuré</h3><p>Créez les frais applicables (inscription, scolarité, examen…)</p></div>
                : (
                  <div className="table-wrap">
                    <ResponsiveTable<TypeFraisConfig>
                      columns={typesColumns}
                      data={typesFrais}
                      keyExtractor={t => t.id}
                      actions={t => (
                        <>
                          <button className="btn-ghost btn-sm" onClick={() => openEditType(t)}>✏</button>
                          <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => removeType(t)}>🗑</button>
                        </>
                      )}
                    />
                  </div>
                )
              }
            </>
          )}

          {/* ── Grilles tarifaires ── */}
          {sousTab === 'grilles' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button className="btn-blue" onClick={openCreateGrille} disabled={typesFrais.length === 0}
                  title={typesFrais.length === 0 ? 'Créez d\'abord un type de frais' : ''}>
                  + Ligne de grille
                </button>
              </div>
              {typesFrais.length === 0 && (
                <div style={{ padding: '.75rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: '1rem', fontSize: 13, color: '#92400e' }}>
                  ⚠️ Créez d'abord au moins un type de frais dans l'onglet précédent.
                </div>
              )}
              {grilles.length === 0
                ? <div className="empty-state"><div className="es-ico">📊</div><h3>Aucune grille tarifaire</h3><p>Définissez les montants par programme, niveau et année académique</p></div>
                : (
                  <div className="table-wrap">
                    <ResponsiveTable<GrilleTarifaire>
                      columns={grillesColumns}
                      data={grilles}
                      keyExtractor={g => g.id}
                      actions={g => (
                        <>
                          <button className="btn-ghost btn-sm" onClick={() => openEcheancier(g)}>📅 Échéancier</button>
                          <button className="btn-ghost btn-sm" onClick={() => openEditGrille(g)}>✏</button>
                          <button className="btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => removeGrille(g)}>🗑</button>
                        </>
                      )}
                    />
                  </div>
                )
              }
            </>
          )}
        </>
      )}

      {/* ── Modal Type de frais ── */}
      {typeModal.open && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setTypeModal({ open: false, item: null })}>
          <div className="modal" style={{ width: 480, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {typeModal.item ? 'Modifier le type de frais' : '+ Nouveau type de frais'}
              </h3>
              <button className="btn-ghost btn-sm" onClick={() => setTypeModal({ open: false, item: null })}>✕</button>
            </div>
            <form onSubmit={saveType} autoComplete="off">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label htmlFor="tf-code">Code *</label>
                  <input id="tf-code" name="code" type="text" value={typeForm.code}
                    onChange={e => setTypeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    style={{ width: '100%', marginTop: 4, textTransform: 'uppercase' }} placeholder="ex : SCO" maxLength={10} required />
                </div>
                <div>
                  <label htmlFor="tf-libelle">Libellé *</label>
                  <input id="tf-libelle" name="libelle" type="text" value={typeForm.libelle}
                    onChange={e => setTypeForm(f => ({ ...f, libelle: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} placeholder="ex : Frais de scolarité" required />
                </div>
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="tf-description">Description</label>
                <input id="tf-description" name="description" type="text" value={typeForm.description}
                  onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} placeholder="Optionnel…" />
              </div>
              <label htmlFor="tf-obligatoire" style={{ display: 'flex', alignItems: 'center', gap: '.75rem', cursor: 'pointer', padding: '.75rem', background: '#f9fafb', borderRadius: 8, marginBottom: '.75rem' }}>
                <input id="tf-obligatoire" name="obligatoire" type="checkbox" checked={typeForm.obligatoire}
                  onChange={e => setTypeForm(f => ({ ...f, obligatoire: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', textTransform: 'none', letterSpacing: 0 }}>Frais obligatoire par défaut</div>
              </label>
              <label htmlFor="tf-actif" style={{ display: 'flex', alignItems: 'center', gap: '.75rem', cursor: 'pointer', padding: '.75rem', background: '#f9fafb', borderRadius: 8, marginBottom: '1.2rem' }}>
                <input id="tf-actif" name="actif" type="checkbox" checked={typeForm.actif}
                  onChange={e => setTypeForm(f => ({ ...f, actif: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', textTransform: 'none', letterSpacing: 0 }}>Actif (utilisable dans une grille tarifaire)</div>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setTypeModal({ open: false, item: null })}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={savingType}>{savingType ? 'Enregistrement…' : 'Enregistrer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Grille tarifaire ── */}
      {grilleModal.open && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setGrilleModal({ open: false, item: null })}>
          <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {grilleModal.item ? 'Modifier la ligne de grille' : '+ Nouvelle ligne de grille tarifaire'}
              </h3>
              <button className="btn-ghost btn-sm" onClick={() => setGrilleModal({ open: false, item: null })}>✕</button>
            </div>
            <form onSubmit={saveGrille} autoComplete="off">
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="gt-type">Type de frais *</label>
                <select id="gt-type" name="type_frais_id" value={grilleForm.type_frais_id}
                  onChange={e => setGrilleForm(f => ({ ...f, type_frais_id: e.target.value }))}
                  style={{ width: '100%', marginTop: 4 }} required>
                  <option value="">— Sélectionner —</option>
                  {typesFrais.filter(t => t.actif).map(t => <option key={t.id} value={t.id}>{t.code} — {t.libelle}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label htmlFor="gt-programme">Programme</label>
                  <select id="gt-programme" name="programme_id" value={grilleForm.programme_id}
                    onChange={e => setGrilleForm(f => ({ ...f, programme_id: e.target.value, niveau: '' }))}
                    style={{ width: '100%', marginTop: 4 }}>
                    <option value="">— Tous programmes —</option>
                    {programmes.map(p => <option key={p.id} value={p.id}>{p.intitule}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="gt-niveau">Niveau</label>
                  <select id="gt-niveau" name="niveau" value={grilleForm.niveau}
                    onChange={e => setGrilleForm(f => ({ ...f, niveau: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} disabled={!progSelectionne}>
                    <option value="">— Tous niveaux —</option>
                    {niveauxDispo.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.85rem' }}>
                <div>
                  <label htmlFor="gt-annee">Année académique</label>
                  <select id="gt-annee" name="annee_academique_id" value={grilleForm.annee_academique_id}
                    onChange={e => setGrilleForm(f => ({ ...f, annee_academique_id: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}>
                    <option value="">— Toutes années —</option>
                    {annees.map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="gt-montant">Montant (FCFA) *</label>
                  <input id="gt-montant" name="montant" type="number" value={grilleForm.montant}
                    onChange={e => setGrilleForm(f => ({ ...f, montant: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }} min={0} step={1000} placeholder="ex : 500000" required />
                </div>
              </div>
              <label htmlFor="gt-obligatoire" style={{ display: 'flex', alignItems: 'center', gap: '.75rem', cursor: 'pointer', padding: '.75rem', background: '#f9fafb', borderRadius: 8, marginBottom: '1.2rem' }}>
                <input id="gt-obligatoire" name="obligatoire" type="checkbox" checked={grilleForm.obligatoire}
                  onChange={e => setGrilleForm(f => ({ ...f, obligatoire: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', textTransform: 'none', letterSpacing: 0 }}>Obligatoire pour cette ligne</div>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setGrilleModal({ open: false, item: null })}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={savingGrille}>{savingGrille ? 'Enregistrement…' : 'Enregistrer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Échéancier ── */}
      {echeancierModal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setEcheancierModal(null)}>
          <div className="modal" style={{ width: 560, padding: '1.5rem', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>📅 Échéancier</h3>
              <button className="btn-ghost btn-sm" onClick={() => setEcheancierModal(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: '1.2rem' }}>
              {echeancierModal.types_frais?.libelle} · {echeancierModal.montant.toLocaleString('fr-FR')} FCFA
            </div>

            {loadingEch ? <div className="loading">Chargement…</div> : (
              <>
                {echeances.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                    <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: '.75rem' }}>Aucune tranche définie — paiement en une fois par défaut.</p>
                    <button className="btn-blue" onClick={handleGenererStandard}>⚡ Générer 40/30/30</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '1rem' }}>
                    {echeances.map(ec => (
                      <div key={ec.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem .85rem', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                        <span className="badge blue" style={{ flexShrink: 0 }}>Tranche {ec.tranche}</span>
                        <div style={{ flex: 1, fontSize: 12, color: '#374151' }}>
                          {ec.pourcentage != null && <>{ec.pourcentage}% </>}
                          {ec.montant != null && <strong>{ec.montant.toLocaleString('fr-FR')} FCFA</strong>}
                          {ec.date_echeance && <span style={{ color: '#9ca3af' }}> · avant le {new Date(ec.date_echeance).toLocaleDateString('fr-FR')}</span>}
                        </div>
                        <button className="btn-ghost btn-sm" style={{ color: '#dc2626', flexShrink: 0 }} onClick={() => handleSupprimerTranche(ec.id)}>🗑</button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleAjouterTranche} autoComplete="off" style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.6rem' }}>+ Ajouter une tranche</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.3fr auto', gap: '.5rem', alignItems: 'end' }}>
                    <div>
                      <label htmlFor="ech-tranche" style={{ fontSize: 10 }}>N°</label>
                      <input id="ech-tranche" name="tranche" type="number" min={1} value={echForm.tranche}
                        onChange={e => setEchForm(f => ({ ...f, tranche: e.target.value }))}
                        style={{ width: '100%', marginTop: 3 }} placeholder={String(echeances.length + 1)} />
                    </div>
                    <div>
                      <label htmlFor="ech-pct" style={{ fontSize: 10 }}>%</label>
                      <input id="ech-pct" name="pourcentage" type="number" min={0} max={100} value={echForm.pourcentage}
                        onChange={e => setEchForm(f => ({ ...f, pourcentage: e.target.value }))}
                        style={{ width: '100%', marginTop: 3 }} placeholder="40" />
                    </div>
                    <div>
                      <label htmlFor="ech-montant" style={{ fontSize: 10 }}>Montant</label>
                      <input id="ech-montant" name="montant" type="number" min={0} value={echForm.montant}
                        onChange={e => setEchForm(f => ({ ...f, montant: e.target.value }))}
                        style={{ width: '100%', marginTop: 3 }} placeholder="200000" />
                    </div>
                    <div>
                      <label htmlFor="ech-date" style={{ fontSize: 10 }}>Échéance</label>
                      <input id="ech-date" name="date_echeance" type="date" value={echForm.date_echeance}
                        onChange={e => setEchForm(f => ({ ...f, date_echeance: e.target.value }))}
                        style={{ width: '100%', marginTop: 3 }} />
                    </div>
                    <button type="submit" className="btn-blue" style={{ padding: '8px 14px' }}>+</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
