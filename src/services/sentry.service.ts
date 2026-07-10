// src/services/sentry.service.ts
// B14 — Monitoring des erreurs et de la performance front en production
// Actif uniquement en production (import.meta.env.PROD) pour ne pas polluer
// le quota Sentry avec du bruit de développement local.

import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

  if (!import.meta.env.PROD) {
    return;
  }

  if (!dsn) {
    console.warn('[Sentry] VITE_SENTRY_DSN absent — monitoring desactive.');
    return;
  }

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Echantillonnage des transactions de performance (20% du trafic prod)
    tracesSampleRate: 0.2,
    environment: 'production',
  });
}

// Rapporte une exception au service Sentry, avec un contexte metier optionnel.
// Ne fait rien si Sentry n'est pas initialise (dev, DSN absent) — Sentry.captureException
// est un no-op silencieux dans ce cas, donc aucun garde supplementaire n'est necessaire ici.
export function reportError(err: unknown, context?: string): void {
  Sentry.captureException(err, context ? { tags: { context } } : undefined);
}
