// src/modules/emploi-du-temps/components/VueCalendrier.tsx

import { useMemo } from 'react';
import {
  type Seance, TYPE_COLORS, TYPE_LABELS,
  getLundiDeSemaine, formatDateISO, heureToMinutes,
} from '../emploi-du-temps.service';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const HEURE_DEBUT  = 7;   // 07h00
const HEURE_FIN    = 20;  // 20h00
const HAUTEUR_HEURE = 60; // px par heure
const TOTAL_HEURES  = HEURE_FIN - HEURE_DEBUT;

interface Props {
  seances:      Seance[];
  semaineCourante: Date;
  onPrevSemaine:   () => void;
  onNextSemaine:   () => void;
  onClickSeance:   (s: Seance) => void;
  onClickCreneau:  (date: string, heure: string) => void;
}

export function VueCalendrier({
  seances, semaineCourante,
  onPrevSemaine, onNextSemaine,
  onClickSeance, onClickCreneau,
}: Props) {

  // Calculer les 6 jours de la semaine
  const jours = useMemo(() => {
    const lundi = getLundiDeSemaine(semaineCourante);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(lundi);
      d.setDate(d.getDate() + i);
      return { date: formatDateISO(d), label: JOURS[i], dateObj: d };
    });
  }, [semaineCourante]);

  // Index séances par date
  const seancesByDate = useMemo(() => {
    const map: Record<string, Seance[]> = {};
    seances.forEach(s => {
      if (!map[s.date_seance]) map[s.date_seance] = [];
      map[s.date_seance].push(s);
    });
    return map;
  }, [seances]);

  // Label semaine
  const lundi  = jours[0];
  const samedi = jours[5];
  const labelSemaine = `${new Date(lundi.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} — ${new Date(samedi.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;

  const aujourd_hui = formatDateISO(new Date());

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Navigation semaine */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.75rem' }}>
        <button style={S.navBtn} onClick={onPrevSemaine}>← Semaine préc.</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', flex: 1, textAlign: 'center' as const }}>
          📅 {labelSemaine}
        </span>
        <button style={S.navBtn} onClick={onNextSemaine}>Semaine suiv. →</button>
      </div>

      {/* Grille */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        {/* En-têtes jours */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(6, 1fr)', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ padding: '8px 4px', background: '#f8fafc' }} />
          {jours.map(j => {
            const isToday = j.date === aujourd_hui;
            return (
              <div key={j.date} style={{
                padding: '8px 4px', textAlign: 'center' as const,
                background: isToday ? '#eff6ff' : '#f8fafc',
                borderLeft: '1px solid #f1f5f9',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? '#1d4ed8' : '#64748b', textTransform: 'uppercase' as const }}>
                  {j.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#1d4ed8' : '#1e293b' }}>
                  {new Date(j.date + 'T00:00:00').getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Corps grille */}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '52px repeat(6, 1fr)', height: TOTAL_HEURES * HAUTEUR_HEURE }}>

          {/* Lignes horaires */}
          {Array.from({ length: TOTAL_HEURES }, (_, i) => {
            const h = HEURE_DEBUT + i;
            return (
              <div key={h} style={{
                position: 'absolute', top: i * HAUTEUR_HEURE, left: 0, right: 0,
                borderTop: '1px solid #f1f5f9', display: 'grid',
                gridTemplateColumns: '52px repeat(6, 1fr)', pointerEvents: 'none',
              }}>
                <div style={{ padding: '2px 6px', fontSize: 10, color: '#94a3b8', textAlign: 'right' as const, lineHeight: 1 }}>
                  {String(h).padStart(2, '0')}h
                </div>
                {jours.map(j => (
                  <div key={j.date} style={{ borderLeft: '1px solid #f1f5f9', height: HAUTEUR_HEURE }} />
                ))}
              </div>
            );
          })}

          {/* Zones cliquables par créneau × jour */}
          {jours.map((j, ji) => (
            Array.from({ length: TOTAL_HEURES }, (_, hi) => {
              const h = HEURE_DEBUT + hi;
              const hStr = `${String(h).padStart(2, '0')}:00`;
              return (
                <div
                  key={`${j.date}-${h}`}
                  style={{
                    position: 'absolute',
                    top: hi * HAUTEUR_HEURE,
                    left: `calc(52px + ${ji} * ((100% - 52px) / 6))`,
                    width: 'calc((100% - 52px) / 6)',
                    height: HAUTEUR_HEURE,
                    cursor: 'pointer',
                  }}
                  onClick={() => onClickCreneau(j.date, hStr)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,58,95,.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                />
              );
            })
          ))}

          {/* Séances */}
          {jours.map((j, ji) => {
            const daySeances = seancesByDate[j.date] ?? [];
            return daySeances.map(s => {
              const top    = (heureToMinutes(s.heure_debut) - HEURE_DEBUT * 60) / 60 * HAUTEUR_HEURE;
              const height = (heureToMinutes(s.heure_fin) - heureToMinutes(s.heure_debut)) / 60 * HAUTEUR_HEURE;
              const col    = TYPE_COLORS[s.type_seance] ?? TYPE_COLORS.autre;
              return (
                <div
                  key={s.id}
                  onClick={e => { e.stopPropagation(); onClickSeance(s); }}
                  style={{
                    position: 'absolute',
                    top: top + 2,
                    left: `calc(52px + ${ji} * ((100% - 52px) / 6) + 2px)`,
                    width: 'calc((100% - 52px) / 6 - 4px)',
                    height: Math.max(height - 4, 20),
                    background: col.bg,
                    border: `1px solid ${col.border}`,
                    borderRadius: 6,
                    padding: '3px 5px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    zIndex: 1,
                    boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                  }}
                  title={`${s.matiere_nom ?? '—'} · ${s.heure_debut?.slice(0,5)}–${s.heure_fin?.slice(0,5)}`}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: col.color, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {TYPE_LABELS[s.type_seance]}
                  </div>
                  <div style={{ fontSize: 10, color: col.color, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {s.matiere_nom ?? '—'}
                  </div>
                  {height >= 50 && (
                    <div style={{ fontSize: 9, color: col.color, opacity: 0.7, marginTop: 1 }}>
                      {s.heure_debut?.slice(0,5)}–{s.heure_fin?.slice(0,5)}
                      {s.salle ? ` · ${s.salle}` : ''}
                    </div>
                  )}
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}

const S = {
  navBtn: { padding: '6px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
};
