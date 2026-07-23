// src/modules/messages/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

interface EcoleOption { id: string; nom: string }
interface UtilisateurOption { id: string; nom: string; role: string }
interface EtudiantOption { id: string; nom: string; prenom: string; matricule: string }

interface Message {
  id: string; ecole_id: string;
  expediteur_id: string; expediteur_nom: string | null;
  expediteur_role: string | null; sujet: string | null;
  objet: string | null; contenu: string;
  lu: boolean; created_at: string;
  destinataire_nom: string | null; destinataire_role: string | null;
  categorie: string | null; priorite: string | null; statut: string | null;
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
  const [categorieMsg, setCategorieMsg] = useState('');
  const [prioriteMsg, setPrioriteMsg]   = useState('normale');
  const [sending, setSending]   = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [destinataires, setDestinataires] = useState<UtilisateurOption[]>([]);
  const [destinataireId, setDestinataireId] = useState('');
  const [ongletActif, setOngletActif] = useState<'recus' | 'envoyes'>('recus');
  const [filterQuick, setFilterQuick] = useState<'tous' | 'non_lus' | 'urgents' | 'archives'>('tous');
  const [searchQuery, setSearchQuery] = useState('');
  const [periodeFiltre, setPeriodeFiltre] = useState<'tous' | 'jour' | 'semaine' | 'mois'>('tous');
  const [modeDestinataire, setModeDestinataire] = useState<'collegue' | 'etudiant' | 'groupe'>('collegue');
  const [groupeType, setGroupeType] = useState<'niveau' | 'filiere' | 'role'>('niveau');
  const [groupeValeur, setGroupeValeur] = useState('');
  const [groupePreviewCount, setGroupePreviewCount] = useState<number | null>(null);
  const [niveauxOptions, setNiveauxOptions] = useState<string[]>([]);
  const [filieresOptions, setFilieresOptions] = useState<string[]>([]);
  const [etudiantSearch, setEtudiantSearch] = useState('');
  const [etudiantResults, setEtudiantResults] = useState<EtudiantOption[]>([]);
  const [etudiantId, setEtudiantId] = useState('');

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
      .neq('id', user?.utilisateur_id ?? '')
      .order('nom')
      .then(({ data }) => setDestinataires((data ?? []) as UtilisateurOption[]));
  }, [ecoleId, user?.utilisateur_id]);

  useEffect(() => {
    if (!ecoleId) return;
    supabase.from('etudiants').select('niveau,filiere').eq('ecole_id', ecoleId).then(({ data }) => {
      const niveaux = Array.from(new Set((data ?? []).map((d: any) => d.niveau).filter(Boolean))) as string[];
      const filieres = Array.from(new Set((data ?? []).map((d: any) => d.filiere).filter(Boolean))) as string[];
      setNiveauxOptions(niveaux.sort());
      setFilieresOptions(filieres.sort());
    });
  }, [ecoleId]);

  useEffect(() => {
    if (modeDestinataire !== 'groupe' || !groupeValeur || !ecoleId) { setGroupePreviewCount(null); return; }
    let cancelled = false;
    (async () => {
      let count = 0;
      if (groupeType === 'role') {
        const { count: c } = await supabase.from('utilisateurs').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId).eq('actif', true).eq('role', groupeValeur);
        count = c ?? 0;
      } else {
        const { count: c } = await supabase.from('etudiants').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId).eq(groupeType, groupeValeur);
        count = c ?? 0;
      }
      if (!cancelled) setGroupePreviewCount(count);
    })();
    return () => { cancelled = true; };
  }, [modeDestinataire, groupeType, groupeValeur, ecoleId]);

  useEffect(() => {
    if (modeDestinataire !== 'etudiant' || !ecoleId || etudiantSearch.trim().length < 2) { setEtudiantResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('fn_get_etudiants_ecole', {
        p_ecole_id: ecoleId,
        p_search: etudiantSearch.trim(),
        p_niveau: null,
        p_limit: 8,
        p_offset: 0,
      });
      if (!cancelled) setEtudiantResults((data ?? []) as EtudiantOption[]);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [modeDestinataire, ecoleId, etudiantSearch]);

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id,ecole_id,expediteur_id,expediteur_nom,expediteur_role,destinataire_nom,destinataire_role,sujet,objet,contenu,lu,created_at,categorie,priorite,statut')
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
    const destOk = modeDestinataire === 'collegue' ? !!destinataireId : modeDestinataire === 'etudiant' ? !!etudiantId : !!groupeValeur;
    if (!contenu.trim() || !destOk) return;
    if (modeDestinataire === 'groupe') {
      const n = groupePreviewCount ?? 0;
      if (n === 0) { showToast('Aucun destinataire pour ce groupe', 'error'); return; }
      if (!confirm('Confirmer l\'envoi a ' + n + ' destinataire(s) ?')) return;
    }
    setSending(true);
    try {
      if (modeDestinataire === 'groupe') {
        const { error } = await supabase.rpc('fn_envoyer_message_groupe', {
          p_ecole_id:      ecoleId,
          p_type_groupe:   groupeType,
          p_valeur_groupe: groupeValeur,
          p_sujet:         sujet.trim() || null,
          p_contenu:       contenu.trim(),
          p_categorie:     categorieMsg || null,
          p_priorite:      prioriteMsg,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('fn_envoyer_message', {
          p_ecole_id:        ecoleId,
          p_destinataire_id: modeDestinataire === 'collegue' ? destinataireId : null,
          p_sujet:           sujet.trim() || null,
          p_contenu:         contenu.trim(),
          p_categorie:       categorieMsg || null,
          p_priorite:        prioriteMsg,
          p_etudiant_id:     modeDestinataire === 'etudiant' ? etudiantId : null,
        });
        if (error) throw error;
      }
      setModalOpen(false); setSujet(''); setContenu(''); setDestinataireId(''); setEtudiantId(''); setEtudiantSearch(''); setModeDestinataire('collegue'); setCategorieMsg(''); setPrioriteMsg('normale'); setGroupeValeur(''); setGroupePreviewCount(null);
      await load(); showToast('Message envoye');
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setSending(false); }
  }


async function handleSupprimer(id: string) {
    if (!confirm('Archiver ce message ?')) return;
    const { error } = await supabase.rpc('fn_supprimer_message', { p_message_id: id });
    if (error) { showToast(error.message, 'error'); return; }
    await load(); showToast('Message archive');
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

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={() => setOngletActif('recus')}
          style={{ padding: '8px 16px', border: 'none', borderBottom: ongletActif === 'recus' ? '2px solid #1e3a5f' : '2px solid transparent', background: 'none', fontSize: 13, fontWeight: 600, color: ongletActif === 'recus' ? '#1e3a5f' : '#6b7280', cursor: 'pointer' }}>
          Recus
        </button>
        <button onClick={() => setOngletActif('envoyes')}
          style={{ padding: '8px 16px', border: 'none', borderBottom: ongletActif === 'envoyes' ? '2px solid #1e3a5f' : '2px solid transparent', background: 'none', fontSize: 13, fontWeight: 600, color: ongletActif === 'envoyes' ? '#1e3a5f' : '#6b7280', cursor: 'pointer' }}>
          Envoyes
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '0 0 1rem' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setFilterQuick('tous')}
            style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: filterQuick === 'tous' ? '#1e3a5f' : '#fff', color: filterQuick === 'tous' ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Tous
          </button>
          <button onClick={() => setFilterQuick('non_lus')}
            style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: filterQuick === 'non_lus' ? '#1e3a5f' : '#fff', color: filterQuick === 'non_lus' ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Non lus
          </button>
          <button onClick={() => setFilterQuick('urgents')}
            style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: filterQuick === 'urgents' ? '#dc2626' : '#fff', color: filterQuick === 'urgents' ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Urgents
          </button>
          <button onClick={() => setFilterQuick('archives')}
            style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: filterQuick === 'archives' ? '#6b7280' : '#fff', color: filterQuick === 'archives' ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Archives
          </button>
        </div>
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Rechercher nom, objet, categorie..."
          style={{ flex: 1, minWidth: 180, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit' }} />
        <select value={periodeFiltre} onChange={e => setPeriodeFiltre(e.target.value as any)}
          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit' }}>
          <option value="tous">Toute periode</option>
          <option value="jour">Aujourd'hui</option>
          <option value="semaine">Cette semaine</option>
          <option value="mois">Ce mois</option>
        </select>
      </div>
      {loading ? <div className="loading">Chargement...</div> : (() => {
        const base = messages.filter(m => ongletActif === 'envoyes' ? m.expediteur_id === user?.utilisateur_id : m.expediteur_id !== user?.utilisateur_id);
        const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
        const debutSemaine = new Date(debutJour); debutSemaine.setDate(debutSemaine.getDate() - debutSemaine.getDay());
        const debutMois = new Date(debutJour.getFullYear(), debutJour.getMonth(), 1);
        const filtres = base.filter(m => {
          if (filterQuick === 'archives') { if (m.statut !== 'archive') return false; }
          else { if (m.statut === 'archive') return false; }
          if (filterQuick === 'non_lus' && m.lu) return false;
          if (filterQuick === 'urgents' && m.priorite !== 'urgente') return false;
          if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            const hay = [m.expediteur_nom, m.destinataire_nom, m.sujet, m.objet, m.categorie].filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
          }
          if (periodeFiltre !== 'tous') {
            const createdAt = new Date(m.created_at);
            if (periodeFiltre === 'jour' && createdAt < debutJour) return false;
            if (periodeFiltre === 'semaine' && createdAt < debutSemaine) return false;
            if (periodeFiltre === 'mois' && createdAt < debutMois) return false;
          }
          return true;
        });
        if (filtres.length === 0) {
          const filtresActifs = filterQuick !== 'tous' || searchQuery.trim().length > 0 || periodeFiltre !== 'tous';
          return <div className="empty-state"><h3>Aucun message</h3><p>{filtresActifs ? 'Aucun message ne correspond aux filtres' : (ongletActif === 'envoyes' ? 'Vous n\'avez envoye aucun message' : 'Aucun message recu')}</p></div>;
        }
        const groupes = new Map<string, Message[]>();
        filtres.forEach(m => {
          const cle = ongletActif === 'envoyes' ? (m.destinataire_nom || 'Destinataire inconnu') : (m.expediteur_nom || 'Expediteur inconnu');
          if (!groupes.has(cle)) groupes.set(cle, []);
          groupes.get(cle)!.push(m);
        });
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 780 }}>
            {Array.from(groupes.entries()).map(([interlocuteur, msgs]) => (
              <div key={interlocuteur}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '.5rem' }}>{interlocuteur}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                  {msgs.map(m => {
                    const isMine   = m.expediteur_id === user?.utilisateur_id;
                    const senderNom = m.expediteur_nom || (isMine ? (user?.nom ?? 'Moi') : 'Systeme');
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
                                X
                              </button>
                            )}
                          </div>
                        </div>
                        {(m.categorie || (m.priorite && m.priorite !== 'normale')) && (
                          <div style={{ display: 'flex', gap: 6, marginBottom: '.35rem' }}>
                            {m.categorie && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eef2ff', color: '#4338ca', letterSpacing: '.03em' }}>{m.categorie}</span>}
                            {m.priorite === 'urgente' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626' }}>URGENT</span>}
                            {m.priorite === 'haute' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#b45309' }}>HAUTE</span>}
                          </div>
                        )}
                        {sujetMsg && <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>{sujetMsg}</div>}
                        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{m.contenu}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Modal nouveau message */}
      {modalOpen && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ width: 520, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>✉ Nouveau message</h3>
              <button className="btn-ghost btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleEnvoyer} autoComplete="off">
              <div style={{ display: 'flex', gap: 8, marginBottom: '.75rem' }}>
                <button type="button" onClick={() => setModeDestinataire('collegue')} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: modeDestinataire === 'collegue' ? '1.5px solid #1e3a5f' : '1px solid #e5e7eb', background: modeDestinataire === 'collegue' ? '#eff6ff' : '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Collegue</button>
                <button type="button" onClick={() => setModeDestinataire('etudiant')} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: modeDestinataire === 'etudiant' ? '1.5px solid #1e3a5f' : '1px solid #e5e7eb', background: modeDestinataire === 'etudiant' ? '#eff6ff' : '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Etudiant</button>
                <button type="button" onClick={() => setModeDestinataire('groupe')} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: modeDestinataire === 'groupe' ? '1.5px solid #1e3a5f' : '1px solid #e5e7eb', background: modeDestinataire === 'groupe' ? '#eff6ff' : '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Groupe</button>
              </div>
              <div style={{ marginBottom: '.85rem', display: modeDestinataire === 'collegue' ? 'block' : 'none' }}>
                <label htmlFor="msg-destinataire">Destinataire *</label>
                <select id="msg-destinataire" name="destinataire" value={destinataireId}
                  onChange={e => setDestinataireId(e.target.value)}
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}>
                  <option value="">Choisir un destinataire…</option>
                  {destinataires.map(d => <option key={d.id} value={d.id}>{d.nom} ({d.role})</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '.85rem', display: modeDestinataire === 'etudiant' ? 'block' : 'none' }}>
                <label htmlFor="msg-etudiant-search">Etudiant *</label>
                <input id="msg-etudiant-search" name="etudiant-search" type="text" value={etudiantSearch}
                  onChange={e => { setEtudiantSearch(e.target.value); setEtudiantId(''); }}
                  placeholder="Nom, prenom ou matricule..."
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                {etudiantResults.length > 0 && (
                  <div style={{ marginTop: 6, border: '1px solid #e5e7eb', borderRadius: 6, maxHeight: 160, overflowY: 'auto' }}>
                    {etudiantResults.map(et => (
                      <div key={et.id} onClick={() => { setEtudiantId(et.id); setEtudiantSearch(et.nom + ' ' + et.prenom); setEtudiantResults([]); }}
                        style={{ padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', background: etudiantId === et.id ? '#eff6ff' : '#fff' }}>
                        {et.nom} {et.prenom} ({et.matricule})
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '.85rem' }}>
                <div style={{ marginBottom: '.85rem', display: modeDestinataire === 'groupe' ? 'block' : 'none' }}>
                <label htmlFor="msg-groupe-type">Cibler par</label>
                <select id="msg-groupe-type" name="groupe-type" value={groupeType}
                  onChange={e => { setGroupeType(e.target.value as any); setGroupeValeur(''); }}
                  style={{ width: '100%', marginTop: 4, marginBottom: 8, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}>
                  <option value="niveau">Niveau</option>
                  <option value="filiere">Filiere</option>
                  <option value="role">Role (collegues)</option>
                </select>
                <select id="msg-groupe-valeur" name="groupe-valeur" value={groupeValeur}
                  onChange={e => setGroupeValeur(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}>
                  <option value="">Choisir...</option>
                  {groupeType === 'niveau' && niveauxOptions.map(n => <option key={n} value={n}>{n}</option>)}
                  {groupeType === 'filiere' && filieresOptions.map(f => <option key={f} value={f}>{f}</option>)}
                  {groupeType === 'role' && ['admin', 'direction', 'enseignant'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {groupeValeur && (
                  <div style={{ marginTop: 6, fontSize: 12, color: groupePreviewCount === 0 ? '#dc2626' : '#6b7280' }}>
                    {groupePreviewCount === null ? 'Calcul...' : groupePreviewCount + ' destinataire(s)'}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '.85rem', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="msg-categorie">Categorie</label>
                    <select id="msg-categorie" name="categorie" value={categorieMsg} onChange={e => setCategorieMsg(e.target.value)}
                      style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
                      <option value="">Non categorise</option>
                      <option value="ADM">ADM - Administration</option>
                      <option value="PED">PED - Pedagogie</option>
                      <option value="NOT">NOT - Notes et resultats</option>
                      <option value="ABS">ABS - Absences</option>
                      <option value="FIN">FIN - Comptabilite</option>
                      <option value="EXA">EXA - Examens</option>
                      <option value="REL">REL - Releves</option>
                      <option value="SUP">SUP - Support</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="msg-priorite">Priorite</label>
                    <select id="msg-priorite" name="priorite" value={prioriteMsg} onChange={e => setPrioriteMsg(e.target.value)}
                      style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
                      <option value="basse">Basse</option>
                      <option value="normale">Normale</option>
                      <option value="haute">Haute</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>
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
                <button type="submit" className="btn-blue" disabled={sending || (modeDestinataire === 'collegue' ? !destinataireId : !etudiantId)}>{sending ? 'Envoi…' : 'Envoyer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
