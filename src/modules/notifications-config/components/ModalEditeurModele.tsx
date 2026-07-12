// src/modules/notifications-config/components/ModalEditeurModele.tsx
// Éditeur "structuré par blocs" : l'utilisateur édite du texte (objet + corps),
// la mise en forme (navy/ocre, structure) est fixe et garantie par l'app —
// pas d'éditeur WYSIWYG libre, pour éviter tout risque de casser le rendu
// dans les clients mail (cf. RELEVE_THEME, buildReleveEmailHtml).
import { useState } from 'react';
import { RELEVE_THEME } from '../../releves/components/releveTheme';
import type { ModeleNotification, TypeNotif, CanalNotif } from '../notifications-config.service';
import { TYPES_NOTIF, CANAUX_NOTIF, defaultSujet, upsertModele } from '../notifications-config.service';

interface Props {
  ecoleId: string;
  nomEcole: string;
  type: TypeNotif;
  canal: CanalNotif;
  existant: ModeleNotification | null;
  onClose: () => void;
  onSaved: () => void;
}

const T = RELEVE_THEME;

export function ModalEditeurModele({ ecoleId, nomEcole, type, canal, existant, onClose, onSaved }: Props) {
  const typeInfo = TYPES_NOTIF.find(t => t.id === type)!;
  const canalInfo = CANAUX_NOTIF.find(c => c.id === canal)!;

  const [actif, setActif]           = useState(existant?.actif ?? true);
  const [sujet, setSujet]           = useState(existant?.sujet ?? defaultSujet(type));
  const [corps, setCorps]           = useState(
    existant?.corps_texte ?? existant?.corps_html ?? `Bonjour {etudiant},\n\nCeci est une notification automatique.`
  );
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await upsertModele({
        ecole_id: ecoleId,
        type, canal, actif,
        sujet: canalInfo.champSujet ? sujet.trim() : null,
        corps_html: null,
        corps_texte: corps.trim(),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function insererVariable(v: string) {
    setCorps(c => c + v);
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <div>
            <div style={S.title}>{typeInfo.icon} {typeInfo.label} — {canalInfo.icon} {canalInfo.label}</div>
            <div style={S.sub}>{typeInfo.desc}</div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          <label style={S.toggleRow}>
            <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Notification active</span>
          </label>

          {canalInfo.champSujet && (
            <div style={S.field}>
              <label style={S.label}>{canal === 'push' ? 'Titre de la notification' : "Objet de l'email"}</label>
              <input type="text" value={sujet} onChange={e => setSujet(e.target.value)} style={S.input} placeholder={defaultSujet(type)} />
            </div>
          )}

          <div style={S.field}>
            <label style={S.label}>{canal === 'email' ? 'Message (introduction)' : 'Corps du message'}</label>
            <textarea
              value={corps}
              onChange={e => setCorps(e.target.value)}
              style={{ ...S.input, height: canal === 'email' ? 100 : 70, resize: 'vertical' as const, fontFamily: 'inherit' }}
              placeholder="Bonjour {etudiant}, ..."
            />
            {canal !== 'email' && (
              <span style={S.hint}>{corps.length}/160 caractères {canal === 'sms' ? '(SMS standard)' : ''}</span>
            )}
          </div>

          <div style={S.field}>
            <label style={S.label}>Variables disponibles</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {typeInfo.variables.map(v => (
                <button key={v} type="button" onClick={() => insererVariable(v)} style={S.varChip}>{v}</button>
              ))}
            </div>
          </div>

          {/* ── Aperçu structuré — charte fixe, contenu variable ── */}
          <div style={S.field}>
            <label style={S.label}>Aperçu</label>
            {canal === 'email' && (
              <div style={S.previewEmailWrap}>
                <div style={S.previewEmailHeader}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{nomEcole}</span>
                  <span style={{ color: T.ocre, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' as const }}>Notification</span>
                </div>
                <div style={{ height: 2, background: T.ocre }} />
                <div style={{ padding: 14, fontSize: 12, color: '#1e293b' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 11, color: T.grayText }}>Objet : {sujet || '—'}</div>
                  <div style={{ whiteSpace: 'pre-wrap' as const, lineHeight: 1.5 }}>{corps || '—'}</div>
                </div>
              </div>
            )}
            {canal === 'sms' && (
              <div style={S.previewSmsBubble}>{corps || '—'}</div>
            )}
            {canal === 'push' && (
              <div style={S.previewPushCard}>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{sujet || '—'}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{corps || '—'}</div>
              </div>
            )}
          </div>

          {error && <div style={S.errorBox}>{error}</div>}
        </div>

        <div style={S.footer}>
          <button style={S.btnSecondary} onClick={onClose}>Annuler</button>
          <button style={S.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer →'}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 24px 64px rgba(0,0,0,.3)' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  title:       { fontSize: 15, fontWeight: 700, color: '#1e293b' },
  sub:         { fontSize: 11, color: '#94a3b8', marginTop: 3 },
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' },
  body:        { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: 14 },
  footer:      { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' },
  field:       { display: 'flex', flexDirection: 'column' as const, gap: 5 },
  label:       { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  hint:        { fontSize: 10, color: '#9ca3af' },
  input:       { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fafafa', color: '#1e293b' },
  toggleRow:   { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
  varChip:     { padding: '4px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, fontSize: 11, fontFamily: 'monospace', color: '#374151', cursor: 'pointer' },
  errorBox:    { background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 12 },
  btnPrimary:  { padding: '9px 18px', background: T.navy, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnSecondary:{ padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  previewEmailWrap:   { border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' as const },
  previewEmailHeader: { background: T.navy, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  previewSmsBubble:   { background: '#e0f2fe', color: '#0c4a6e', padding: '10px 14px', borderRadius: 14, fontSize: 12, maxWidth: 260, whiteSpace: 'pre-wrap' as const },
  previewPushCard:    { border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
};
