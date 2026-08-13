// src/components/SecuriteCompte.tsx
// 13/08/2026 — Sécurité du compte : activation/gestion de la 2FA TOTP
// (application d'authentification) pour l'utilisateur connecté.
// Composant autonome (pattern MonitoringEnvois) : logé dans la sidebar,
// accessible aux seuls administrateurs. Parcours : activer → scanner le QR
// (ou saisir le secret) → confirmer un code à 6 chiffres → noter les codes
// de secours (affichés UNE SEULE FOIS) → actif (régénérer les codes /
// désactiver).

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getStatutTotp, demarrerEnrolementTotp, confirmerEnrolementTotp,
  codesSecoursRestants, regenererCodesSecours, desactiverTotp,
} from '../services/mfa.service';

type Vue = 'chargement' | 'inactif' | 'enrolement' | 'codes' | 'actif';

const S = {
  page:      { padding: '1.5rem 2rem', maxWidth: 720, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  h1:        { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 } as React.CSSProperties,
  sub:       { fontSize: 13, color: '#64748b', margin: '2px 0 1.25rem' } as React.CSSProperties,
  card:      { background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)', padding: '1.5rem' } as React.CSSProperties,
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 4 } as React.CSSProperties,
  cardSub:   { fontSize: 13, color: '#64748b', marginBottom: '1rem', lineHeight: 1.5 } as React.CSSProperties,
  btnPrimary:   { padding: '9px 16px', background: '#1B2A4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnSecondary: { padding: '9px 14px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger:    { padding: '9px 14px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  alert:     { background: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12, lineHeight: 1.5 } as React.CSSProperties,
  succes:    { background: '#f0fdf4', color: '#166534', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12, border: '1px solid #bbf7d0', lineHeight: 1.5 } as React.CSSProperties,
  warn:      { background: '#fffbeb', color: '#92400e', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12, border: '1px solid #fde68a', lineHeight: 1.5 } as React.CSSProperties,
  codeInput: {
    width: 180, boxSizing: 'border-box' as const, padding: '10px', fontSize: 20, fontWeight: 700,
    textAlign: 'center' as const, letterSpacing: 6, border: '2px solid #e2e8f0',
    borderRadius: 10, fontFamily: 'inherit', outline: 'none',
  } as React.CSSProperties,
  secretBox: {
    fontFamily: 'Consolas, monospace', fontSize: 13, background: '#f8fafc', border: '1px dashed #cbd5e1',
    borderRadius: 8, padding: '8px 12px', wordBreak: 'break-all' as const, color: '#334155',
  } as React.CSSProperties,
  codesGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0',
    fontFamily: 'Consolas, monospace', fontSize: 15, fontWeight: 700, color: '#1e293b',
  } as React.CSSProperties,
  codeCell:  { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', textAlign: 'center' as const } as React.CSSProperties,
  badgeOn:   { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600 } as React.CSSProperties,
};

function qrSrc(qr: string): string {
  // GoTrue renvoie normalement une data URI SVG ; on couvre aussi le cas SVG brut
  return qr.startsWith('data:') ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`;
}

export function SecuriteCompte() {
  const { user } = useAuth();

  const [vue, setVue] = useState<Vue>('chargement');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [restants, setRestants] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const chargerStatut = useCallback(async () => {
    const statut = await getStatutTotp();
    if (statut.actif && statut.factorId) {
      setFactorId(statut.factorId);
      setRestants(await codesSecoursRestants());
      setVue('actif');
    } else {
      setFactorId(null);
      setVue('inactif');
    }
  }, []);

  useEffect(() => { chargerStatut(); }, [chargerStatut]);

  // Garde d'accès (défense en profondeur — la sidebar filtre déjà)
  if (user && user.role !== 'admin') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.cardTitle}>🛡️ Sécurité du compte</div>
          <div style={S.cardSub}>Cette page est réservée aux administrateurs.</div>
        </div>
      </div>
    );
  }

  async function handleActiver() {
    setLoading(true); setError(null); setSucces(null);
    const result = await demarrerEnrolementTotp();
    setLoading(false);
    if (!result.success || !result.factorId) {
      setError(result.error ?? 'Impossible de démarrer l\'activation');
      return;
    }
    setFactorId(result.factorId);
    setQr(result.qrCodeSvg ?? '');
    setSecret(result.secret ?? '');
    setCode('');
    setVue('enrolement');
  }

  async function handleConfirmer(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || !factorId) return;
    setLoading(true); setError(null);
    const result = await confirmerEnrolementTotp(factorId, code);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'Code incorrect');
      setCode('');
      return;
    }
    setAvertissement(result.error ?? null); // cas rare : TOTP actif mais génération des codes échouée
    setCodes(result.codesSecours ?? []);
    setCopie(false);
    setVue('codes');
  }

  async function handleRegenerer() {
    if (!window.confirm('Régénérer les codes de secours ? Les anciens codes seront immédiatement invalidés.')) return;
    setLoading(true); setError(null); setSucces(null);
    const result = await regenererCodesSecours();
    setLoading(false);
    if (!result.success || !result.codes) {
      setError(result.error ?? 'Impossible de régénérer les codes');
      return;
    }
    setAvertissement(null);
    setCodes(result.codes);
    setCopie(false);
    setVue('codes');
  }

  async function handleDesactiver() {
    if (!factorId) return;
    if (!window.confirm('Désactiver l\'application d\'authentification ? Vous recevrez à nouveau vos codes de connexion par email.')) return;
    setLoading(true); setError(null); setSucces(null);
    const result = await desactiverTotp(factorId);
    setLoading(false);
    if (!result.success) {
      setError(
        (result.error ?? 'Impossible de désactiver le TOTP')
        + ' — si le problème persiste, déconnectez-vous, reconnectez-vous avec votre code TOTP, puis réessayez.'
      );
      return;
    }
    setSucces('Application d\'authentification désactivée. Vos codes de connexion arriveront à nouveau par email.');
    await chargerStatut();
  }

  async function handleCopier() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      setError('Copie impossible — notez les codes manuellement.');
    }
  }

  function handleTelecharger() {
    const contenu =
      'EduLink Sup — Codes de secours 2FA\n'
      + 'Chaque code est à usage unique. Conservez ce fichier en lieu sûr.\n\n'
      + codes.join('\n') + '\n';
    const blob = new Blob([contenu], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edulink-codes-secours.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleTerminerCodes() {
    setSucces('Application d\'authentification activée. À votre prochaine connexion, le code vous sera demandé depuis votre application (plus d\'email).');
    await chargerStatut();
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>🛡️ Sécurité du compte</h1>
      <p style={S.sub}>Vérification en deux étapes de votre compte administrateur</p>

      <div style={S.card}>
        <div style={S.cardTitle}>Application d'authentification (TOTP)</div>
        <div style={S.cardSub}>
          Codes à 6 chiffres générés par Google Authenticator, Microsoft Authenticator, Aegis, FreeOTP…
          Une fois activée, elle <strong>remplace le code envoyé par email</strong> à la connexion.
          En cas de perte du téléphone, vos codes de secours permettent de récupérer l'accès.
        </div>

        {error && <div role="alert" style={S.alert}>⚠️ {error}</div>}
        {succes && <div role="status" style={S.succes}>✅ {succes}</div>}

        {vue === 'chargement' && (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Chargement…</p>
        )}

        {vue === 'inactif' && (
          <button onClick={handleActiver} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}>
            {loading ? '⏳ Préparation…' : '📱 Activer l\'application d\'authentification'}
          </button>
        )}

        {vue === 'enrolement' && (
          <form onSubmit={handleConfirmer}>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ textAlign: 'center' }}>
                {qr
                  ? <img src={qrSrc(qr)} alt="QR code à scanner avec votre application d'authentification" width={180} height={180} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }} />
                  : <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #cbd5e1', borderRadius: 12, fontSize: 12, color: '#94a3b8' }}>QR indisponible</div>}
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <ol style={{ fontSize: 13, color: '#374151', margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Ouvrez votre application d'authentification</li>
                  <li>Scannez le QR code (ou saisissez la clé ci-dessous)</li>
                  <li>Entrez le code à 6 chiffres affiché pour confirmer</li>
                </ol>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  Clé de configuration manuelle
                </div>
                <div style={S.secretBox}>{secret || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label htmlFor="totp-confirm" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                Code de confirmation à 6 chiffres
              </label>
              <input
                id="totp-confirm"
                name="totp-confirm"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={S.codeInput}
                placeholder="······"
              />
              <button type="submit" disabled={loading || code.length !== 6} style={{ ...S.btnPrimary, opacity: (loading || code.length !== 6) ? 0.6 : 1 }}>
                {loading ? '⏳ Vérification…' : 'Confirmer et activer'}
              </button>
              <button type="button" onClick={() => { setVue('inactif'); setError(null); setCode(''); }} style={S.btnSecondary}>
                Annuler
              </button>
            </div>
          </form>
        )}

        {vue === 'codes' && (
          <div>
            {avertissement && <div style={S.warn}>⚠️ {avertissement}</div>}
            <div style={S.warn}>
              ⚠️ <strong>Notez ces codes de secours maintenant</strong> — ils ne seront <strong>plus jamais affichés</strong>.
              Chaque code n'est utilisable qu'une seule fois, en cas de perte de votre téléphone.
            </div>
            {codes.length > 0 && (
              <div style={S.codesGrid}>
                {codes.map(c => <div key={c} style={S.codeCell}>{c}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {codes.length > 0 && (
                <>
                  <button onClick={handleCopier} style={S.btnSecondary}>
                    {copie ? '✅ Copiés' : '📋 Copier'}
                  </button>
                  <button onClick={handleTelecharger} style={S.btnSecondary}>
                    💾 Télécharger (.txt)
                  </button>
                </>
              )}
              <button onClick={handleTerminerCodes} style={S.btnPrimary}>
                J'ai noté mes codes — Terminer
              </button>
            </div>
          </div>
        )}

        {vue === 'actif' && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <span style={S.badgeOn}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Application d'authentification active
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
              Codes de secours restants : <strong>{restants ?? '—'}</strong> / 10
            </div>
            {restants !== null && restants <= 3 && (
              <div style={S.warn}>
                ⚠️ Il vous reste peu de codes de secours. Régénérez un nouveau jeu et conservez-le en lieu sûr.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <button onClick={handleRegenerer} disabled={loading} style={{ ...S.btnSecondary, opacity: loading ? 0.6 : 1 }}>
                🔄 Régénérer les codes de secours
              </button>
              <button onClick={handleDesactiver} disabled={loading} style={{ ...S.btnDanger, opacity: loading ? 0.6 : 1 }}>
                Désactiver l'application d'authentification
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}