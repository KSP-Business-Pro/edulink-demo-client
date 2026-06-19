// src/modules/emploi-du-temps/components/VueListe.tsx

import { type Seance, TYPE_COLORS, TYPE_LABELS } from '../emploi-du-temps.service';

interface Props {
  seances:       Seance[];
  onClickSeance: (s: Seance) => void;
  onDelete:      (s: Seance) => void;
}

const JOURS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

export function VueListe({ seances, onClickSeance, onDelete }: Props) {
  if (seances.length === 0) return null;

  // Grouper par date
  const groups: Record<string, Seance[]> = {};
  seances.forEach(s => {
    if (!groups[s.date_seance]) groups[s.date_seance] = [];
    groups[s.date_seance].push(s);
  });

  const aujourd_hui = new Date().toISOString().split('T')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, daySeances]) => {
        const d       = new Date(date + 'T00:00:00');
        const isToday = date === aujourd_hui;
        const isPast  = date < aujourd_hui;
        return (
          <div key={date}>
            {/* En-tête date */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            }}>
              <div style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                background: isToday ? '#1e3a5f' : '#f1f5f9',
                color: isToday ? '#fff' : isPast ? '#94a3b8' : '#374151',
              }}>
                {JOURS_FR[d.getDay()]} {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                {isToday && ' — Aujourd\'hui'}
              </div>
              <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
            </div>

            {/* Séances du jour */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {daySeances.sort((a, b) => a.heure_debut.localeCompare(b.heure_debut)).map(s => {
                const col = TYPE_COLORS[s.type_seance] ?? TYPE_COLORS.autre;
                return (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#fff', borderRadius: 10,
                    border: `1px solid ${isPast ? '#f1f5f9' : col.border}`,
                    padding: '10px 14px',
                    opacity: isPast ? 0.7 : 1,
                    boxShadow: '0 1px 2px rgba(0,0,0,.04)',
                  }}>
                    {/* Barre couleur */}
                    <div style={{ width: 4, height: 40, borderRadius: 2, background: col.border, flexShrink: 0 }} />

                    {/* Heure */}
                    <div style={{ minWidth: 80, textAlign: 'center' as const }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        {s.heure_debut?.slice(0,5)}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {s.heure_fin?.slice(0,5)}
                      </div>
                    </div>

                    {/* Type badge */}
                    <span style={{
                      background: col.bg, color: col.color,
                      fontSize: 10, fontWeight: 700,
                      padding: '3px 8px', borderRadius: 999,
                      flexShrink: 0,
                    }}>
                      {TYPE_LABELS[s.type_seance]}
                    </span>

                    {/* Matière + enseignant */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {s.matiere_nom ?? '—'}
                        {s.matiere_code && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>({s.matiere_code})</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                        {s.enseignant_nom ? `${s.enseignant_nom} ${s.enseignant_prenom ?? ''}` : 'Enseignant non défini'}
                        {s.salle ? ` · 📍 ${s.salle}` : ''}
                      </div>
                    </div>

                    {/* Semestre */}
                    <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 120, textAlign: 'right' as const, flexShrink: 0 }}>
                      {s.semestre_libelle?.split('—')[0]?.trim() ?? ''}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        style={S.btnGhost}
                        onClick={() => onClickSeance(s)}
                        title="Modifier"
                      >✏️</button>
                      <button
                        style={{ ...S.btnGhost, color: '#dc2626' }}
                        onClick={() => onDelete(s)}
                        title="Supprimer"
                      >🗑️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const S = {
  btnGhost: { padding: '5px 8px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
};
