// src/modules/notifications-config/components/JournalEnvois.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import ResponsiveTable, { RTColumn } from '../../../components/ResponsiveTable';
import { fetchJournal } from '../notifications-config.service';
import type { EntreeJournal, CanalNotif, StatutEnvoi } from '../notifications-config.service';
import { TYPES_NOTIF, CANAUX_NOTIF, STATUTS_ENVOI } from '../notifications-config.service';

interface Props {
  ecoleId: string;
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
  fontSize: 13, fontFamily: 'inherit',
};

export function JournalEnvois({ ecoleId }: Props) {
  const [entrees, setEntrees] = useState<EntreeJournal[]>([]);
  const [loading, setLoading] = useState(false);

  const [canal, setCanal] = useState<CanalNotif | ''>('');
  const [statut, setStatut] = useState<StatutEnvoi | ''>('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [recherche, setRecherche] = useState('');
  const [rechercheDiff, setRechercheDiff] = useState(''); // valeur tapée, débattue avant déclenchement

  // Débounce léger sur la recherche texte (évite une requête par frappe)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setRecherche(rechercheDiff), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rechercheDiff]);

  const load = useCallback(async () => {
    if (!ecoleId) return;
    setLoading(true);
    try {
      setEntrees(await fetchJournal(ecoleId, {
        canal: canal || undefined,
        statut: statut || undefined,
        dateDebut: dateDebut || undefined,
        dateFin: dateFin || undefined,
        recherche: recherche || undefined,
      }));
    } finally {
      setLoading(false);
    }
  }, [ecoleId, canal, statut, dateDebut, dateFin, recherche]);

  useEffect(() => { load(); }, [load]);

  function reinitialiserFiltres() {
    setCanal(''); setStatut(''); setDateDebut(''); setDateFin('');
    setRechercheDiff(''); setRecherche('');
  }

  const filtresActifs = !!(canal || statut || dateDebut || dateFin || recherche);

  const columns: RTColumn<EntreeJournal>[] = [
    {
      key: 'envoye_le',
      label: 'Date',
      width: '150px',
      render: (row) => {
        const d = new Date(row.envoye_le);
        return (
          <span style={{ fontSize: 12.5 }}>
            {d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            {' '}
            <span style={{ color: '#9ca3af' }}>
              {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        );
      },
    },
    {
      key: 'type',
      label: 'Type',
      render: (row) => {
        const t = TYPES_NOTIF.find(t => t.id === row.type);
        return <span>{t ? `${t.icon} ${t.label}` : row.type}</span>;
      },
    },
    {
      key: 'canal',
      label: 'Canal',
      width: '110px',
      render: (row) => {
        const c = CANAUX_NOTIF.find(c => c.id === row.canal);
        return <span>{c ? `${c.icon} ${c.label}` : row.canal}</span>;
      },
    },
    {
      key: 'destinataire',
      label: 'Destinataire',
      primary: true,
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.destinataire_nom ?? '—'}</div>
          {row.destinataire_contact && (
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{row.destinataire_contact}</div>
          )}
        </div>
      ),
    },
    {
      key: 'sujet',
      label: 'Sujet',
      render: (row) => <span style={{ fontSize: 12.5 }}>{row.sujet ?? '—'}</span>,
    },
    {
      key: 'statut',
      label: 'Statut',
      width: '110px',
      render: (row) => {
        const s = STATUTS_ENVOI.find(s => s.id === row.statut);
        return <span className={`badge ${s?.badge ?? 'gray'}`}>{s?.label ?? row.statut}</span>;
      },
    },
    {
      key: 'erreur',
      label: 'Erreur',
      hideOnMobile: true,
      render: (row) => (
        row.erreur
          ? <span style={{ fontSize: 11.5, color: '#991b1b' }}>{row.erreur}</span>
          : <span style={{ color: '#d1d5db' }}>—</span>
      ),
    },
  ];

  return (
    <div>
      {/* ── Barre de filtres ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Rechercher (nom, sujet)…"
          value={rechercheDiff}
          onChange={e => setRechercheDiff(e.target.value)}
          style={{ ...inputStyle, minWidth: 200 }}
        />
        <select value={canal} onChange={e => setCanal(e.target.value as CanalNotif | '')} style={inputStyle}>
          <option value="">Tous les canaux</option>
          {CANAUX_NOTIF.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
        <select value={statut} onChange={e => setStatut(e.target.value as StatutEnvoi | '')} style={inputStyle}>
          <option value="">Tous les statuts</option>
          {STATUTS_ENVOI.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
          Du
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
          Au
          <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} style={inputStyle} />
        </label>
        {filtresActifs && (
          <button
            onClick={reinitialiserFiltres}
            style={{ ...inputStyle, background: '#f9fafb', cursor: 'pointer' }}
          >
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* ── Résultats ── */}
      {loading ? (
        <div className="loading">Chargement…</div>
      ) : entrees.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          {filtresActifs
            ? 'Aucun envoi ne correspond à ces filtres.'
            : "Aucun envoi enregistré pour l'instant."}
        </div>
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            data={entrees}
            keyExtractor={(row) => row.id}
          />
          {entrees.length === 200 && (
            <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
              Affichage limité aux 200 envois les plus récents — affinez les filtres pour voir plus précisément.
            </div>
          )}
        </>
      )}
    </div>
  );
}
