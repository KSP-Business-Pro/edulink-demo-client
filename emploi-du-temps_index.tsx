// src/modules/emploi-du-temps/index.tsx
// Module Emploi du temps — B3.2
// Vue calendrier hebdomadaire + vue liste avec toggle

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import {
  fetchSeances, fetchEnseignants, fetchSemestres, deleteSeance,
  getLundiDeSemaine, formatDateISO,
  type Seance, type EnseignantOption, type SemestreOption,
} from './emploi-du-temps.service';
import { VueCalendrier } from './components/VueCalendrier';
import { VueListe }      from './components/VueListe';
import { ModalSeance }   from './components/ModalSeance';

type VueMode = 'calendrier' | 'liste';

export default function EmploiDuTempsPage() {
  const { user } = useAuth();
  const { error, loading, run, runAction } = useErrorHandler();

  const ecoleId = user?.ecole_id ?? '';

  const [seances,       setSeances]       = useState<Seance[]>([]);
  const [enseignants,   setEnseignants]   = useState<EnseignantOption[]>([]);
  const [semestres,     setSemestres]     = useState<SemestreOption[]>([]);
  const [vue,           setVue]           = useState<VueMode>('calendrier');
  const [semaine,       setSemaine]       = useState<Date>(new Date());
  const [filterSem,     setFilterSem]     = useState('');
  const [filterType,    setFilterType]    = useState('');
  const [modalSeance,   setModalSeance]   = useState<Partial<Seance> | null | false>(false);
  // false = fermé, null = nouveau, objet = édition

  // ── Chargement ────────────────────────────────────────────────────────────
  const load = async () => {
    if (!ecoleId) return;
    const [s, ens, sem] = await Promise.all([
      run(() => fetchSeances(ecoleId), { context: 'Chargement emploi du temps', inline: true }),
      fetchEnseignants(ecoleId).catch(() => [] as EnseignantOption[]),
      fetchSemestres(ecoleId).catch(() => [] as SemestreOption[]),
    ]);
    if (s) setSeances(s);
    setEnseignants(ens);
    setSemestres(sem);
  };

  useEffect(() => { if (ecoleId) load(); }, [ecoleId]);

  // ── Filtres ───────────────────────────────────────────────────────────────
  const seancesFiltrees = useMemo(() => {
    let l = seances;
    if (filterSem)  l = l.filter(s => s.semestre_id  === filterSem);
    if (filterType) l = l.filter(s => s.type_seance  === filterType);
    if (vue === 'calendrier') {
      // Filtrer par semaine courante
      const lundi  = getLundiDeSemaine(semaine);
      const samedi = new Date(lundi); samedi.setDate(lundi.getDate() + 5);
      const dLundi  = formatDateISO(lundi);
      const dSamedi = formatDateISO(samedi);
      l = l.filter(s => s.date_seance >= dLundi && s.date_seance <= dSamedi);
    }
    return l;
  }, [seances, filterSem, filterType, vue, semaine]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total:   seances.length,
    cm:      seances.filter(s => s.type_seance === 'CM').length,
    td:      seances.filter(s => s.type_seance === 'TD').length,
    tp:      seances.filter(s => s.type_seance === 'TP').length,
    examens: seances.filter(s => ['examen','examen_final','partiel','devoir_surveille'].includes(s.type_seance)).length,
  }), [seances]);

  // ── Suppression ───────────────────────────────────────────────────────────
  const handleDelete = async (s: Seance) => {
    if (!confirm(`Supprimer la séance "${s.matiere_nom ?? 'cette séance'}" du ${s.date_seance} ?`)) return;
    const ok = await runAction(() => deleteSeance(s.id), 'Suppression séance');
    if (ok !== null) setSeances(prev => prev.filter(x => x.id !== s.id));
  };

  // ── Clic créneau calendrier → ouvre modal avec date/heure pré-remplies ────
  const handleClickCreneau = (date: string, heure: string) => {
    const heureFinH = String(Math.min(parseInt(heure) + 2, 20)).padStart(2, '0');
    setModalSeance({
      date_seance:  date,
      heure_debut:  heure,
      heure_fin:    `${heureFinH}:00`,
      semestre_id:  filterSem || undefined,
    });
  };

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>📅 Emploi du temps</h1>
          <p style={S.sub}>
            {loading ? '…' : `${seances.length} séance${seances.length > 1 ? 's' : ''} planifiée${seances.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Toggle vue */}
          <div style={S.toggleWrap}>
            <button
              style={{ ...S.toggleBtn, ...(vue === 'calendrier' ? S.toggleActive : {}) }}
              onClick={() => setVue('calendrier')}
            >
              📆 Calendrier
            </button>
            <button
              style={{ ...S.toggleBtn, ...(vue === 'liste' ? S.toggleActive : {}) }}
              onClick={() => setVue('liste')}
            >
              📋 Liste
            </button>
          </div>
          <button style={S.btnPrimary} onClick={() => setModalSeance(null)}>
            + Nouvelle séance
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={S.kpiGrid}>
        {[
          { label: 'Total',   val: kpis.total,   bg: '#f8fafc', color: '#1e293b' },
          { label: 'CM',      val: kpis.cm,       bg: '#dbeafe', color: '#1d4ed8' },
          { label: 'TD',      val: kpis.td,       bg: '#dcfce7', color: '#15803d' },
          { label: 'TP',      val: kpis.tp,       bg: '#fed7aa', color: '#c2410c' },
          { label: 'Examens', val: kpis.examens,  bg: '#fee2e2', color: '#b91c1c' },
        ].map(({ label, val, bg, color }) => (
          <div key={label} style={{ ...S.kpiCard, background: bg }}>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Filtres ── */}
      <div style={S.filters}>
        <label htmlFor="edt-filter-semestre" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Filtrer par semestre</label>
        <select id="edt-filter-semestre" name="semestre" style={S.filterInput} value={filterSem} onChange={e => setFilterSem(e.target.value)}>
          <option value="">Tous les semestres</option>
          {semestres.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
        </select>
        <label htmlFor="edt-filter-type" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Filtrer par type de séance</label>
        <select id="edt-filter-type" name="type" style={{ ...S.filterInput, maxWidth: 180 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous les types</option>
          {(['CM','TD','TP','devoir_surveille','partiel','examen_final','examen','rattrapage','expose','projet','autre'] as const).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {(filterSem || filterType) && (
          <button style={S.btnGhost} onClick={() => { setFilterSem(''); setFilterType(''); }}>
            ✕ Réinitialiser
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {seancesFiltrees.length} séance{seancesFiltrees.length > 1 ? 's' : ''} affichée{seancesFiltrees.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Erreur ── */}
      {error && (
        <div style={S.errorBanner}>
          {error}
          <button style={S.retryBtn} onClick={load}>🔄 Réessayer</button>
        </div>
      )}

      {/* ── Contenu principal ── */}
      {loading ? (
        <div style={S.centered}>
          <div style={S.spinner} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : seances.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
          <p>Aucune séance planifiée</p>
          <button style={{ ...S.btnPrimary, marginTop: 12 }} onClick={() => setModalSeance(null)}>
            + Créer la première séance
          </button>
        </div>
      ) : vue === 'calendrier' ? (
        <VueCalendrier
          seances={seancesFiltrees}
          semaineCourante={semaine}
          onPrevSemaine={() => setSemaine(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
          onNextSemaine={() => setSemaine(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
          onClickSeance={s => setModalSeance(s)}
          onClickCreneau={handleClickCreneau}
        />
      ) : (
        <VueListe
          seances={seancesFiltrees}
          onClickSeance={s => setModalSeance(s)}
          onDelete={handleDelete}
        />
      )}

      {/* ── Modal séance ── */}
      {modalSeance !== false && (
        <ModalSeance
          ecoleId={ecoleId}
          seance={modalSeance}
          semestres={semestres}
          enseignants={enseignants}
          onClose={() => setModalSeance(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const S = {
  page:        { padding: '1.5rem 2rem', maxWidth: 1300, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' } as React.CSSProperties,
  h1:          { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:         { fontSize: 13, color: '#64748b', margin: '2px 0 0' } as React.CSSProperties,
  kpiGrid:     { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: '1rem' } as React.CSSProperties,
  kpiCard:     { borderRadius: 10, padding: '0.75rem 1rem', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 3, textAlign: 'center' as const },
  filters:     { display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' as const, alignItems: 'center' },
  filterInput: { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', flex: 1, minWidth: 160, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  errorBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fef2f2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid #fecaca' } as React.CSSProperties,
  retryBtn:    { padding: '5px 12px', background: '#fff', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#dc2626', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  centered:    { display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 } as React.CSSProperties,
  spinner:     { width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  empty:       { textAlign: 'center' as const, padding: '3rem', color: '#94a3b8', fontSize: 14 },
  toggleWrap:  { display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' },
  toggleBtn:   { padding: '7px 14px', background: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' } as React.CSSProperties,
  toggleActive:{ background: '#1e3a5f', color: '#fff' } as React.CSSProperties,
  btnPrimary:  { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnGhost:    { padding: '7px 12px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
};
