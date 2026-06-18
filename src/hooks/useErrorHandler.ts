// src/hooks/useErrorHandler.ts
// B2.2 — Hook uniforme pour gestion d'erreurs dans tous les modules EduLink

import { useState, useCallback, useRef, useEffect } from 'react';
import { handleError, type ErrorSeverity, type HandleErrorOptions } from '../services/error.service';

// ─── Toast store global (singleton léger, sans Redux) ────────────────────────

export interface ToastItem {
  id: number;
  message: string;
  severity: ErrorSeverity;
}

type ToastListener = (toasts: ToastItem[]) => void;

let _toasts: ToastItem[]     = [];
let _counter                  = 0;
const _listeners: Set<ToastListener> = new Set();

function notify() {
  _listeners.forEach(fn => fn([..._toasts]));
}

export function addToast(message: string, severity: ErrorSeverity = 'error') {
  const id = ++_counter;
  _toasts = [..._toasts, { id, message, severity }];
  notify();
  // Auto-dismiss
  const delay = severity === 'error' ? 6000 : 4000;
  setTimeout(() => removeToast(id), delay);
}

export function removeToast(id: number) {
  _toasts = _toasts.filter(t => t.id !== id);
  notify();
}

export function useToastStore() {
  const [toasts, setToasts] = useState<ToastItem[]>([..._toasts]);
  useEffect(() => {
    _listeners.add(setToasts);
    return () => { _listeners.delete(setToasts); };
  }, []);
  return toasts;
}

// ─── Hook principal ──────────────────────────────────────────────────────────

export function useErrorHandler() {
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Enveloppe un appel async :
   * - gère le loading
   * - intercepte et affiche l'erreur (toast + bandeau inline optionnel)
   * - retourne le résultat ou null en cas d'erreur
   */
  const run = useCallback(async <T>(
    fn: () => Promise<T>,
    options: HandleErrorOptions & { inline?: boolean } = {}
  ): Promise<T | null> => {
    setLoading(true);
    clearError();
    try {
      const result = await fn();
      return result;
    } catch (err) {
      handleError(err, {
        ...options,
        toast:    (msg, sev) => addToast(msg, sev),
        setError: options.inline ? setError : undefined,
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearError]);

  /**
   * Pour les actions ponctuelles (suppression, soumission) sans loading global.
   * Affiche uniquement un toast.
   */
  const runAction = useCallback(async <T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      handleError(err, {
        context,
        toast: (msg, sev) => addToast(msg, sev),
      });
      return null;
    }
  }, []);

  return { error, loading, clearError, run, runAction, setError, setLoading };
}

// ─── Ref-based version (stable across re-renders, pour les callbacks longs) ──

export function useErrorHandlerRef() {
  const handler = useErrorHandler();
  const ref = useRef(handler);
  ref.current = handler;
  return ref;
}
