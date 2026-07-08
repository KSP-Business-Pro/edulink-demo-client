// src/pages/LoginPage.tsx
// Page de connexion React — remplace le formulaire HTML de index.html
// Design fidèle à l'identité visuelle EduLink Sup

import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login, user, loading, error } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  // Si déjà connecté → redirect direct
  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [user, loading, from, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!email.trim() || !password) {
      setLocalError('Email et mot de passe requis.');
      return;
    }
    setSubmitting(true);
    const ok = await login(email.trim(), password);
    setSubmitting(false);
    if (ok) navigate(from, { replace: true });
    else setLocalError(error ?? 'Erreur de connexion.');
  };

  const displayError = localError || error;

  return (
    <div role="main" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#1a1a2e', padding: 24,
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 40px',
        width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Logo + titre */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎓</div>
          <h1 style={{
            margin: 0, fontSize: 28, fontWeight: 700,
            color: '#1a1a2e',
          }}>
            EduLink <span style={{ color: '#d97706' }}>Sup</span>
          </h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
            Système de gestion pédagogique LMD CAMES
          </p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#374151', marginBottom: 6, textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Adresse email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com"
              autoComplete="email"
              disabled={submitting}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8,
                border: '1.5px solid #e2e8f0', fontSize: 15,
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
                background: submitting ? '#f8fafc' : '#fff',
              }}
              onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
              onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#374151', marginBottom: 6, textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••"
              autoComplete="current-password"
              disabled={submitting}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8,
                border: '1.5px solid #e2e8f0', fontSize: 15,
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
                background: submitting ? '#f8fafc' : '#fff',
              }}
              onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
              onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>

          {/* Erreur */}
          {displayError && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              color: '#991b1b', borderRadius: 8, padding: '10px 14px',
              fontSize: 13, marginBottom: 20, lineHeight: 1.5,
            }}>
              {displayError}
            </div>
          )}

          {/* Bouton */}
          <button
            type="submit"
            disabled={submitting || loading}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 8,
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              background: submitting ? '#92400e' : '#d97706',
              color: '#fff', fontSize: 15, fontWeight: 600,
              transition: 'background 0.15s', letterSpacing: '0.02em',
            }}
          >
            {submitting ? 'Connexion en cours…' : 'Se connecter'}
          </button>
        </form>

        {/* Footer */}
        <p style={{
          textAlign: 'center', marginTop: 24, fontSize: 12,
          color: '#94a3b8',
        }}>
          EduLink Sup · Afryx.io · LMD CAMES Bénin
        </p>
      </div>
    </div>
  );
}
