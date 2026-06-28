// src/pages/PortailPublicPage.tsx
// B5.6 — Portail Public — page sans authentification

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../services/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EcolePublic {
  id: string
  nom: string
  slug: string
  description: string | null
  site_web: string | null
  adresse: string | null
  telephone: string | null
  email_contact: string | null
  annee_creation: number | null
  config: {
    theme?: { primary?: string; secondary?: string; accent?: string }
    logo_url?: string
    favicon_url?: string
  }
}

interface ProgrammePublic {
  id: string
  nom: string
  niveau: string
  domaine: string | null
  duree_mois: number | null
  frais_scolarite: number | null
  afficher_portail: boolean
}

interface Actualite {
  id: string
  titre: string
  contenu: string
  image_url: string | null
  categorie: string
  date_pub: string
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(primary = '#1e3a5f', secondary = '#2563eb', accent = '#fdba8c') {
  return {
    page:       { fontFamily: "'Segoe UI', sans-serif", minHeight: '100vh', background: '#f8fafc' } as React.CSSProperties,
    // Hero
    hero:       { background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`, padding: '0', position: 'relative' as const, overflow: 'hidden' } as React.CSSProperties,
    heroInner:  { maxWidth: 1100, margin: '0 auto', padding: '4rem 2rem', position: 'relative' as const, zIndex: 1 } as React.CSSProperties,
    heroTitle:  { fontSize: 42, fontWeight: 800, color: '#fff', margin: '0 0 0.5rem', lineHeight: 1.15 } as React.CSSProperties,
    heroSub:    { fontSize: 18, color: 'rgba(255,255,255,.80)', margin: '0 0 2rem', maxWidth: 580 } as React.CSSProperties,
    heroBadge:  { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, marginBottom: 16, border: '1px solid rgba(255,255,255,.2)' } as React.CSSProperties,
    heroBtn:    { display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: primary, padding: '12px 24px', borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', textDecoration: 'none', boxShadow: '0 4px 14px rgba(0,0,0,.15)' } as React.CSSProperties,
    heroShape:  { position: 'absolute' as const, right: -80, top: -80, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,.06)' } as React.CSSProperties,
    heroShape2: { position: 'absolute' as const, right: 60, bottom: -120, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,.04)' } as React.CSSProperties,
    // Nav
    nav:        { background: primary, padding: '0 2rem', position: 'sticky' as const, top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,.15)' } as React.CSSProperties,
    navInner:   { maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 } as React.CSSProperties,
    navLogo:    { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    navLogoText:{ fontSize: 18, fontWeight: 700, color: '#fff' } as React.CSSProperties,
    navLinks:   { display: 'flex', gap: 24 } as React.CSSProperties,
    navLink:    { color: 'rgba(255,255,255,.85)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as React.CSSProperties,
    navCta:     { background: '#fff', color: primary, padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', border: 'none', cursor: 'pointer' } as React.CSSProperties,
    // Sections
    section:    { maxWidth: 1100, margin: '0 auto', padding: '4rem 2rem' } as React.CSSProperties,
    sectionTitle:{ fontSize: 28, fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' } as React.CSSProperties,
    sectionSub: { fontSize: 15, color: '#64748b', marginBottom: '2rem' } as React.CSSProperties,
    divider:    { border: 'none', borderTop: '2px solid #f1f5f9', margin: 0 } as React.CSSProperties,
    // Stats
    statsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', margin: '3rem 0' } as React.CSSProperties,
    statBox:    { background: '#fff', borderRadius: 16, padding: '2rem', textAlign: 'center' as const, boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #f1f5f9' } as React.CSSProperties,
    statNum:    { fontSize: 38, fontWeight: 800, color: primary, lineHeight: 1 } as React.CSSProperties,
    statLabel:  { fontSize: 13, color: '#64748b', marginTop: 6 } as React.CSSProperties,
    // Programmes
    progsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' } as React.CSSProperties,
    progCard:   { background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,.06)', transition: 'transform .15s, box-shadow .15s' } as React.CSSProperties,
    niveauBadge:(n: string): React.CSSProperties => {
      const colors: Record<string, React.CSSProperties> = {
        L: { background: '#dbeafe', color: '#1e40af' },
        M: { background: '#ede9fe', color: '#4c1d95' },
        D: { background: '#fce7f3', color: '#831843' },
      }
      const key = n[0]?.toUpperCase() ?? 'L'
      return { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, ...(colors[key] ?? colors.L) }
    },
    // Actualités
    actusGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' } as React.CSSProperties,
    actuCard:   { background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)' } as React.CSSProperties,
    actuImg:    { width: '100%', height: 160, objectFit: 'cover' as const, background: '#f1f5f9' } as React.CSSProperties,
    actuBody:   { padding: '1.25rem' } as React.CSSProperties,
    actuCat:    { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: secondary, marginBottom: 6 } as React.CSSProperties,
    actuTitle:  { fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 8, lineHeight: 1.4 } as React.CSSProperties,
    actuDate:   { fontSize: 12, color: '#94a3b8' } as React.CSSProperties,
    // Contact
    contactGrid:{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' } as React.CSSProperties,
    contactCard:{ background: '#fff', borderRadius: 14, padding: '2rem', border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,.06)' } as React.CSSProperties,
    contactRow: { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 } as React.CSSProperties,
    contactIco: { width: 36, height: 36, borderRadius: 8, background: `${primary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 } as React.CSSProperties,
    // CTA
    ctaBand:    { background: `linear-gradient(135deg, ${primary}, ${secondary})`, padding: '4rem 2rem', textAlign: 'center' as const } as React.CSSProperties,
    // Footer
    footer:     { background: '#1e293b', color: 'rgba(255,255,255,.6)', padding: '2rem', textAlign: 'center' as const, fontSize: 13 } as React.CSSProperties,
    // Spinner
    centered:   { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' } as React.CSSProperties,
    spinner:    { width: 36, height: 36, border: '4px solid #e2e8f0', borderTopColor: primary, borderRadius: '50%', animation: 'spin 0.7s linear infinite' } as React.CSSProperties,
  }
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Page Portail Public ──────────────────────────────────────────────────────

export default function PortailPublicPage() {
  const { slug } = useParams<{ slug: string }>()
  const [ecole,      setEcole]      = useState<EcolePublic | null>(null)
  const [programmes, setProgrammes] = useState<ProgrammePublic[]>([])
  const [actualites, setActualites] = useState<Actualite[]>([])
  const [stats,      setStats]      = useState({ etudiants: 0, enseignants: 0, programmes: 0, annees: 0 })
  const [loading,    setLoading]    = useState(true)
  const [notFound,   setNotFound]   = useState(false)

  useEffect(() => {
    if (!slug) return
    async function load() {
      // Charger école par slug (accès public)
      const { data: ecoleData, error } = await supabase
        .from('ecoles')
        .select('id, nom, slug, description, site_web, adresse, telephone, email_contact, annee_creation, config')
        .eq('slug', slug)
        .maybeSingle()

      if (error || !ecoleData) { setNotFound(true); setLoading(false); return }
      setEcole(ecoleData as EcolePublic)

      const id = ecoleData.id

      // Charger en parallèle
      const [progsRes, actusRes, etudRes, ensRes] = await Promise.all([
        supabase.from('programmes').select('id, nom, niveau, domaine, duree_mois, frais_scolarite')
          .eq('ecole_id', id).eq('afficher_portail', true).order('niveau'),
        supabase.from('actualites').select('id, titre, contenu, image_url, categorie, date_pub')
          .eq('ecole_id', id).eq('publie', true).order('date_pub', { ascending: false }).limit(6),
        supabase.from('etudiants').select('id', { count: 'exact', head: true }).eq('ecole_id', id).eq('statut', 'actif'),
        supabase.from('enseignants').select('id', { count: 'exact', head: true }).eq('ecole_id', id).eq('statut', 'actif'),
      ])

      setProgrammes((progsRes.data ?? []) as ProgrammePublic[])
      setActualites((actusRes.data ?? []) as Actualite[])
      setStats({
        etudiants:  etudRes.count ?? 0,
        enseignants: ensRes.count ?? 0,
        programmes: progsRes.data?.length ?? 0,
        annees: ecoleData.annee_creation ? new Date().getFullYear() - ecoleData.annee_creation : 0,
      })
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) {
    const S = makeStyles()
    return (
      <div style={S.centered}>
        <div style={S.spinner} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (notFound || !ecole) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏫</div>
        <h1 style={{ fontSize: 24, color: '#1e293b', margin: '0 0 8px' }}>École introuvable</h1>
        <p style={{ color: '#64748b', fontSize: 15 }}>Le portail demandé n'existe pas ou n'est pas activé.</p>
      </div>
    )
  }

  const theme = ecole.config?.theme ?? {}
  const primary   = theme.primary   ?? '#1e3a5f'
  const secondary = theme.secondary ?? '#2563eb'
  const accent    = theme.accent    ?? '#fdba8c'
  const S = makeStyles(primary, secondary, accent)
  const logoUrl = ecole.config?.logo_url ?? ''

  return (
    <div style={S.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } a { color: inherit; }`}</style>

      {/* Navigation */}
      <nav style={S.nav}>
        <div style={S.navInner}>
          <div style={S.navLogo}>
            {logoUrl
              ? <img src={logoUrl} alt="logo" style={{ height: 36, objectFit: 'contain' }} />
              : <span style={{ fontSize: 22 }}>🏫</span>}
            <span style={S.navLogoText}>{ecole.nom}</span>
          </div>
          <div style={S.navLinks}>
            {[
              { label: 'Programmes', href: '#programmes' },
              { label: 'Actualités',  href: '#actualites'  },
              { label: 'Contact',     href: '#contact'     },
            ].map(l => (
              <a key={l.href} href={l.href} style={S.navLink}>{l.label}</a>
            ))}
          </div>
          <a href="#contact" style={S.navCta}>Nous contacter</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={S.hero}>
        <div style={S.heroShape} />
        <div style={S.heroShape2} />
        <div style={S.heroInner}>
          {ecole.annee_creation && (
            <div style={S.heroBadge}>
              🎓 Fondée en {ecole.annee_creation}
            </div>
          )}
          <h1 style={S.heroTitle}>{ecole.nom}</h1>
          <p style={S.heroSub}>
            {ecole.description ?? "Excellence académique au cœur de l'Afrique francophone"}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            <a href="#programmes" style={S.heroBtn}>
              📚 Nos programmes
            </a>
            <a href="#contact" style={{ ...S.heroBtn, background: 'rgba(255,255,255,.15)', color: '#fff', boxShadow: 'none', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.3)' }}>
              📞 Nous contacter
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ ...S.section, padding: '2rem' }}>
          <div style={S.statsGrid}>
            {[
              { n: stats.etudiants,   l: 'Étudiants inscrits', ico: '🎓' },
              { n: stats.enseignants, l: 'Enseignants',        ico: '👨‍🏫' },
              { n: stats.programmes,  l: 'Programmes LMD',     ico: '📚' },
              { n: stats.annees > 0 ? stats.annees : '—', l: "Années d'expérience", ico: '🏆' },
            ].map(({ n, l, ico }) => (
              <div key={l} style={S.statBox}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{ico}</div>
                <div style={S.statNum}>{n}</div>
                <div style={S.statLabel}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Programmes */}
      <section id="programmes">
        <div style={S.section}>
          <h2 style={S.sectionTitle}>Nos Programmes</h2>
          <p style={S.sectionSub}>Formation LMD — Licence, Master, Doctorat</p>
          {programmes.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 14, padding: '2rem 0' }}>Aucun programme publié pour le moment.</div>
          ) : (
            <div style={S.progsGrid}>
              {programmes.map(p => (
                <div key={p.id} style={S.progCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <span style={S.niveauBadge(p.niveau)}>{p.niveau}</span>
                    {p.duree_mois && (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.duree_mois} mois</span>
                    )}
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 6px', lineHeight: 1.3 }}>{p.nom}</h3>
                  {p.domaine && (
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>{p.domaine}</div>
                  )}
                  {p.frais_scolarite && (
                    <div style={{ fontSize: 13, fontWeight: 600, color: primary }}>
                      {p.frais_scolarite.toLocaleString('fr-FR')} FCFA / an
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <hr style={S.divider} />

      {/* Actualités */}
      {actualites.length > 0 && (
        <section id="actualites">
          <div style={S.section}>
            <h2 style={S.sectionTitle}>Actualités</h2>
            <p style={S.sectionSub}>Dernières nouvelles de l'établissement</p>
            <div style={S.actusGrid}>
              {actualites.map(a => (
                <div key={a.id} style={S.actuCard}>
                  {a.image_url ? (
                    <img src={a.image_url} alt={a.titre} style={S.actuImg} />
                  ) : (
                    <div style={{ ...S.actuImg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, background: `${primary}12` }}>
                      {a.categorie === 'evenement' ? '📅' : a.categorie === 'resultat' ? '🏆' : a.categorie === 'inscription' ? '📝' : '📢'}
                    </div>
                  )}
                  <div style={S.actuBody}>
                    <div style={S.actuCat}>{a.categorie}</div>
                    <div style={S.actuTitle}>{a.titre}</div>
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 8,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                      {a.contenu}
                    </div>
                    <div style={S.actuDate}>{fmtDate(a.date_pub)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <hr style={S.divider} />
        </section>
      )}

      {/* Contact */}
      <section id="contact">
        <div style={S.section}>
          <h2 style={S.sectionTitle}>Nous contacter</h2>
          <p style={S.sectionSub}>Nous sommes à votre disposition</p>
          <div style={S.contactGrid}>
            <div style={S.contactCard}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem', marginTop: 0 }}>Informations de contact</h3>
              {[
                { ico: '📍', label: 'Adresse', val: ecole.adresse },
                { ico: '📞', label: 'Téléphone', val: ecole.telephone },
                { ico: '✉️', label: 'Email', val: ecole.email_contact },
                { ico: '🌐', label: 'Site web', val: ecole.site_web },
              ].filter(r => r.val).map(r => (
                <div key={r.label} style={S.contactRow}>
                  <div style={S.contactIco}>{r.ico}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 14, color: '#374151' }}>{r.val}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={S.contactCard}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem', marginTop: 0 }}>Formulaire de contact</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { placeholder: 'Votre nom complet', type: 'text' },
                  { placeholder: 'Votre email', type: 'email' },
                  { placeholder: 'Votre téléphone', type: 'tel' },
                ].map(f => (
                  <input key={f.placeholder} type={f.type} placeholder={f.placeholder}
                    style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fafafa' }} />
                ))}
                <textarea placeholder="Votre message..."
                  style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fafafa', resize: 'vertical' as const, minHeight: 100 }} />
                <button style={{ padding: '12px', background: primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  📧 Envoyer le message
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA inscription */}
      <div style={S.ctaBand}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 0.75rem' }}>
          Rejoignez {ecole.nom}
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,.8)', margin: '0 0 2rem', maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
          Inscriptions ouvertes — Rejoignez notre communauté d'excellence académique
        </p>
        <a href={`mailto:${ecole.email_contact ?? ''}`}
          style={{ display: 'inline-block', background: '#fff', color: primary, padding: '14px 32px', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 14px rgba(0,0,0,.2)' }}>
          📝 Demander des informations
        </a>
      </div>

      {/* Footer */}
      <footer style={S.footer}>
        <p style={{ margin: '0 0 4px' }}>© {new Date().getFullYear()} {ecole.nom} · Tous droits réservés</p>
        <p style={{ margin: 0, fontSize: 11 }}>Propulsé par EduLink Sup</p>
      </footer>
    </div>
  )
}
