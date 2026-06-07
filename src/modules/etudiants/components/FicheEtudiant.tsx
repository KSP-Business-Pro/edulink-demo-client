// src/modules/etudiants/components/FicheEtudiant.tsx
// Fiche complète d'un étudiant — infos personnelles + historique inscriptions

import { useEffect, useState } from 'react';
import { fetchEtudiant, fetchInscriptions, type Etudiant, type InscriptionSemestre } from '../etudiants.service';

interface Props {
  etudiantId: string;
  onClose:    () => void;
}

export function FicheEtudiant({ etudiantId, onClose }: Props) {
  const [etudiant,     setEtudiant]     = useState<Etudiant | null>(null);
  const [inscriptions, setInscriptions] = useState<InscriptionSemestre[]>([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    Promise.all([
      fetchEtudiant(etudiantId),
      fetchInscriptions(etudiantId),
    ]).then(([e, ins]) => {
      setEtudiant(e);
      setInscriptions(ins);
      setLoading(false);
    });
  }, [etudiantId]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!etudiant) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
      Étudiant introuvable.
      <br />
      <button onClick={onClose} style={{ marginTop: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff' }}>
        ← Retour
      </button>
    </div>
  );

  const e = etudiant;
  const avatarBg    = e.sexe === 'F' ? '#fce7f3' : '#dbeafe';
  const avatarColor = e.sexe === 'F' ? '#be185d' : '#1d4ed8';

  return (
    <div style={S.page}>
      {/* Bouton retour */}
      <button onClick={onClose} style={S.back}>← Retour à la liste</button>

      {/* Header fiche */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: avatarColor, flexShrink: 0 }}>
            {(e.nom?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{e.nom} {e.prenom}</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <code style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{e.matricule ?? '—'}</code>
              {e.niveau && <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{e.niveau}</span>}
              <span style={{ background: e.statut === 'actif' ? '#d1fae5' : '#f3f4f6', color: e.statut === 'actif' ? '#065f46' : '#374151', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}>{e.statut}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>

        {/* Informations personnelles */}
        <div style={S.card}>
          <div style={S.cardTitle}>📋 Informations personnelles</div>
          <div style={S.grid}>
            {[
              ['Email',        e.email_auth      ?? '—'],
              ['Téléphone',    e.telephone       ?? '—'],
              ['Filière',      e.filiere         ?? '—'],
              ['Date naissance', e.date_naissance ?? '—'],
              ['Lieu naissance', e.lieu_naissance ?? '—'],
              ['Nationalité',  e.nationalite     ?? '—'],
              ['Adresse',      e.adresse         ?? '—'],
            ].map(([label, val]) => (
              <div key={label as string}>
                <div style={S.label}>{label}</div>
                <div style={S.value}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Historique inscriptions */}
        <div style={S.card}>
          <div style={S.cardTitle}>📅 Inscriptions semestrielles</div>
          {inscriptions.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13, padding: '1rem 0' }}>Aucune inscription</div>
          ) : (
            inscriptions.map(ins => (
              <div key={ins.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                  {ins.semestres?.libelle ?? '—'}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {ins.semestres?.programmes_lmd?.intitule ?? '—'} · {ins.semestres?.niveau ?? ''}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: ins.statut === 'active' ? '#d1fae5' : '#f3f4f6', color: ins.statut === 'active' ? '#065f46' : '#374151' }}>
                  {ins.statut}
                </span>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}

const S = {
  page:      { padding: '1.5rem 2rem', maxWidth: 1100, margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" } as React.CSSProperties,
  back:      { marginBottom: '1rem', padding: '6px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151', fontFamily: 'inherit' } as React.CSSProperties,
  card:      { background: '#fff', borderRadius: 12, padding: '1.25rem', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem' } as React.CSSProperties,
  grid:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  label:     { fontSize: 11, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  value:     { fontSize: 13, color: '#1e293b', marginTop: 2 } as React.CSSProperties,
};
