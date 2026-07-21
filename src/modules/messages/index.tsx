// src/modules/messages/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

interface EcoleOption { id: string; nom: string }
interface UtilisateurOption { id: string; nom: string; role: string }

interface Message {
  id: string; ecole_id: string;
  expediteur_id: string; expediteur_nom: string | null;
  expediteur_role: string | null; sujet: string | null;
  objet: string | null; contenu: string;
  lu: boolean; created_at: string;
}

export default function MessagesPage() {
  const { user, isSuperAdmin } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && data?.[0]) setEcoleId(data[0].id);
    });
  }, [isSuperAdmin]); // eslint-disable-line

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [sujet, setSujet]       = useState('');
  const [contenu, setContenu]   = useState('');
  const [sending, setSending]   = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [destinataires, setDestinataires] = useState<UtilisateurOption[]>([]);
  const [destinataireId, setDestinataireId] = useState('');

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    if (!ecoleId) return;
    supabase.from('utilisateurs')
      .select('id,nom,role')
      .eq('ecole_id', ecoleId)
      .eq('actif', true)
      .neq('id', user?.id ?? '')
      .order('nom')
      .then(({ data }) => setDestinataires((data ?? []) as UtilisateurOption[]));
  }, [ecoleId, user?.id]);

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id,ecole_id,expediteur_id,expediteur_nom,expediteur_role,sujet,objet,contenu,lu,created_at')
        .eq('ecole_id', ecoleId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setMessages((data ?? []) as Message[]);
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  async function handleEnvoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!contenu.trim() || !destinataireId) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc('fn_envoyer_message', {
        p_ecole_id:        ecoleId,
        p_destinataire_id: destinataireId,
        p_sujet:           sujet.trim() || null,
        p_contenu:         contenu.trim(),
      });
      if (error) throw error;
      setModalOpen(false); setSujet(''); setContenu(''); setDestinataireId('');
      await load(); showToast('Message envoyé ✓');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setSending(false); }
  }

  async function handleSupprimer(id: string) {
    if (!confirm('Supprimer ce message ?')) return;
    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    await load(); showToast('Message supprimé');
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ padding: '1.5rem', paddingBottom: '2rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: toast.type === 'success' ? '#059669' : '#dc2626', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {toast.msg}
        </div>
      )}

      <div className="top">
        <div><h2>Messages</h2><div className="page-subtitle">Messagerie interne</div></div>
        <div className="top-actions">
          {isSuperAdmin && ecoles.length > 0 && (
            <select id="messages-ecole" name="ecole" value={ecoleId} onChange={e => setEcoleId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
              {ecoles.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          )}
          <button className="btn-blue" onClick={() => setModalOpen(true)}>✉ Nouveau message</button>
        </div>
      </div>

      {loading ? <div className="loading">Chargement…</div> :
        messages.length === 0
          ? <div className="empty-state"><div className="es-ico">💬</div><h3>Aucun message</h3><p>La messagerie interne apparaîtra ici</p></div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', maxWidth: 780 }}>
              {messages.map(m => {
                const isMine   = m.expediteur_id === user?.id;
                const senderNom = m.expediteur_nom || (isMine ? (user?.nom ?? 'Moi') : 'Système');
                const initiale  = senderNom.charAt(0).toUpperCase();
                const sujetMsg  = m.sujet || m.objet || '';
                return (
                  <div key={m.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem 1.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isMine ? '#1e3a5f' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {initiale}
                        </div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827' }}>{senderNom}</div>
                          {m.expediteur_role && <div style={{ fontSize: 10, color: '#9ca3af' }}>{m.expediteur_role}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(m.created_at)}</div>
                        {isMine && (
                          <button onClick={() => handleSupprimer(m.id)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px 5px', fontSize: 14, lineHeight: 1 }}>
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                    {sujetMsg && <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>{sujetMsg}</div>}
                    <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{m.contenu}</div>
                  </div>
                );
              })}
            </div>
          )
      }

      {/* Modal nouveau message */}
      {modalOpen && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>✉ Nouveau message</h3>
              <button className="btn-ghost btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleEnvoyer} autoComplete="off">
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="msg-destinataire">Destinataire *</label>
                <select id="msg-destinataire" name="destinataire" value={destinataireId} required
                  onChange={e => setDestinataireId(e.target.value)}
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}>
                  <option value="">Choisir un destinataire…</option>
                  {destinataires.map(d => <option key={d.id} value={d.id}>{d.nom} ({d.role})</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <label htmlFor="msg-sujet">Sujet <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(optionnel)</span></label>
                <input id="msg-sujet" name="sujet" type="text" value={sujet} onChange={e => setSujet(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }} placeholder="Objet du message…" autoFocus />
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="msg-contenu">Message *</label>
                <textarea id="msg-contenu" name="contenu" value={contenu} onChange={e => setContenu(e.target.value)} rows={5} required
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="Votre message…" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={sending || !destinataireId}>{sending ? 'Envoi…' : 'Envoyer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
