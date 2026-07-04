// src/modules/audit/index.tsx
// B12.2 — Journal d'audit : consultation des actions sensibles
// Combine audit_log (auto, triggers) et audit_logs (manuel, fn_audit_log)
// via la vue audit_journal_unifie. Réservé à admin/direction (RLS + sidebar).

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

interface LigneAudit {
  source: 'auto' | 'manuel';
  id: string;
  ecole_id: string | null;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  cible: string | null;
  ressource_id: string | null;
  detail: string | null;
  created_at: string;
}

const PAGE_SIZE = 30;

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  INSERT:            { bg: '#d1fae5', color: '#065f46' },
  CREATE:            { bg: '#d1fae5', color: '#065f46' },
  UPDATE:            { bg: '#dbeafe', color: '#1d4ed8' },
  DELETE:            { bg: '#fee2e2', color: '#991b1b' },
  OTP_ENVOYE:        { bg: '#f3f4f6', color: '#374151' },
  OTP_VERIFIE:       { bg: '#d1fae5', color: '#065f46' },
  OTP_ECHEC:         { bg: '#fee2e2', color: '#991b1b' },
  OTP_ENVOI_ECHEC:   { bg: '#fee2e2', color: '#991b1b' },
};

function actionStyle(action: string) {
  return ACTION_COLORS[action] ?? { bg: '#f3f4f6', color: '#374151' };
}

export default function AuditPage() {
  const { isSuperAdmin } = useAuth();
  const [lignes, setLignes] = useState<LigneAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const [filterSource, setFilterSource] = useState<'' | 'auto' | 'manuel'>('');
  const [filterAction, setFilterAction] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (p = page) => {
    setLoading(true); setError(null);
    try {
      let q = supabase
        .from('audit_journal_unifie')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);

      if (filterSource) q = q.eq('source', filterSource);
      if (filterAction) q = q.eq('action', filterAction);
      if (search.trim()) q = q.ilike('user_email', `%${search.trim()}%`);
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59`);

      const { data, error: err, count } = await q;
      if (err) throw err;
      setLignes((data ?? []) as LigneAudit[]);
      setTotal(count ?? 0);
      setPage(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterSource, filterAction, search, dateFrom, dateTo]);

  useEffect(() => { load(0); }, [filterSource, filterAction, dateFrom, dateTo]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(0);
  }

  function reset() {
    setFilterSource(''); setFilterAction(''); setSearch(''); setDateFrom(''); setDateTo('');
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ padding: '1.5rem' }}>
      <div className="top">
        <div>
          <h2>🛡️ Journal d'audit</h2>
          <div className="page-subtitle">
            Traçabilité des actions sensibles {isSuperAdmin ? '— toutes écoles' : "— votre établissement"}
          </div>
        </div>
      </div>

      {/* Filtres */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label htmlFor="audit-search" style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Email utilisateur</label>
          <input
            id="audit-search" name="search" type="text"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ex: ariel@edulink.bj"
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 220 }}
          />
        </div>
        <div>
          <label htmlFor="audit-source" style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Origine</label>
          <select id="audit-source" name="source" value={filterSource} onChange={e => setFilterSource(e.target.value as any)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="">Toutes</option>
            <option value="auto">Automatique (notes, paiements…)</option>
            <option value="manuel">Manuelle (utilisateurs, 2FA…)</option>
          </select>
        </div>
        <div>
          <label htmlFor="audit-action" style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Action</label>
          <select id="audit-action" name="action" value={filterAction} onChange={e => setFilterAction(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="">Toutes</option>
            <option value="INSERT">Création (auto)</option>
            <option value="UPDATE">Modification (auto)</option>
            <option value="DELETE">Suppression (auto)</option>
            <option value="CREATE">Création (manuel)</option>
            <option value="OTP_ENVOYE">2FA — code envoyé</option>
            <option value="OTP_VERIFIE">2FA — code vérifié</option>
            <option value="OTP_ECHEC">2FA — code incorrect</option>
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Du</label>
          <input id="audit-from" name="dateFrom" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
        </div>
        <div>
          <label htmlFor="audit-to" style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Au</label>
          <input id="audit-to" name="dateTo" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
        </div>
        <button type="submit" className="btn-blue">Rechercher</button>
        {(filterSource || filterAction || search || dateFrom || dateTo) && (
          <button type="button" className="btn-ghost" onClick={reset}>✕ Réinitialiser</button>
        )}
      </form>

      {error && (
        <div role="alert" style={{ background: '#fef2f2', color: '#991b1b', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: '1rem', border: '1px solid #fecaca' }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="loading">Chargement du journal…</div>
      ) : lignes.length === 0 ? (
        <div className="empty-state">
          <div className="es-ico">🛡️</div>
          <h3>Aucune entrée</h3>
          <p>Aucune action ne correspond à ces filtres.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Utilisateur</th>
                  <th scope="col">Action</th>
                  <th scope="col">Cible</th>
                  <th scope="col">Détail</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => {
                  const st = actionStyle(l.action);
                  return (
                    <tr key={`${l.source}-${l.id}`}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#6b7280' }}>
                        {new Date(l.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })}
                      </td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{l.user_email ?? '—'}</div>
                        {l.user_role && <div style={{ fontSize: 11, color: '#94a3b8' }}>{l.user_role}</div>}
                      </td>
                      <td>
                        <span className="badge" style={{ background: st.bg, color: st.color }}>{l.action}</span>
                      </td>
                      <td style={{ fontSize: 12, color: '#374151' }}>{l.cible ?? '—'}</td>
                      <td style={{ fontSize: 12, color: '#6b7280', maxWidth: 400 }}>{l.detail ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: 13, color: '#6b7280' }}>
            <span>{total} entrée{total > 1 ? 's' : ''} — page {page + 1}/{totalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => load(page - 1)} aria-label="Page précédente">← Précédent</button>
              <button className="btn-ghost btn-sm" disabled={page + 1 >= totalPages} onClick={() => load(page + 1)} aria-label="Page suivante">Suivant →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
