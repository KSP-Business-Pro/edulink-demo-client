// src/components/Mfa2FAScreen.tsx
// B12.1 — Écran de second facteur, affiché entre le login et le tableau
// de bord pour les rôles concernés (admin, direction, scolarite,
// enseignant, comptable), une fois par session.

import { useState, useRef, useEffect } from 'react';
import type { UserProfil } from '../types/auth.types';
import { envoyerCodeOtp, verifierCodeOtp, setMfaVerifie } from '../services/mfa.service';

interface Props {
  user: UserProfil;
  onVerified: () => void;
  onLogout: () => void;
}

type Etape = 'choix' | 'code';

export function Mfa2FAScreen({ user, onVerified, onLogout }: Props) {
  const [etape, setEtape] = useState<Etape>('choix');
  const [channel, setChannel] = useState<'email' | 'sms' | null>(null);
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (etape === 'code') inputRef.current?.focus();
  }, [etape]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleEnvoyer(ch: 'email' | 'sms') {
    setLoading(true);
    setError(null);
    const result = await envoyerCodeOtp(ch);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'Erreur lors de l\'envoi du code');
      return;
    }
    setChannel(ch);
    setDestination(result.destination ?? '');
    setEtape('code');
    setCooldown(30);
  }

  async function handleVerifier(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    const result = await verifierCodeOtp(code);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'Code incorrect');
      setCode('');
      inputRef.current?.focus();
      return;
    }
    setMfaVerifie(user.id);
    onVerified();
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '2rem', maxWidth: 400, width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,.12)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1B2A4A', fontFamily: "'Lora', serif" }}>
            EduLink <span style={{ color: '#C8932E' }}>Sup</span>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Vérification en deux étapes</div>
        </div>

        {etape === 'choix' && (
          <>
            <p style={{ fontSize: 13, color: '#374151', textAlign: 'center', marginBottom: '1.25rem' }}>
              Bonjour {user.prenom || user.nom}, pour protéger votre compte, confirmez votre identité avec un code à usage unique.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => handleEnvoyer('email')}
                disabled={loading}
                style={{
                  padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff',
                  fontSize: 14, fontWeight: 600, color: '#1e293b', cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, opacity: loading ? 0.6 : 1,
                }}
              >
                📧 Recevoir le code par email
              </button>
              <button
                onClick={() => handleEnvoyer('sms')}
                disabled={loading || !user.telephone}
                title={!user.telephone ? "Aucun numéro enregistré sur ce compte" : undefined}
                style={{
                  padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff',
                  fontSize: 14, fontWeight: 600, color: !user.telephone ? '#cbd5e1' : '#1e293b',
                  cursor: (loading || !user.telephone) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10,
                  opacity: (loading || !user.telephone) ? 0.6 : 1,
                }}
              >
                📱 Recevoir le code par SMS{!user.telephone ? ' (aucun numéro enregistré)' : ''}
              </button>
            </div>
            {error && (
              <div role="alert" style={{ marginTop: 12, background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>
                {error}
              </div>
            )}
          </>
        )}

        {etape === 'code' && (
          <form onSubmit={handleVerifier}>
            <p style={{ fontSize: 13, color: '#374151', textAlign: 'center', marginBottom: '1rem' }}>
              Un code à 6 chiffres a été envoyé {channel === 'email' ? 'à' : 'au'} <strong>{destination}</strong>.
            </p>
            <label htmlFor="mfa-code" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
              Code de vérification à 6 chiffres
            </label>
            <input
              ref={inputRef}
              id="mfa-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={!!error}
              aria-describedby={error ? 'mfa-code-error' : undefined}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: 24, fontWeight: 700,
                textAlign: 'center', letterSpacing: 8, border: `2px solid ${error ? '#dc2626' : '#e2e8f0'}`,
                borderRadius: 10, marginBottom: 12, fontFamily: 'inherit', outline: 'none',
              }}
              placeholder="······"
            />
            {error && (
              <div id="mfa-code-error" role="alert" style={{ marginBottom: 12, background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              style={{
                width: '100%', minHeight: 44, padding: '10px', background: '#1B2A4A', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', opacity: (loading || code.length !== 6) ? 0.6 : 1, marginBottom: 10,
              }}
            >
              {loading ? 'Vérification…' : 'Vérifier'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <button
                type="button"
                onClick={() => { setEtape('choix'); setCode(''); setError(null); }}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                ← Changer de canal
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || loading}
                onClick={() => channel && handleEnvoyer(channel)}
                style={{ background: 'none', border: 'none', color: cooldown > 0 ? '#cbd5e1' : '#C8932E', cursor: cooldown > 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 600 }}
              >
                {cooldown > 0 ? `Renvoyer (${cooldown}s)` : 'Renvoyer le code'}
              </button>
            </div>
          </form>
        )}

        <button
          onClick={onLogout}
          style={{ width: '100%', marginTop: 16, padding: '8px', background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
