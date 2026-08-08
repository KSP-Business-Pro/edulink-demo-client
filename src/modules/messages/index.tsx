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
  est_officiel?: boolean; date_lecture?: string | null;
  gel_legal?: boolean;
}

interface PieceJointe {
  id: string; message_id: string; nom_fichier: string;
  chemin_storage: string; taille_octets: number; mime_type: string;
}

const PJ_MAX_OCTETS = 10 * 1024 * 1024; // 10 Mo, aligné sur le bucket
const PJ_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';

interface DashboardStats {
  totalEnvoyes:     number;
  tauxLecture:      number; // pourcentage arrondi
  urgentsNonLus:    number;
  echecs:           { email: number; sms: number; push: number; total: number };
  relancesPaiement: number;
  alertesAbsence:   number;
}

// ── Conservation (Chantier F point 3) ───────────────────────────────────────
interface PolitiqueConservation { id: string; ecole_id: string | null; cible: string; duree_mois: number }
interface JournalPurge {
  id: string; execute_le: string;
  nb_messages: number; nb_pieces_jointes: number; nb_journal_notifications: number;
}
interface PreviewPurge {
  nb_messages: number; nb_pieces_jointes: number; nb_journal_notifications: number;
  par_cible: { cible: string; nb: number }[];
}

const CIBLES_ORDRE = ['ADM', 'PED', 'NOT', 'ABS', 'FIN', 'EXA', 'REL', 'SUP', 'OFFICIEL', 'JOURNAL'];
const CIBLE_LABELS: Record<string, string> = {
  ADM: 'Administration', PED: 'Pédagogie', NOT: 'Notes et résultats', ABS: 'Absences',
  FIN: 'Comptabilité (10 ans OHADA par défaut)', EXA: 'Examens', REL: 'Relevés', SUP: 'Support',
  OFFICIEL: 'Messages officiels (valeur probatoire)', JOURNAL: 'Journal des notifications',
};

type Onglet = 'recus' | 'envoyes' | 'dashboard' | 'validation' | 'conservation';

