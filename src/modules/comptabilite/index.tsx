// src/modules/comptabilite/index.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import type { EtudiantCompta, TypeFrais, StatutFacture } from '../../services/comptabilite.service';
import { fetchFactures, grouperParEtudiant, fmt, RUBRIQUE_LABELS, RUBRIQUE_COLORS } from '../../services/comptabilite.service';
import ModalFicheComptable from './components/ModalFicheComptable';
import { ModalFacture, ModalFactureMasse } from './components/ModalFacture';
import ModalFactureGrille from './components/ModalFactureGrille';
import CaisseJournaliere from './components/CaisseJournaliere';
import Recouvrement from './components/Recouvrement';
import Pilotage from './components/Pilotage';
import ResponsiveTable, { type RTColumn } from '../../components/ResponsiveTable';
import ParametrageFinancier from './components/ParametrageFinancier';

interface EcoleOption { id: string; nom: string }

const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};

const STATUT_COLOR: Record<string, string> = { paye: 'green', partiel: 'amber', en_attente: 'red' };

function statutDe(e: EtudiantCompta): 'paye' | 'partiel' | 'en_attente' {
  const restant = e.attendu - e.encaisse;
  const taux    = e.attendu > 0 ? Math.round(e.encaisse / e.attendu * 100) : 0;
  return restant <= 0 ? 'paye' : taux > 0 ? 'partiel' : 'en_attente';
}

