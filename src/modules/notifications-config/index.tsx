// src/modules/notifications-config/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';
import { TYPES_NOTIF, CANAUX_NOTIF, fetchModeles } from './notifications-config.service';
import type { ModeleNotification, TypeNotif, CanalNotif } from './notifications-config.service';
import { ModalEditeurModele } from './components/ModalEditeurModele';

export default function NotificationsConfigPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<{ id: string; nom: string }[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [modeles, setModeles] = useState<ModeleNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [edition, setEdition] = useState<{ type: TypeNotif; canal: CanalNotif } | null>(null);

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try { setModeles(await fetchModeles(ecoleId)); }
    finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  function trouverModele(type: TypeNotif, canal: CanalNotif) {
    return modeles.find(m => m.type === type && m.canal === canal) ?? null;
  }

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      <div className="top">
        <div>
          <h2>Modèles de notification</h2>
          <div className="page-subtitle">Configurez le contenu envoyé par email, SMS et push — Paramètres → Notifications</div>
        </div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? <div className="loading">Chargement…</div> : (
        <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#1B2A4A', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                  Type de notification
                </th>
                {CANAUX_NOTIF.map(c => (
                  <th key={c.id} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#1B2A4A', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                    {c.icon} {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TYPES_NOTIF.map(t => (
                <tr key={t.id}>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t.icon} {t.label}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{t.desc}</div>
                  </td>
                  {CANAUX_NOTIF.map(c => {
                    const m = trouverModele(t.id, c.id);
                    return (
                      <td key={c.id} style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid #f9fafb' }}>
                        <button
                          onClick={() => setEdition({ type: t.id, canal: c.id })}
                          style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                            background: m?.actif ? '#f0fdf4' : m ? '#f9fafb' : '#fff',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <span className={`badge ${m?.actif ? 'green' : m ? 'gray' : 'amber'}`} style={{ fontSize: 10 }}>
                            {m?.actif ? 'Actif' : m ? 'Inactif' : 'Non configuré'}
                          </span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>✏ Configurer</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edition && (
        <ModalEditeurModele
          ecoleId={ecoleId}
          nomEcole={ecoles.find(e => e.id === ecoleId)?.nom ?? ''}
          type={edition.type}
          canal={edition.canal}
          existant={trouverModele(edition.type, edition.canal)}
          onClose={() => setEdition(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
