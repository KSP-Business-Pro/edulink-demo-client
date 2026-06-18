// src/components/ErrorComponents.tsx
// B2.2 — ToastContainer global + ErrorBoundary pour les modules EduLink

import { Component, type ReactNode } from 'react';
import { useToastStore, removeToast, type ToastItem } from '../hooks/useErrorHandler';
import type { ErrorSeverity } from '../services/error.service';

// ─── ToastContainer ──────────────────────────────────────────────────────────
// À placer UNE SEULE FOIS dans AppLayout, après <main>

export function ToastContainer() {
  const toasts = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div style={S.container} aria-live="polite">
      {toasts.map(t => (
        <Toast key={t.id} item={t} />
      ))}
    </div>
  );
}

function Toast({ item }: { item: ToastItem }) {
  const cfg = TOAST_CONFIG[item.severity];
  return (
    <div style={{ ...S.toast, background: cfg.bg, borderLeft: `4px solid ${cfg.border}` }}>
      <span style={{ fontSize: 16 }}>{cfg.icon}</span>
      <span style={{ ...S.message, color: cfg.text }}>{item.message}</span>
      <button
        style={S.close}
        onClick={() => removeToast(item.id)}
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}

const TOAST_CONFIG: Record<ErrorSeverity, { bg: string; border: string; text: string; icon: string }> = {
  error:   { bg: '#fef2f2', border: '#ef4444', text: '#7f1d1d', icon: '❌' },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#78350f', icon: '⚠️' },
  info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1e3a5f', icon: 'ℹ️' },
};

const S = {
  container: {
    position:  'fixed',
    bottom:    24,
    right:     24,
    zIndex:    9999,
    display:   'flex',
    flexDirection: 'column',
    gap:       10,
    maxWidth:  380,
    width:     'calc(100vw - 48px)',
    pointerEvents: 'none',
  } as React.CSSProperties,
  toast: {
    display:      'flex',
    alignItems:   'flex-start',
    gap:          10,
    padding:      '12px 14px',
    borderRadius: 10,
    boxShadow:    '0 4px 12px rgba(0,0,0,.12)',
    animation:    'slideIn .2s ease',
    pointerEvents: 'all',
    fontFamily:   "'Segoe UI', sans-serif",
  } as React.CSSProperties,
  message: {
    flex:     1,
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 500,
  } as React.CSSProperties,
  close: {
    background:  'transparent',
    border:      'none',
    cursor:      'pointer',
    fontSize:    18,
    lineHeight:  1,
    color:       '#9ca3af',
    padding:     '0 2px',
    flexShrink:  0,
  } as React.CSSProperties,
};

// Inject keyframe une seule fois
if (typeof document !== 'undefined') {
  const styleId = '__edulink_toast_style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `@keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }`;
    document.head.appendChild(s);
  }
}

// ─── ErrorBoundary ───────────────────────────────────────────────────────────
// Enveloppe chaque module pour capturer les erreurs de rendu React

interface ErrorBoundaryProps {
  children: ReactNode;
  moduleName?: string;   // Ex: "Étudiants", "Comptabilité"
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[EduLink ErrorBoundary]', {
      module:  this.props.moduleName,
      error:   error.message,
      stack:   error.stack,
      component: info.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={EB.wrap}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2 style={EB.title}>
          Erreur dans {this.props.moduleName ? `le module « ${this.props.moduleName} »` : 'ce module'}
        </h2>
        <p style={EB.msg}>{this.state.message || 'Une erreur inattendue a interrompu l\'affichage.'}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button
            style={EB.btnPrimary}
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              this.props.onRetry?.();
            }}
          >
            🔄 Réessayer
          </button>
          <button
            style={EB.btnSecondary}
            onClick={() => window.location.reload()}
          >
            ↺ Recharger la page
          </button>
        </div>
      </div>
    );
  }
}

const EB = {
  wrap: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '3rem 2rem',
    textAlign:      'center',
    minHeight:       300,
    fontFamily:     "'Segoe UI', sans-serif",
  } as React.CSSProperties,
  title: {
    fontSize:   18,
    fontWeight: 700,
    color:      '#1e293b',
    margin:     '0 0 8px',
  } as React.CSSProperties,
  msg: {
    fontSize: 13,
    color:    '#64748b',
    maxWidth:  400,
    lineHeight: 1.5,
  } as React.CSSProperties,
  btnPrimary: {
    padding:      '9px 18px',
    background:   '#1e3a5f',
    color:        '#fff',
    border:       'none',
    borderRadius: 8,
    fontSize:     13,
    fontWeight:   600,
    cursor:       'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    padding:      '9px 18px',
    background:   '#fff',
    color:        '#374151',
    border:       '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize:     13,
    fontWeight:   600,
    cursor:       'pointer',
  } as React.CSSProperties,
};
