// src/modules/releves/components/releveTheme.ts
// Source unique de vérité pour les couleurs/labels utilisés par RelevePDF.tsx —
// évite la duplication entre les styles inline React (aperçu écran) et le CSS
// d'impression (template string injectée dans la popup window.print()).
//
// Sprint B15 — Action 2 : navy aligné sur la valeur canonique #1B2A4A
// (documents officiels destinés à l'extérieur → priorité à la charte de marque).
// Étape suivante (2/3) : ajout de l'ocre #C8932E aux accents du document.

export const RELEVE_THEME = {
  navy:          '#1B2A4A',
  ocre:          '#C8932E',
  cream:         '#F7F4ED',
  grayBg:        '#f8fafc',
  grayBorder:    '#e2e8f0',
  grayText:      '#64748b',
  grayTextLight: '#94a3b8',
  textDark:      '#1e293b',
  rowBorder:     '#f1f5f9',
  matriculeBg:   '#e0f2fe',
  matriculeText: '#0369a1',
} as const;

export function noteColor(val: number | null): string {
  if (val === null) return '#6b7280';
  if (val >= 16) return '#7e22ce';
  if (val >= 14) return '#059669';
  if (val >= 12) return '#1d4ed8';
  if (val >= 10) return '#d97706';
  return '#dc2626';
}

export function decisionBg(d: string | null): { bg: string; color: string } {
  if (d === 'admis' || d === 'mention_speciale') return { bg: '#d1fae5', color: '#065f46' };
  if (d === 'ajourné') return { bg: '#fef3c7', color: '#92400e' };
  return { bg: '#fee2e2', color: '#991b1b' };
}

export const MENTION_FR: Record<string, string> = {
  tres_bien:   'Très Bien',
  bien:        'Bien',
  assez_bien:  'Assez Bien',
  passable:    'Passable',
  insuffisant: 'Insuffisant',
};

export const DECISION_FR: Record<string, string> = {
  admis:            'Admis(e)',
  'ajourné':        'Ajourné(e)',
  redoublant:       'Redoublant(e)',
  exclus:           'Exclu(e)',
  mention_speciale: 'Mention Spéciale',
};
