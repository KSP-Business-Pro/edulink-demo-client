// src/services/error.service.ts
// B2.2 — Gestion d'erreurs centralisée EduLink Sup

import { reportError } from './sentry.service';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface AppError {
  message: string;       // Message affiché à l'utilisateur
  detail?: string;       // Détail technique (console uniquement)
  code?: string;         // Code Supabase/HTTP
  severity: ErrorSeverity;
  context?: string;      // Ex: 'Chargement étudiants', 'Suppression facture'
}

// ─── Codes d'erreur Supabase → messages lisibles ────────────────────────────

const SUPABASE_CODES: Record<string, string> = {
  // PostgREST
  PGRST116: 'Aucun résultat trouvé.',
  PGRST301: 'Session expirée — veuillez vous reconnecter.',
  PGRST302: 'Accès non autorisé.',
  // Auth
  '400':    'Requête invalide.',
  '401':    'Non authentifié — veuillez vous reconnecter.',
  '403':    'Accès refusé. Vérifiez vos droits sur cette ressource.',
  '404':    'Ressource introuvable.',
  '409':    'Conflit : cet enregistrement existe déjà.',
  '422':    'Données invalides — vérifiez les champs obligatoires.',
  '429':    'Trop de requêtes — veuillez patienter.',
  '500':    'Erreur serveur — réessayez dans quelques instants.',
  '503':    'Service temporairement indisponible.',
};

// Contraintes DB fréquentes dans EduLink
const CONSTRAINT_MESSAGES: Record<string, string> = {
  'etudiants_matricule_key':         'Ce matricule est déjà utilisé.',
  'etudiants_email_auth_key':        'Cet email est déjà enregistré.',
  'factures_reference_key':          'Cette référence de facture existe déjà.',
  'notes_lmd_etudiant_evaluation':   'Une note existe déjà pour cet étudiant sur cette évaluation.',
  'utilisateurs_email_key':          'Cet email utilisateur est déjà utilisé.',
  'presences_unique':                'Une présence est déjà enregistrée pour cette séance.',
};

// ─── Parser principal ────────────────────────────────────────────────────────

export function parseSupabaseError(err: unknown): AppError {
  if (!err) {
    return { message: 'Une erreur inconnue est survenue.', severity: 'error' };
  }

  // Erreur réseau (offline)
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return {
      message: '📡 Connexion impossible — vérifiez votre réseau.',
      severity: 'error',
      code: 'NETWORK',
    };
  }

  const e = err as Record<string, unknown>;
  const code    = String(e.code    ?? e.status ?? '');
  const message = String(e.message ?? e.msg    ?? '');
  const hint    = String(e.hint    ?? '');
  const details = String(e.details ?? '');

  // Contrainte d'unicité (23505)
  if (code === '23505' || message.includes('duplicate key')) {
    // Cherche quelle contrainte
    const constraintMatch = (details + message).match(/constraint "([^"]+)"/);
    const constraintKey   = constraintMatch?.[1] ?? '';
    const friendly = CONSTRAINT_MESSAGES[constraintKey];
    return {
      message: friendly ?? 'Cet enregistrement existe déjà (doublon).',
      detail:  `Contrainte: ${constraintKey}`,
      code:    '23505',
      severity: 'error',
    };
  }

  // Violation de clé étrangère (23503)
  if (code === '23503') {
    return {
      message: 'Impossible : cet élément est lié à d\'autres données.',
      detail:  message,
      code:    '23503',
      severity: 'error',
    };
  }

  // RLS / permission refusée (42501 ou PGRST302)
  if (code === '42501' || code === 'PGRST302' || message.includes('row-level security')) {
    return {
      message: '🔒 Accès refusé — vous n\'avez pas les droits nécessaires.',
      detail:  message,
      code,
      severity: 'error',
    };
  }

  // Session expirée
  if (code === 'PGRST301' || message.toLowerCase().includes('jwt')) {
    return {
      message: '⏰ Session expirée — veuillez vous reconnecter.',
      detail:  message,
      code,
      severity: 'warning',
    };
  }

  // Code HTTP connu
  if (SUPABASE_CODES[code]) {
    return {
      message: SUPABASE_CODES[code],
      detail:  hint || message,
      code,
      severity: code === '404' || code === 'PGRST116' ? 'info' : 'error',
    };
  }

  // Message brut lisible (RPC custom, ex: "note_invalide", "etudiant_non_inscrit")
  if (message && message.length < 120 && !message.includes('undefined')) {
    return {
      message: humanizeRpcMessage(message),
      detail:  hint,
      code,
      severity: 'error',
    };
  }

  return {
    message: 'Une erreur inattendue est survenue.',
    detail:  message,
    code,
    severity: 'error',
  };
}

// Traduit les codes RPC métier EduLink en phrases lisibles
function humanizeRpcMessage(msg: string): string {
  const map: Record<string, string> = {
    'note_invalide':              'La note saisie est invalide (hors plage 0–20).',
    'etudiant_non_inscrit':       'Cet étudiant n\'est pas inscrit à ce semestre.',
    'semestre_verrouille':        'Ce semestre est verrouillé — aucune modification autorisée.',
    'deliberation_publiee':       'La délibération est déjà publiée.',
    'releve_non_publie':          'Le relevé n\'est pas encore publié.',
    'ecole_non_trouvee':          'École introuvable dans la base.',
    'permission_denied':          'Action non autorisée pour votre rôle.',
    'paiement_superieur_solde':   'Le montant dépasse le solde restant dû.',
    'facture_deja_soldee':        'Cette facture est déjà soldée.',
  };
  const key = msg.toLowerCase().replace(/[\s-]/g, '_');
  return map[key] ?? msg;
}

// ─── handleError : point d'entrée unique ────────────────────────────────────

export interface HandleErrorOptions {
  context?: string;                   // Label affiché dans le toast et en console
  setError?: (msg: string) => void;   // setState du composant (bandeau inline)
  toast?: (msg: string, severity?: ErrorSeverity) => void; // Système toast global
  silent?: boolean;                   // Ne pas afficher à l'utilisateur (log only)
}

export function handleError(err: unknown, options: HandleErrorOptions = {}): AppError {
  const { context, setError, toast, silent = false } = options;
  const appError = parseSupabaseError(err);

  if (context) appError.context = context;

  // Log console structuré (toujours)
  console.error(
    `[EduLink Error]${context ? ` [${context}]` : ''}`,
    { message: appError.message, code: appError.code, detail: appError.detail, raw: err }
  );

  // Remonte l'erreur vers Sentry (production uniquement, cf. sentry.service.ts),
  // sauf erreurs réseau (NETWORK) : attendues côté utilisateur, pas des bugs applicatifs
  if (appError.code !== 'NETWORK') {
    reportError(err, context);
  }

  if (!silent) {
    if (toast) {
      toast(appError.message, appError.severity);
    } else if (setError) {
      setError(appError.message);
    }
  }

  return appError;
}