const comptaColumns: RTColumn<EtudiantCompta>[] = [
  {
    key: 'etudiant',
    label: 'Étudiant',
    primary: true,
    render: e => (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{e.etudiant?.nom} {e.etudiant?.prenom}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{e.etudiant?.matricule ?? '—'}</div>
      </div>
    ),
  },
  {
    key: 'filiere',
    label: 'Filière / Niveau',
    render: e => (
      <div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{e.etudiant?.filiere ?? '—'}</div>
        {e.etudiant?.niveau && <span className="badge blue" style={{ fontSize: 10 }}>{e.etudiant.niveau}</span>}
      </div>
    ),
  },
  {
    key: 'attendu',
    label: 'Attendu',
    render: e => <span style={{ fontWeight: 600, fontSize: 13 }}>{fmt(e.attendu)}</span>,
  },
  {
    key: 'encaisse',
    label: 'Encaissé',
    render: e => <span style={{ fontWeight: 600, fontSize: 13, color: '#059669' }}>{fmt(e.encaisse)}</span>,
  },
  {
    key: 'reste',
    label: 'Reste',
    render: e => {
      const restant = e.attendu - e.encaisse;
      return <span style={{ fontWeight: 600, fontSize: 13, color: restant > 0 ? '#dc2626' : '#059669' }}>{fmt(restant)}</span>;
    },
  },
  {
    key: 'echeance',
    label: 'Échéance',
    render: e => {
      const prochaineEch = e.factures
        .filter(f => f.date_echeance)
        .sort((a, b) => new Date(a.date_echeance!).getTime() - new Date(b.date_echeance!).getTime())[0]?.date_echeance;
      return <span style={{ fontSize: 11, color: '#6b7280' }}>{prochaineEch ? new Date(prochaineEch).toLocaleDateString('fr-FR') : '—'}</span>;
    },
  },
  {
    key: 'statut',
    label: 'Statut',
    render: e => {
      const statut = statutDe(e);
      const taux   = e.attendu > 0 ? Math.round(e.encaisse / e.attendu * 100) : 0;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span className={`badge ${STATUT_COLOR[statut] ?? 'gray'}`}>{statut}</span>
          <div style={{ width: 60, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${taux}%`, background: statut === 'paye' ? '#059669' : statut === 'partiel' ? '#d97706' : '#dc2626', borderRadius: 2 }} />
          </div>
        </div>
      );
    },
  },
];

export default function ComptabilitePage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);
  const [tab, setTab]         = useState<'facturation' | 'caisse' | 'recouvrement' | 'pilotage' | 'parametrage'>('facturation');

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [etudiantsList, setEtudiantsList] = useState<EtudiantCompta[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [filterRub, setFilterRub]   = useState<TypeFrais | ''>('');
  const [filterStatut, setFilterStatut] = useState<StatutFacture | ''>('');

  // Modals
  const [ficheModal, setFicheModal]   = useState<{ id: string; nom: string } | null>(null);
  const [factureModal, setFactureModal] = useState(false);
  const [masseModal, setMasseModal]   = useState(false);
  const [grilleModal, setGrilleModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const factures = await fetchFactures(ecoleId);
      setEtudiantsList(grouperParEtudiant(factures));
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  // ── Statistiques globales ──────────────────────────────────────────────────
  const allFactures = useMemo(() => etudiantsList.flatMap(e => e.factures), [etudiantsList]);
  const totalAttendu  = allFactures.reduce((s, f) => s + (f.montant_total || f.montant || 0), 0);
  const totalEncaisse = allFactures.reduce((s, f) => s + (f.montant_paye || 0), 0);
  const totalRestant  = totalAttendu - totalEncaisse;
  const tauxRecouv    = totalAttendu > 0 ? Math.round(totalEncaisse / totalAttendu * 100) : 0;

  // Répartition par rubrique
  const rubriques = useMemo(() => {
    const map: Record<string, { attendu: number; encaisse: number; count: number }> = {};
    allFactures.forEach(f => {
      const r = f.type_frais || 'autre';
      if (!map[r]) map[r] = { attendu: 0, encaisse: 0, count: 0 };
      map[r].attendu   += f.montant_total || f.montant || 0;
      map[r].encaisse  += f.montant_paye || 0;
      map[r].count++;
    });
    return map;
  }, [allFactures]);

  // ── Filtrage ──────────────────────────────────────────────────────────────────
  const listeFiltrée = useMemo(() => {
    let liste = etudiantsList;
    if (search) {
      const s = search.toLowerCase();
      liste = liste.filter(e =>
        `${e.etudiant?.nom} ${e.etudiant?.prenom} ${e.etudiant?.matricule ?? ''}`.toLowerCase().includes(s)
      );
    }
    if (filterRub) {
      liste = liste
        .map(e => {
          const facs = e.factures.filter(f => f.type_frais === filterRub);
          if (!facs.length) return null;
          const att = facs.reduce((s, f) => s + (f.montant_total || f.montant || 0), 0);
          const enc = facs.reduce((s, f) => s + (f.montant_paye || 0), 0);
          return { ...e, factures: facs, attendu: att, encaisse: enc };
        })
        .filter(Boolean) as EtudiantCompta[];
    }
    if (filterStatut === 'en_attente') liste = liste.filter(e => e.encaisse === 0 && e.attendu > 0);
    else if (filterStatut === 'partiel') liste = liste.filter(e => e.encaisse > 0 && e.encaisse < e.attendu);
    else if (filterStatut === 'paye')    liste = liste.filter(e => e.encaisse >= e.attendu && e.attendu > 0);
    return liste;
  }, [etudiantsList, search, filterRub, filterStatut]);

  const toastBg = { success: '#059669', error: '#dc2626', info: '#1e3a5f' };
  const tauxColor = tauxRecouv >= 80 ? '#059669' : tauxRecouv >= 50 ? '#d97706' : '#dc2626';

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
          <h2>Comptabilité</h2>
          <div className="page-subtitle">Facturation · paiements · recouvrement</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <>
              <label htmlFor="compta-ecole" style={SR_ONLY}>École</label>
              <select id="compta-ecole" name="ecole" value={ecoleId} onChange={e => setEcoleId(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </>
          )}
          <button onClick={() => setMasseModal(true)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: tab === 'facturation' ? 'inline-block' : 'none' }}>
            📋 Facturer une promotion
          </button>
          {tab === 'facturation' && (
            <button onClick={() => setGrilleModal(true)} style={{ background: '#eef2ff', color: '#4338ca', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              🧮 Facturer depuis une grille
            </button>
          )}
          {tab === 'facturation' && <button className="btn-blue" onClick={() => setFactureModal(true)}>+ Facture</button>}
        </div>
      </div>

      {/* Onglets */}
      <div className="tabs" style={{ marginBottom: '1.25rem' }}>
        <button className={`tab${tab === 'facturation' ? ' active' : ''}`} onClick={() => setTab('facturation')}>Facturation</button>
        <button className={`tab${tab === 'caisse' ? ' active' : ''}`} onClick={() => setTab('caisse')}>💰 Caisse du jour</button>
        <button className={`tab${tab === 'recouvrement' ? ' active' : ''}`} onClick={() => setTab('recouvrement')}>🔴 Recouvrement</button>
        <button className={`tab${tab === 'pilotage' ? ' active' : ''}`} onClick={() => setTab('pilotage')}>📊 Pilotage</button>
        <button className={`tab${tab === 'parametrage' ? ' active' : ''}`} onClick={() => setTab('parametrage')}>⚙ Paramétrage financier</button>
      </div>

      {tab === 'caisse' && ecoleId && <CaisseJournaliere ecoleId={ecoleId} />}
      {tab === 'recouvrement' && ecoleId && <Recouvrement ecoleId={ecoleId} />}
      {tab === 'pilotage' && ecoleId && <Pilotage ecoleId={ecoleId} />}

      {tab === 'parametrage' && ecoleId && <ParametrageFinancier ecoleId={ecoleId} />}

      {tab === 'facturation' && (
        loading ? <div className="loading">Chargement…</div> : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="c-ico">💰</div>
              <div className="c-val" style={{ fontSize: 18 }}>{fmt(totalAttendu)}</div>
              <div className="c-lbl">Total attendu</div>
              <div className="c-sub">{allFactures.length} factures</div>
            </div>
            <div className="card">
              <div className="c-ico">✅</div>
              <div className="c-val" style={{ fontSize: 18, color: '#059669' }}>{fmt(totalEncaisse)}</div>
              <div className="c-lbl">Total encaissé</div>
              <div className="c-sub">{tauxRecouv}% de recouvrement</div>
            </div>
            <div className="card">
              <div className="c-ico">⏳</div>
              <div className="c-val" style={{ fontSize: 18, color: totalRestant > 0 ? '#dc2626' : '#059669' }}>{fmt(totalRestant)}</div>
              <div className="c-lbl">Reste à recouvrer</div>
              <div className="c-sub">{etudiantsList.filter(e => e.attendu > e.encaisse).length} étudiants débiteurs</div>
            </div>
            <div className="card">
              <div className="c-ico">📊</div>
              <div className="c-val" style={{ color: tauxColor }}>{tauxRecouv}%</div>
              <div className="c-lbl">Taux de recouvrement</div>
              <div style={{ marginTop: '.5rem', height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${tauxRecouv}%`, background: tauxColor, borderRadius: 3, transition: 'width .5s' }} />
              </div>
            </div>
          </div>

          {/* Grille : Rubriques + Top impayés */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {/* Répartition par rubrique */}
            <div className="card" style={{ padding: '1.2rem' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '1rem' }}>📂 Répartition par rubrique</div>
              {Object.entries(rubriques).map(([code, r]) => {
                const taux = r.attendu > 0 ? Math.round(r.encaisse / r.attendu * 100) : 0;
                const color = RUBRIQUE_COLORS[code as TypeFrais] ?? 'gray';
                return (
                  <div key={code} style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <span className={`badge ${color}`}>{RUBRIQUE_LABELS[code as TypeFrais] ?? code}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{r.count} facture{r.count > 1 ? 's' : ''}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{taux}%</span>
                    </div>
                    <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${taux}%`, background: '#1e3a5f', borderRadius: 3 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 11, color: '#9ca3af' }}>
                      <span>Encaissé : {fmt(r.encaisse)}</span>
                      <span>Attendu : {fmt(r.attendu)}</span>
                    </div>
                  </div>
                );
              })}
              {Object.keys(rubriques).length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>Aucune facture</p>}
            </div>

            {/* Top impayés */}
            <div className="card" style={{ padding: '1.2rem' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: '1rem' }}>🔴 Soldes impayés</div>
              {etudiantsList.filter(e => e.attendu > e.encaisse).length === 0
                ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Aucun impayé 🎉</p>
                : etudiantsList.filter(e => e.attendu > e.encaisse).slice(0, 8).map(e => {
                    const restant = e.attendu - e.encaisse;
                    const taux    = Math.round(e.encaisse / e.attendu * 100);
                    return (
                      <div key={e.etudiant?.id} onClick={() => setFicheModal({ id: e.etudiant!.id, nom: `${e.etudiant!.nom} ${e.etudiant!.prenom}` })}
                        style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem', background: '#fff', borderRadius: 8, marginBottom: '.4rem', border: '1px solid #fee2e2', cursor: 'pointer' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.etudiant?.nom} {e.etudiant?.prenom}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{e.etudiant?.matricule ?? '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{fmt(restant)}</div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{taux}% payé</div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>

          {/* Filtres */}
          <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <label htmlFor="compta-search" style={SR_ONLY}>Rechercher une facture</label>
            <input type="search" id="compta-search" name="search" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher…" style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', minWidth: 180 }} />
            <label htmlFor="compta-rubrique" style={SR_ONLY}>Filtrer par rubrique</label>
            <select id="compta-rubrique" name="rubrique" value={filterRub} onChange={e => setFilterRub(e.target.value as TypeFrais | '')}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }}>
              <option value="">Toutes rubriques</option>
              {(Object.keys(RUBRIQUE_LABELS) as TypeFrais[]).map(k => <option key={k} value={k}>{RUBRIQUE_LABELS[k]}</option>)}
            </select>
            <label htmlFor="compta-statut" style={SR_ONLY}>Filtrer par statut</label>
            <select id="compta-statut" name="statut" value={filterStatut} onChange={e => setFilterStatut(e.target.value as StatutFacture | '')}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }}>
              <option value="">Tous statuts</option>
              <option value="en_attente">Impayé</option>
              <option value="partiel">Partiel</option>
              <option value="paye">Payé</option>
            </select>
          </div>

          {/* Tableau */}
          {listeFiltrée.length === 0
            ? <div className="empty-state"><div className="es-ico">💳</div><h3>Aucune facture</h3></div>
            : (
              <div className="table-wrap">
                <ResponsiveTable<EtudiantCompta>
                  columns={comptaColumns}
                  data={listeFiltrée}
                  keyExtractor={e => e.etudiant?.id ?? Math.random().toString()}
                  actions={e => (
                    <button className="btn-ghost btn-sm"
                      onClick={() => setFicheModal({ id: e.etudiant!.id, nom: `${e.etudiant!.nom} ${e.etudiant!.prenom}` })}>
                      Fiche
                    </button>
                  )}
                />
              </div>
            )
          }
        </>
        )
      )}

      {/* Modals */}
      {ficheModal && (
        <ModalFicheComptable
          etudiantId={ficheModal.id} nom={ficheModal.nom}
          onClose={() => setFicheModal(null)} onRefresh={load}
        />
      )}
      {factureModal && (
        <ModalFacture ecoleId={ecoleId}
          onClose={() => setFactureModal(false)}
          onSaved={() => { load(); showToast('Facture créée ✓'); }}
        />
      )}
      {grilleModal && (
        <ModalFactureGrille ecoleId={ecoleId}
          onClose={() => setGrilleModal(false)}
          onSaved={(ok, skip) => { load(); showToast(`${ok} facture${ok > 1 ? 's' : ''} générée${ok > 1 ? 's' : ''}${skip > 0 ? ` · ${skip} déjà existante(s)` : ''} ✓`); }}
        />
      )}
      {masseModal && (
        <ModalFactureMasse ecoleId={ecoleId}
          onClose={() => setMasseModal(false)}
          onSaved={(ok, skip) => {
            load();
            showToast(`${ok} facture(s) créée(s)${skip ? ` · ${skip} ignorée(s) (doublons)` : ''} ✓`, skip ? 'info' : 'success');
          }}
        />
      )}
    </div>
  );
}