export default function MessagesPage() {
  const { user, isSuperAdmin, activeEcoleId } = useAuth();
  const [ecoleId, setEcoleId] = useState<string>(user?.ecole_id ?? '');

  // École pilotée par la sidebar (super-admin) : tout changement y réaligne le module.
  // Le sélecteur local du module reste utilisable pour un override ponctuel.
  useEffect(() => {
    if (activeEcoleId) setEcoleId(activeEcoleId);
  }, [activeEcoleId]);
  const [ecoles, setEcoles]   = useState<EcoleOption[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('ecoles').select('id,nom').eq('actif', true).order('nom').then(({ data }) => {
      setEcoles(data ?? []);
      if (!ecoleId && !activeEcoleId && data?.[0]) setEcoleId(data[0].id);
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
  const [ongletActif, setOngletActif] = useState<Onglet>('recus');
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

  // ── Tableau de bord (§12 doc spec) ────────────────────────────────────────
  const [dashStats, setDashStats]     = useState<DashboardStats | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // ── Pièces jointes (Chantier F) ───────────────────────────────────────────
  const [fichiersJoints, setFichiersJoints] = useState<File[]>([]);
  const [piecesJointes, setPiecesJointes]   = useState<Record<string, PieceJointe[]>>({});

  // ── Message officiel + validation direction (Chantier F point 2) ─────────
  const [estOfficiel, setEstOfficiel]           = useState(false);
  const [messagesAValider, setMessagesAValider] = useState<Message[]>([]);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const peutValider = user?.role === 'direction' || user?.role === 'admin';

  // ── Conservation / purge (Chantier F point 3) ────────────────────────────
  const [politiques, setPolitiques]           = useState<PolitiqueConservation[]>([]);
  const [politiquesLoading, setPolitiquesLoading] = useState(false);
  const [dureesEdit, setDureesEdit]           = useState<Record<string, string>>({});
  const [previewPurge, setPreviewPurge]       = useState<PreviewPurge | null>(null);
  const [previewLoading, setPreviewLoading]   = useState(false);
  const [purgeEnCours, setPurgeEnCours]       = useState(false);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [journalPurges, setJournalPurges]     = useState<JournalPurge[]>([]);

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
        .select('id,ecole_id,expediteur_id,expediteur_nom,expediteur_role,destinataire_nom,destinataire_role,sujet,objet,contenu,lu,created_at,categorie,priorite,statut,est_officiel,date_lecture,gel_legal')
        .eq('ecole_id', ecoleId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const msgs = (data ?? []) as Message[];
      setMessages(msgs);
      // Chantier F — charger les PJ des messages affichés
      if (msgs.length > 0) {
        const { data: pjs } = await supabase
          .from('message_pieces_jointes')
          .select('id,message_id,nom_fichier,chemin_storage,taille_octets,mime_type')
          .in('message_id', msgs.map(m => m.id));
        const map: Record<string, PieceJointe[]> = {};
        ((pjs ?? []) as PieceJointe[]).forEach(pj => {
          if (!map[pj.message_id]) map[pj.message_id] = [];
          map[pj.message_id].push(pj);
        });
        setPiecesJointes(map);
      } else {
        setPiecesJointes({});
      }
    } finally { setLoading(false); }
  }, [ecoleId]);

  useEffect(() => { load(); }, [load]);

  // ── Chargement des indicateurs du tableau de bord (§12) ──────────────────
  const loadDashboard = useCallback(async () => {
    if (!ecoleId) return;
    setDashLoading(true);
    try {
      const [
        { count: totalEnvoyes },
        { count: totalLus },
        { count: urgentsNonLus },
        { data: echecsData },
        { count: relancesPaiement },
        { count: alertesAbsence },
      ] = await Promise.all([
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId).eq('lu', true),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId).eq('priorite', 'urgente').eq('lu', false).neq('statut', 'archive'),
        supabase.from('journal_notifications').select('canal').eq('ecole_id', ecoleId).eq('statut', 'echec'),
        supabase.from('relances_paiement').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId).eq('categorie', 'ABS'),
      ]);

      const echecs = { email: 0, sms: 0, push: 0, total: 0 };
      (echecsData ?? []).forEach((r: any) => {
        if (r.canal === 'email') echecs.email++;
        else if (r.canal === 'sms') echecs.sms++;
        else if (r.canal === 'push') echecs.push++;
        echecs.total++;
      });

      setDashStats({
        totalEnvoyes: totalEnvoyes ?? 0,
        tauxLecture: totalEnvoyes ? Math.round(((totalLus ?? 0) / totalEnvoyes) * 100) : 0,
        urgentsNonLus: urgentsNonLus ?? 0,
        echecs,
        relancesPaiement: relancesPaiement ?? 0,
        alertesAbsence: alertesAbsence ?? 0,
      });
    } finally { setDashLoading(false); }
  }, [ecoleId]);

  useEffect(() => {
    if (ongletActif === 'dashboard') loadDashboard();
  }, [ongletActif, loadDashboard]);

  // ── Marquage automatique de lecture (Chantier F : accusé pour officiels) ─
  useEffect(() => {
    if (ongletActif !== 'recus' || !messages.length) return;
    const nonLus = messages.filter(m => m.expediteur_id !== user?.utilisateur_id && !m.lu && m.statut !== 'archive');
    if (!nonLus.length) return;
    (async () => {
      for (const m of nonLus) {
        const patch: Record<string, any> = { lu: true, lu_at: new Date().toISOString() };
        if (m.est_officiel) patch.date_lecture = new Date().toISOString();
        await supabase.from('messages').update(patch).eq('id', m.id);
      }
      await load();
    })();
  }, [ongletActif, messages]); // eslint-disable-line

  // ── File d'attente de validation (direction/admin uniquement) ────────────
  const loadAValider = useCallback(async () => {
    if (!ecoleId) return;
    setLoadingValidation(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id,ecole_id,expediteur_id,expediteur_nom,expediteur_role,destinataire_nom,destinataire_role,sujet,objet,contenu,lu,created_at,categorie,priorite,statut,est_officiel,date_lecture,gel_legal')
        .eq('ecole_id', ecoleId).eq('statut', 'brouillon').eq('est_officiel', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMessagesAValider((data ?? []) as Message[]);
    } finally { setLoadingValidation(false); }
  }, [ecoleId]);

  useEffect(() => {
    if (ongletActif === 'validation') loadAValider();
  }, [ongletActif, loadAValider]);

  // ── Conservation : politiques + journal des purges (Chantier F point 3) ──
  const loadConservation = useCallback(async () => {
    if (!ecoleId) return;
    setPolitiquesLoading(true);
    try {
      const [{ data: pols, error: errPols }, { data: purges, error: errPurges }] = await Promise.all([
        supabase.from('politiques_conservation')
          .select('id,ecole_id,cible,duree_mois')
          .or(`ecole_id.eq.${ecoleId},ecole_id.is.null`),
        supabase.from('journal_purges')
          .select('id,execute_le,nb_messages,nb_pieces_jointes,nb_journal_notifications')
          .eq('ecole_id', ecoleId)
          .order('execute_le', { ascending: false })
          .limit(20),
      ]);
      if (errPols) throw errPols;
      if (errPurges) throw errPurges;
      const lignes = (pols ?? []) as PolitiqueConservation[];
      setPolitiques(lignes);
      setJournalPurges((purges ?? []) as JournalPurge[]);
      const edit: Record<string, string> = {};
      CIBLES_ORDRE.forEach(c => {
        const ecole   = lignes.find(p => p.cible === c && p.ecole_id === ecoleId);
        const globale = lignes.find(p => p.cible === c && p.ecole_id === null);
        edit[c] = String(ecole?.duree_mois ?? globale?.duree_mois ?? 24);
      });
      setDureesEdit(edit);
      setPreviewPurge(null); // toute entrée dans l'onglet invalide l'ancienne prévisualisation
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally { setPolitiquesLoading(false); }
  }, [ecoleId]);

  useEffect(() => {
    if (ongletActif === 'conservation') loadConservation();
  }, [ongletActif, loadConservation]);

  async function handleValider(id: string) {
    if (!confirm('Valider et envoyer ce message officiel aux destinataires ?')) return;
    try {
      const { data: nb, error } = await supabase.rpc('fn_valider_message_officiel', { p_message_id: id });
      if (error) throw error;
      showToast(`Message validé et envoyé à ${nb} destinataire(s)`);
      await loadAValider();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleRejeter(id: string) {
    const motif = window.prompt('Motif du rejet (optionnel) :');
    if (motif === null) return;
    try {
      const { error } = await supabase.rpc('fn_rejeter_message_officiel', { p_message_id: id, p_motif: motif || null });
      if (error) throw error;
      showToast('Message rejeté');
      await loadAValider();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  // ── Conservation : enregistrer une durée (surcharge école) ───────────────
  async function handleEnregistrerDuree(cible: string) {
    const val = parseInt(dureesEdit[cible] ?? '', 10);
    if (!Number.isFinite(val) || val < 1 || val > 1200) { showToast('Durée invalide (1 à 1200 mois)', 'error'); return; }
    const existante = politiques.find(p => p.cible === cible && p.ecole_id === ecoleId);
    const globale   = politiques.find(p => p.cible === cible && p.ecole_id === null);
    try {
      if (globale && val === globale.duree_mois) {
        if (existante) {
          // Revient à la valeur globale -> on retire la surcharge école
          const { error } = await supabase.from('politiques_conservation').delete().eq('id', existante.id);
          if (error) throw error;
          showToast('Surcharge retirée — valeur globale rétablie');
        } else {
          showToast('Déjà la valeur globale, rien à enregistrer');
          return;
        }
      } else if (existante) {
        const { error } = await supabase.from('politiques_conservation')
          .update({ duree_mois: val, updated_at: new Date().toISOString() })
          .eq('id', existante.id);
        if (error) throw error;
        showToast(`${CIBLE_LABELS[cible] ?? cible} : ${val} mois (surcharge école)`);
      } else {
        const { error } = await supabase.from('politiques_conservation')
          .insert({ ecole_id: ecoleId, cible, duree_mois: val });
        if (error) throw error;
        showToast(`${CIBLE_LABELS[cible] ?? cible} : ${val} mois (surcharge école)`);
      }
      await loadConservation();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  // ── Conservation : prévisualisation OBLIGATOIRE avant purge ──────────────
  async function handlePrevisualiser() {
    setPreviewLoading(true);
    setPreviewPurge(null);
    try {
      const { data, error } = await supabase.rpc('fn_previsualiser_purge', { p_ecole_id: ecoleId });
      if (error) throw error;
      setPreviewPurge(data as PreviewPurge);
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setPreviewLoading(false); }
  }

  // ── Conservation : purge réelle via l'Edge Function purge-messages ───────
  async function handlePurger() {
    setConfirmPurgeOpen(false);
    setPurgeEnCours(true);
    try {
      const { data, error } = await supabase.functions.invoke('purge-messages', {
        body: { ecole_id: ecoleId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const nbEchecs = (data?.echecs_storage ?? []).length;
      showToast(
        `Purge effectuée : ${data?.nb_messages ?? 0} message(s), ${data?.fichiers_storage_supprimes ?? 0} fichier(s), ${data?.nb_journal_notifications ?? 0} ligne(s) de journal`
        + (nbEchecs > 0 ? ` — ⚠ ${nbEchecs} fichier(s) storage en échec` : ''),
        nbEchecs > 0 ? 'error' : 'success',
      );
      await loadConservation();
      await load();
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setPurgeEnCours(false); }
  }

  // ── Conservation : gel légal (direction/admin, messages archivés) ────────
  async function handleGelLegal(m: Message) {
    const nouveau = !m.gel_legal;
    const question = nouveau
      ? 'Poser un gel légal sur ce message ? Il sera exclu de toute purge tant que le gel est actif.'
      : 'Lever le gel légal de ce message ? Il redeviendra purgeable à expiration de son délai.';
    if (!confirm(question)) return;
    try {
      const { error } = await supabase.rpc('fn_definir_gel_legal', { p_message_id: m.id, p_gel: nouveau });
      if (error) throw error;
      showToast(nouveau ? '🔒 Gel légal posé' : '🔓 Gel légal levé');
      await load();
    } catch (err: any) { showToast(err.message, 'error'); }
  }

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
      if (estOfficiel) {
        const { data: messageId, error } = await supabase.rpc('fn_creer_message_officiel_brouillon', {
          p_ecole_id:       ecoleId,
          p_mode:           modeDestinataire,
          p_destinataire_id: modeDestinataire === 'collegue' ? destinataireId : null,
          p_etudiant_id:    modeDestinataire === 'etudiant' ? etudiantId : null,
          p_type_groupe:    modeDestinataire === 'groupe' ? groupeType : null,
          p_valeur_groupe:  modeDestinataire === 'groupe' ? groupeValeur : null,
          p_sujet:          sujet.trim() || null,
          p_contenu:        contenu.trim(),
          p_categorie:      categorieMsg || null,
          p_priorite:       prioriteMsg,
        });
        if (error) throw error;
        if (messageId && fichiersJoints.length > 0) {
          let pjEchecs = 0;
          for (const f of fichiersJoints) {
            try {
              const chemin = `${ecoleId}/${messageId}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
              const { error: upErr } = await supabase.storage.from('messages-pieces-jointes').upload(chemin, f, { contentType: f.type });
              if (upErr) throw upErr;
              const { error: insErr } = await supabase.from('message_pieces_jointes').insert({
                message_id: messageId, ecole_id: ecoleId,
                nom_fichier: f.name, chemin_storage: chemin,
                taille_octets: f.size, mime_type: f.type,
                uploade_par: user?.id ?? null,
              });
              if (insErr) throw insErr;
            } catch { pjEchecs++; }
          }
          if (pjEchecs > 0) showToast(`Brouillon cree mais ${pjEchecs} piece(s) jointe(s) en echec`, 'error');
        }
        setModalOpen(false); setSujet(''); setContenu(''); setDestinataireId(''); setEtudiantId(''); setEtudiantSearch(''); setModeDestinataire('collegue'); setCategorieMsg(''); setPrioriteMsg('normale'); setGroupeValeur(''); setGroupePreviewCount(null); setFichiersJoints([]); setEstOfficiel(false);
        showToast('Brouillon envoyé pour validation par la direction');
        setSending(false);
        return;
      }
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
        const { data: messageId, error } = await supabase.rpc('fn_envoyer_message', {
          p_ecole_id:        ecoleId,
          p_destinataire_id: modeDestinataire === 'collegue' ? destinataireId : null,
          p_sujet:           sujet.trim() || null,
          p_contenu:         contenu.trim(),
          p_categorie:       categorieMsg || null,
          p_priorite:        prioriteMsg,
          p_etudiant_id:     modeDestinataire === 'etudiant' ? etudiantId : null,
        });
        if (error) throw error;
        // Chantier F — upload des pièces jointes une fois le message créé
        if (messageId && fichiersJoints.length > 0) {
          let pjEchecs = 0;
          for (const f of fichiersJoints) {
            try {
              const chemin = `${ecoleId}/${messageId}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
              const { error: upErr } = await supabase.storage
                .from('messages-pieces-jointes')
                .upload(chemin, f, { contentType: f.type });
              if (upErr) throw upErr;
              const { error: insErr } = await supabase.from('message_pieces_jointes').insert({
                message_id: messageId, ecole_id: ecoleId,
                nom_fichier: f.name, chemin_storage: chemin,
                taille_octets: f.size, mime_type: f.type,
                uploade_par: user?.id ?? null,
              });
              if (insErr) throw insErr;
            } catch { pjEchecs++; }
          }
          if (pjEchecs > 0) showToast(`Message envoye mais ${pjEchecs} piece(s) jointe(s) en echec`, 'error');
        }
      }
      setModalOpen(false); setSujet(''); setContenu(''); setDestinataireId(''); setEtudiantId(''); setEtudiantSearch(''); setModeDestinataire('collegue'); setCategorieMsg(''); setPrioriteMsg('normale'); setGroupeValeur(''); setGroupePreviewCount(null); setFichiersJoints([]);
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

  // ── Pièces jointes : helpers (Chantier F) ────────────────────────────────
  function formatTaille(octets: number): string {
    if (octets < 1024) return octets + ' o';
    if (octets < 1048576) return (octets / 1024).toFixed(0) + ' Ko';
    return (octets / 1048576).toFixed(1) + ' Mo';
  }

  function handleFichiersChoisis(e: React.ChangeEvent<HTMLInputElement>) {
    const nouveaux = Array.from(e.target.files ?? []);
    const valides: File[] = [];
    for (const f of nouveaux) {
      if (f.size > PJ_MAX_OCTETS) { showToast(`${f.name} depasse 10 Mo`, 'error'); continue; }
      valides.push(f);
    }
    setFichiersJoints(prev => [...prev, ...valides]);
    e.target.value = ''; // permet de re-sélectionner le même fichier
  }

  async function telechargerPj(pj: PieceJointe) {
    const { data, error } = await supabase.storage
      .from('messages-pieces-jointes')
      .createSignedUrl(pj.chemin_storage, 3600);
    if (error || !data?.signedUrl) { showToast('Telechargement impossible', 'error'); return; }
    window.open(data.signedUrl, '_blank');
  }

  // ── Carte KPI réutilisable pour le tableau de bord ────────────────────────
  function KpiCard({ label, value, color, bg, note }: { label: string; value: string; color: string; bg: string; note?: string }) {
    return (
      <div style={{ background: bg, border: '1px solid #f1f5f9', borderRadius: 12, padding: '1.1rem' }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
        {note && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{note}</div>}
      </div>
    );
  }

  function KpiIndisponible({ label, raison }: { label: string; raison: string }) {
    return (
      <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12, padding: '1.1rem' }}>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#9ca3af' }}>Non disponible</div>
        <div style={{ fontSize: 10, color: '#b0b7c3', marginTop: 4 }}>{raison}</div>
      </div>
    );
  }

  const totalPreview = previewPurge
    ? previewPurge.nb_messages + previewPurge.nb_pieces_jointes + previewPurge.nb_journal_notifications
    : 0;

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

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
        <button onClick={() => setOngletActif('recus')}
          style={{ padding: '8px 16px', border: 'none', borderBottom: ongletActif === 'recus' ? '2px solid #1e3a5f' : '2px solid transparent', background: 'none', fontSize: 13, fontWeight: 600, color: ongletActif === 'recus' ? '#1e3a5f' : '#6b7280', cursor: 'pointer' }}>
          Recus
        </button>
        <button onClick={() => setOngletActif('envoyes')}
          style={{ padding: '8px 16px', border: 'none', borderBottom: ongletActif === 'envoyes' ? '2px solid #1e3a5f' : '2px solid transparent', background: 'none', fontSize: 13, fontWeight: 600, color: ongletActif === 'envoyes' ? '#1e3a5f' : '#6b7280', cursor: 'pointer' }}>
          Envoyes
        </button>
        <button onClick={() => setOngletActif('dashboard')}
          style={{ padding: '8px 16px', border: 'none', borderBottom: ongletActif === 'dashboard' ? '2px solid #1e3a5f' : '2px solid transparent', background: 'none', fontSize: 13, fontWeight: 600, color: ongletActif === 'dashboard' ? '#1e3a5f' : '#6b7280', cursor: 'pointer' }}>
          📊 Tableau de bord
        </button>
        {peutValider && (
          <button onClick={() => setOngletActif('validation')}
            style={{ padding: '8px 16px', border: 'none', borderBottom: ongletActif === 'validation' ? '2px solid #7c3aed' : '2px solid transparent', background: 'none', fontSize: 13, fontWeight: 600, color: ongletActif === 'validation' ? '#7c3aed' : '#6b7280', cursor: 'pointer' }}>
            🛡️ À valider{messagesAValider.length > 0 ? ` (${messagesAValider.length})` : ''}
          </button>
        )}
        {peutValider && (
          <button onClick={() => setOngletActif('conservation')}
            style={{ padding: '8px 16px', border: 'none', borderBottom: ongletActif === 'conservation' ? '2px solid #0f766e' : '2px solid transparent', background: 'none', fontSize: 13, fontWeight: 600, color: ongletActif === 'conservation' ? '#0f766e' : '#6b7280', cursor: 'pointer' }}>
            🗄️ Conservation
          </button>
        )}
      </div>

      {ongletActif === 'conservation' ? (
        politiquesLoading ? <div className="loading">Chargement…</div> : (
          <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* ── Bloc 1 : politique de conservation ── */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.2rem' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f766e', marginBottom: 4 }}>Politique de conservation</div>
              <div style={{ fontSize: 11.5, color: '#6b7280', marginBottom: '.9rem', lineHeight: 1.5 }}>
                Durée (en mois) pendant laquelle un message <b>archivé</b> est conservé avant d'être purgeable.
                Les valeurs par défaut sont globales ; toute modification crée une surcharge propre à l'établissement.
                Les messages sous <b>gel légal</b> ne sont jamais purgés, quelle que soit la durée.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CIBLES_ORDRE.map(cible => {
                  const surchargeEcole = politiques.find(p => p.cible === cible && p.ecole_id === ecoleId);
                  const globale        = politiques.find(p => p.cible === cible && p.ecole_id === null);
                  return (
                    <div key={cible} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#f8fafc', borderRadius: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#e0f2f1', color: '#0f766e', marginRight: 6 }}>{cible}</span>
                        <span style={{ fontSize: 12, color: '#374151' }}>{CIBLE_LABELS[cible] ?? cible}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: surchargeEcole ? '#b45309' : '#9ca3af', flexShrink: 0 }}>
                        {surchargeEcole ? 'école' : `globale${globale ? ` (${globale.duree_mois})` : ''}`}
                      </span>
                      <input type="number" min={1} max={1200} value={dureesEdit[cible] ?? ''}
                        onChange={e => setDureesEdit(prev => ({ ...prev, [cible]: e.target.value }))}
                        style={{ width: 70, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', textAlign: 'right' }} />
                      <span style={{ fontSize: 11, color: '#9ca3af', width: 30 }}>mois</span>
                      <button type="button" onClick={() => handleEnregistrerDuree(cible)}
                        style={{ background: '#fff', border: '1px solid #99f6e4', color: '#0f766e', padding: '5px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                        Enregistrer
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Bloc 2 : purge en deux temps (prévisualisation obligatoire) ── */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.2rem' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f766e', marginBottom: 4 }}>Purge des messages expirés</div>
              <div style={{ fontSize: 11.5, color: '#6b7280', marginBottom: '.9rem', lineHeight: 1.5 }}>
                Étape 1 : analyser ce qui est arrivé à expiration. Étape 2 : purger — <b>suppression définitive</b> des messages,
                de leurs pièces jointes (base + fichiers) et des lignes de journal expirées. Chaque purge est tracée ci-dessous.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={handlePrevisualiser} disabled={previewLoading || purgeEnCours}
                  style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: previewLoading || purgeEnCours ? .6 : 1 }}>
                  {previewLoading ? 'Analyse…' : '1. Analyser les expirations'}
                </button>
                <button type="button" onClick={() => setConfirmPurgeOpen(true)}
                  disabled={!previewPurge || totalPreview === 0 || purgeEnCours}
                  style={{ background: previewPurge && totalPreview > 0 ? '#dc2626' : '#f3f4f6', color: previewPurge && totalPreview > 0 ? '#fff' : '#9ca3af', border: 'none', padding: '7px 16px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: previewPurge && totalPreview > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  {purgeEnCours ? 'Purge en cours…' : '2. Purger maintenant'}
                </button>
              </div>
              {previewPurge && (
                <div style={{ marginTop: '.9rem', background: totalPreview > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${totalPreview > 0 ? '#fecaca' : '#bbf7d0'}`, borderRadius: 8, padding: '.8rem 1rem' }}>
                  {totalPreview === 0 ? (
                    <div style={{ fontSize: 12.5, color: '#059669', fontWeight: 600 }}>✓ Rien à purger — aucun élément arrivé à expiration.</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                        Seront supprimés définitivement : {previewPurge.nb_messages} message(s), {previewPurge.nb_pieces_jointes} pièce(s) jointe(s), {previewPurge.nb_journal_notifications} ligne(s) de journal
                      </div>
                      {previewPurge.par_cible.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {previewPurge.par_cible.map(pc => (
                            <span key={pc.cible} style={{ fontSize: 10.5, fontWeight: 600, background: '#fff', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 4, padding: '2px 6px' }}>
                              {pc.cible} : {pc.nb}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Bloc 3 : historique des purges ── */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.2rem' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f766e', marginBottom: '.75rem' }}>Historique des purges</div>
              {journalPurges.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>Aucune purge exécutée pour le moment.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {journalPurges.map(jp => (
                    <div key={jp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#f8fafc', borderRadius: 8, padding: '6px 10px' }}>
                      <span style={{ color: '#374151', fontWeight: 600 }}>{formatDate(jp.execute_le)}</span>
                      <span style={{ color: '#6b7280' }}>
                        {jp.nb_messages} msg · {jp.nb_pieces_jointes} PJ · {jp.nb_journal_notifications} journal
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      ) : ongletActif === 'validation' ? (
        loadingValidation ? <div className="loading">Chargement…</div> : (
          messagesAValider.length === 0 ? (
            <div className="empty-state"><h3>Aucun message en attente</h3><p>Tous les messages officiels ont été traités.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', maxWidth: 780 }}>
              {messagesAValider.map(m => (
                <div key={m.id} style={{ background: '#fff', border: '1.5px solid #ddd6fe', borderRadius: 12, padding: '1rem 1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                    <div>
                      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed', marginRight: 6 }}>🛡️ OFFICIEL</span>
                      {m.categorie && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eef2ff', color: '#4338ca' }}>{m.categorie}</span>}
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', marginTop: 4 }}>De {m.expediteur_nom} ({m.expediteur_role}) → {m.destinataire_nom}</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(m.created_at)}</div>
                  </div>
                  {(m.sujet || m.objet) && <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>{m.sujet || m.objet}</div>}
                  <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginBottom: '.75rem' }}>{m.contenu}</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: '.6rem', borderTop: '1px solid #f3f4f6' }}>
                    <button onClick={() => handleRejeter(m.id)} style={{ background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Rejeter</button>
                    <button onClick={() => handleValider(m.id)} style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Valider et envoyer</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )
      ) : ongletActif === 'dashboard' ? (
        dashLoading || !dashStats ? <div className="loading">Chargement…</div> : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
              <KpiCard label="Messages envoyés" value={String(dashStats.totalEnvoyes)} color="#1e3a5f" bg="#f8fafc" />
              <KpiCard label="Taux de lecture" value={dashStats.tauxLecture + '%'} color="#059669" bg="#f0fdf4" />
              <KpiCard label="Urgents non lus" value={String(dashStats.urgentsNonLus)} color={dashStats.urgentsNonLus > 0 ? '#dc2626' : '#059669'} bg={dashStats.urgentsNonLus > 0 ? '#fef2f2' : '#f0fdf4'} />
              <KpiCard label="Messages échoués" value={String(dashStats.echecs.total)}
                color={dashStats.echecs.total > 0 ? '#dc2626' : '#059669'} bg={dashStats.echecs.total > 0 ? '#fef2f2' : '#f0fdf4'}
                note={dashStats.echecs.total > 0 ? `email ${dashStats.echecs.email} · sms ${dashStats.echecs.sms} · push ${dashStats.echecs.push}` : undefined} />
              <KpiCard label="Relances paiement envoyées" value={String(dashStats.relancesPaiement)} color="#7c3aed" bg="#faf5ff" note="Relances manuelles (module Recouvrement)" />
              <KpiCard label="Alertes absence envoyées" value={String(dashStats.alertesAbsence)} color="#d97706" bg="#fffbeb" />
              <KpiIndisponible label="Temps moyen de réponse" raison="Aucun système de suivi de conversation/support" />
              <KpiIndisponible label="Tickets support ouverts" raison="Fonctionnalité de ticketing non implémentée" />
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              Indicateurs calculés sur l'ensemble des messages de l'établissement (pas seulement les 50 derniers affichés dans Reçus/Envoyés).
            </div>
          </div>
        )
      ) : (
        <>
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
                                {filterQuick === 'archives' && peutValider && (
                                  <button onClick={() => handleGelLegal(m)}
                                    title={m.gel_legal ? 'Lever le gel légal' : 'Poser un gel légal (exclut de toute purge)'}
                                    style={{ background: m.gel_legal ? '#fef3c7' : 'none', border: m.gel_legal ? '1px solid #fcd34d' : '1px solid #e5e7eb', color: m.gel_legal ? '#b45309' : '#6b7280', cursor: 'pointer', padding: '2px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6, fontFamily: 'inherit' }}>
                                    {m.gel_legal ? '🔒 Gelé' : '🔓 Geler'}
                                  </button>
                                )}
                                {isMine && filterQuick !== 'archives' && (
                                  <button onClick={() => handleSupprimer(m.id)}
                                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px 5px', fontSize: 14, lineHeight: 1 }}>
                                    X
                                  </button>
                                )}
                              </div>
                            </div>
                            {(m.categorie || (m.priorite && m.priorite !== 'normale') || m.est_officiel || m.gel_legal) && (
                              <div style={{ display: 'flex', gap: 6, marginBottom: '.35rem' }}>
                                {m.est_officiel && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed' }}>🛡️ OFFICIEL</span>}
                                {m.gel_legal && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#b45309' }}>🔒 GEL LÉGAL</span>}
                                {m.categorie && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eef2ff', color: '#4338ca', letterSpacing: '.03em' }}>{m.categorie}</span>}
                                {m.priorite === 'urgente' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626' }}>URGENT</span>}
                                {m.priorite === 'haute' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#b45309' }}>HAUTE</span>}
                              </div>
                            )}
                            {sujetMsg && <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: '.25rem' }}>{sujetMsg}</div>}
                            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{m.contenu}</div>
                            {(piecesJointes[m.id] ?? []).length > 0 && (
                              <div style={{ marginTop: '.6rem', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {(piecesJointes[m.id] ?? []).map(pj => (
                                  <button key={pj.id} type="button" onClick={() => telechargerPj(pj)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, color: '#1d4ed8', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    📎 {pj.nom_fichier} <span style={{ color: '#93b5f5' }}>({formatTaille(pj.taille_octets)})</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {m.est_officiel && (
                              <div style={{ marginTop: '.5rem', fontSize: 10.5, color: m.date_lecture ? '#059669' : '#9ca3af', fontWeight: 600 }}>
                                {m.date_lecture ? `✓ Accusé de lecture le ${formatDate(m.date_lecture)}` : '○ En attente d\'accusé de lecture'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {/* Modal de confirmation de purge (Chantier F point 3) */}
      {confirmPurgeOpen && previewPurge && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setConfirmPurgeOpen(false)}>
          <div className="modal" style={{ width: 440, padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 .75rem', fontSize: 15, fontWeight: 700, color: '#dc2626' }}>⚠ Confirmer la purge définitive</h3>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: '.75rem' }}>
              Cette action est <b>irréversible</b>. Seront supprimés définitivement :
            </div>
            <ul style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: '0 0 .75rem', paddingLeft: '1.2rem' }}>
              <li><b>{previewPurge.nb_messages}</b> message(s) archivé(s) expiré(s)</li>
              <li><b>{previewPurge.nb_pieces_jointes}</b> pièce(s) jointe(s) (base + fichiers du bucket)</li>
              <li><b>{previewPurge.nb_journal_notifications}</b> ligne(s) du journal des notifications</li>
            </ul>
            <div style={{ fontSize: 11.5, color: '#6b7280', marginBottom: '1.2rem' }}>
              Les messages sous gel légal sont exclus. Une trace agrégée sera conservée dans l'historique des purges.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
              <button type="button" className="btn-ghost" onClick={() => setConfirmPurgeOpen(false)}>Annuler</button>
              <button type="button" onClick={handlePurger}
                style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Purger définitivement
              </button>
            </div>
          </div>
        </div>
      )}

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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginBottom: '.85rem', cursor: 'pointer', color: '#7c3aed', fontWeight: 600 }}>
                <input type="checkbox" checked={estOfficiel} onChange={e => setEstOfficiel(e.target.checked)} />
                🛡️ Message officiel (nécessite validation de la direction avant envoi)
              </label>
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
              {modeDestinataire !== 'groupe' && (
                <div style={{ marginBottom: '.85rem' }}>
                  <label htmlFor="msg-pj">Pieces jointes <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(PDF, images, Word/Excel — 10 Mo max)</span></label>
                  <input id="msg-pj" name="pieces-jointes" type="file" multiple accept={PJ_ACCEPT}
                    onChange={handleFichiersChoisis}
                    style={{ width: '100%', marginTop: 4, fontSize: 12.5 }} />
                  {fichiersJoints.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {fichiersJoints.map((f, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {f.name} <span style={{ color: '#9ca3af' }}>({formatTaille(f.size)})</span></span>
                          <button type="button" onClick={() => setFichiersJoints(prev => prev.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginBottom: '1.2rem' }}>
                <label htmlFor="msg-contenu">Message *</label>
                <textarea id="msg-contenu" name="contenu" value={contenu} onChange={e => setContenu(e.target.value)} rows={5} required
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="Votre message…" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', paddingTop: '.85rem', borderTop: '1px solid #f3f4f6' }}>
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn-blue" disabled={sending || (modeDestinataire === 'collegue' ? !destinataireId : modeDestinataire === 'etudiant' ? !etudiantId : !groupeValeur)}>{sending ? 'Envoi…' : 'Envoyer →'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
