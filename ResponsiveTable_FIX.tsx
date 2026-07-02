// src/components/ResponsiveTable.tsx
// Tableau générique : rendu <table> classique ≥768px, cartes empilées <768px.
// Bascule pilotée en CSS (media query), pas de resize listener JS.
//
// Usage :
//   <ResponsiveTable
//     columns={[
//       { key: 'matricule', label: 'Matricule', render: e => <code>{e.matricule}</code> },
//       { key: 'nom', label: 'Nom & Prénom', primary: true, render: e => <>{e.nom} {e.prenom}</> },
//       { key: 'niveau', label: 'Niveau', render: e => <Badge>{e.niveau}</Badge> },
//     ]}
//     data={etudiants}
//     keyExtractor={e => e.id}
//     actions={e => <button onClick={() => openFiche(e.id)}>Fiche</button>}
//   />

import { useEffect } from 'react';

export interface RTColumn<T> {
  /** Identifiant unique de la colonne */
  key: string;
  /** Libellé affiché en <th> (desktop) et en label (mobile) */
  label: string;
  /**
   * Rendu de la cellule. Le tableau desktop et les cartes mobiles sont TOUS LES DEUX
   * présents dans le DOM en permanence (le CSS cache l'un ou l'autre selon la largeur).
   * Si une cellule contient un champ de formulaire avec un id/name basé sur la ligne
   * (ex: `select-${row.id}`), utilise le 2e argument `view` pour le suffixer
   * (ex: `select-${row.id}-${view}`) — sinon le même id se retrouve dupliqué 2x dans la page.
   */
  render: (row: T, view: 'desktop' | 'mobile') => React.ReactNode;
  /**
   * Colonne "titre" de la carte mobile (généralement Nom & Prénom).
   * Une seule colonne devrait être primary=true. Si aucune ne l'est,
   * la première colonne sert de titre.
   */
  primary?: boolean;
  /** Exclure complètement cette colonne de la vue mobile (ex: colonne décorative) */
  hideOnMobile?: boolean;
  /** Police monospace pour la valeur en mode carte (codes, matricules) */
  mono?: boolean;
  /** Largeur CSS de la colonne desktop (ex: '120px') */
  width?: string;
}

interface ResponsiveTableProps<T> {
  columns: RTColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  /** Rendu des actions (boutons Fiche / Supprimer…), affiché en fin de ligne (desktop) et bas de carte (mobile) */
  actions?: (row: T, view: 'desktop' | 'mobile') => React.ReactNode;
  /** Clic sur une ligne/carte entière (optionnel) */
  onRowClick?: (row: T) => void;
}

let stylesInjected = false;
function injectStylesOnce() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-responsive-table', 'true');
  style.textContent = `
    .rt-desktop { display: table; width: 100%; border-collapse: collapse; }
    .rt-mobile  { display: none; }
    @media (max-width: 767px) {
      .rt-desktop { display: none; }
      .rt-mobile  { display: flex; flex-direction: column; gap: 10px; }
    }
    .rt-card {
      background: #fff;
      border: 1px solid #f1f5f9;
      border-left: 3px solid #1e3a5f;
      border-radius: 10px;
      padding: 12px 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,.05);
    }
    .rt-card-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 8px; }
    .rt-card-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 5px 0;
      border-top: 1px solid #f8fafc;
      font-size: 13px;
    }
    .rt-card-row:first-of-type { border-top: none; }
    .rt-card-label {
      font-size: 10.5px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: .04em;
      flex-shrink: 0;
    }
    .rt-card-value { text-align: right; color: #374151; min-width: 0; }
    .rt-card-value.rt-mono { font-family: monospace; font-size: 12px; }
    .rt-card-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #f8fafc;
    }
  `;
  document.head.appendChild(style);
}

export default function ResponsiveTable<T>({
  columns, data, keyExtractor, actions, onRowClick,
}: ResponsiveTableProps<T>) {
  useEffect(() => { injectStylesOnce(); }, []);

  const primaryCol = columns.find(c => c.primary) ?? columns[0];
  const secondaryCols = columns.filter(c => c.key !== primaryCol.key && !c.hideOnMobile);

  return (
    <>
      {/* ── Desktop : table classique ── */}
      <table className="rt-desktop">
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151',
                textAlign: 'left', borderBottom: '1px solid #f1f5f9', width: col.width,
              }}>
                {col.label}
              </th>
            ))}
            {actions && <th style={{ borderBottom: '1px solid #f1f5f9' }} />}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr
              key={keyExtractor(row)}
              style={{ borderBottom: '1px solid #f9fafb', cursor: onRowClick ? 'pointer' : 'default' }}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map(col => (
                <td key={col.key} style={{ padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' }}>
                  {col.render(row, 'desktop')}
                </td>
              ))}
              {actions && (
                <td style={{ padding: '10px 14px', display: 'flex', gap: 4 }}
                    onClick={e => e.stopPropagation()}>
                  {actions(row, 'desktop')}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Mobile : cartes empilées ── */}
      <div className="rt-mobile">
        {data.map(row => (
          <div
            key={keyExtractor(row)}
            className="rt-card"
            onClick={() => onRowClick?.(row)}
            style={{ cursor: onRowClick ? 'pointer' : 'default' }}
          >
            <div className="rt-card-title">{primaryCol.render(row, 'mobile')}</div>
            {secondaryCols.map(col => (
              <div key={col.key} className="rt-card-row">
                <span className="rt-card-label">{col.label}</span>
                <span className={`rt-card-value${col.mono ? ' rt-mono' : ''}`}>{col.render(row, 'mobile')}</span>
              </div>
            ))}
            {actions && (
              <div className="rt-card-actions" onClick={e => e.stopPropagation()}>
                {actions(row, 'mobile')}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
