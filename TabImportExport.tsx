// ─── Onglet Import / Export ───────────────────────────────────────────────────
function TabImportExport({ ecoleId }: { ecoleId: string | null }) {
  const [exporting, setExporting] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success'|'error'|'info'; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<{ programmes: any[]; ues: any[]; matieres: any[] } | null>(null)
  const [activePreview, setActivePreview] = useState<'programmes'|'ues'|'matieres'>('programmes')
  const fileRef = useRef<HTMLInputElement>(null)

  const EXPORT_TYPES = [
    { id: 'etudiants',    label: 'Etudiants',   ico: '\u{1F393}', desc: 'Exporter tous les etudiants en CSV' },
    { id: 'enseignants',  label: 'Enseignants',  ico: '\u{1F468}\u200D\u{1F3EB}', desc: 'Exporter le corps enseignant' },
    { id: 'notes',        label: 'Notes',        ico: '\u{1F4DD}', desc: 'Exporter les notes par promotion'  },
    { id: 'inscriptions', label: 'Inscriptions', ico: '\u{1F4CB}', desc: 'Exporter les inscriptions'        },
  ]

  async function handleExport(type: string) {
    if (!ecoleId) return
    setExporting(type)
    try {
      let rows: Record<string, unknown>[] = []
      if (type === 'etudiants') {
        const { data } = await supabase.from('etudiants')
          .select('nom,prenom,email,telephone,numero_etudiant,statut').eq('ecole_id', ecoleId)
        rows = data ?? []
      } else if (type === 'enseignants') {
        const { data } = await supabase.from('enseignants')
          .select('nom,prenom,email,telephone,specialite,statut').eq('ecole_id', ecoleId)
        rows = data ?? []
      } else if (type === 'inscriptions') {
        const { data } = await supabase.from('inscriptions')
          .select('etudiants(nom,prenom),promotions(nom),annee_academique,statut').eq('ecole_id', ecoleId)
        rows = data ?? []
      }
      if (rows.length === 0) { setMsg({ type: 'error', text: 'Aucune donnee a exporter' }); return }
      const csv = [
        Object.keys(rows[0]).join(','),
        ...rows.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))
      ].join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `export_${type}_${new Date().toISOString().slice(0,10)}.csv`; a.click()
      URL.revokeObjectURL(url)
      setMsg({ type: 'success', text: `Export ${type} genere avec succes` })
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message })
    } finally {
      setExporting(null)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new()

    const progData = [
      ['code','intitule','grade','duree_annees','credits_total','actif'],
      ['GFC','Gestion Financiere et Comptable','L',3,180,'oui'],
      ['ACG','Audit et Controle de Gestion','M',2,120,'oui'],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(progData), 'Programmes')

    const ueData = [
      ['code_ue','intitule','type','credits_ects','poids_cc','poids_exam','programme_code','semestre_num'],
      ['GFC-S1-UE1','Comptabilite Generale','obligatoire',6,40,60,'GFC',1],
      ['GFC-S1-UE2','Mathematiques Financieres','obligatoire',4,30,70,'GFC',1],
      ['ACG-S1-UE1','Audit Interne','obligatoire',6,40,60,'ACG',1],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ueData), 'UE')

    const matData = [
      ['code_matiere','intitule','volume_cm','volume_td','volume_tp','code_ue'],
      ['GFC-S1-UE1-M1','Comptabilite Generale 1',30,15,0,'GFC-S1-UE1'],
      ['GFC-S1-UE1-M2','Comptabilite Generale 2',20,10,0,'GFC-S1-UE1'],
      ['ACG-S1-UE1-M1','Audit Interne Fondements',24,12,0,'ACG-S1-UE1'],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matData), 'Matieres')

    XLSX.writeFile(wb, 'template_maquette_pedagogique.xlsx')
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' })
        const readSheet = (name: string) => {
          const ws = wb.Sheets[name]
          if (!ws) return []
          return XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
        }
        const programmes = readSheet('Programmes')
        const ues        = readSheet('UE')
        const matieres   = readSheet('Matieres')
        setPreview({ programmes, ues, matieres })
        setMsg({ type: 'info', text: `Fichier lu : ${programmes.length} programmes, ${ues.length} UE, ${matieres.length} matieres` })
      } catch {
        setMsg({ type: 'error', text: 'Impossible de lire le fichier. Verifiez le format.' })
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function handleImport() {
    if (!preview || !ecoleId) return
    setImporting(true)
    setMsg(null)
    try {
      let progOk = 0, ueOk = 0, matOk = 0

      // 1. Programmes
      for (const p of preview.programmes) {
        if (!p.intitule || !p.grade) continue
        const { error } = await supabase.from('programmes_lmd').upsert({
          ecole_id:      ecoleId,
          intitule:      String(p.intitule),
          grade:         String(p.grade).toUpperCase(),
          duree_annees:  Number(p.duree_annees) || (p.grade === 'L' ? 3 : p.grade === 'M' ? 2 : 3),
          credits_total: Number(p.credits_total) || 180,
          actif:         String(p.actif).toLowerCase() !== 'non',
          code:          p.code ? String(p.code) : undefined,
        }, { onConflict: 'ecole_id,intitule', ignoreDuplicates: true })
        if (!error) progOk++
      }

      // 2. UE — recuperer les programmes pour faire le lien
      const { data: progs } = await supabase.from('programmes_lmd')
        .select('id,intitule,code').eq('ecole_id', ecoleId)
      const progMap: Record<string, string> = {}
      ;(progs ?? []).forEach((p: any) => {
        if (p.code) progMap[p.code] = p.id
        progMap[p.intitule] = p.id
      })

      for (const u of preview.ues) {
        if (!u.intitule) continue
        const progId = progMap[u.programme_code] ?? null
        const { error } = await supabase.from('unites_enseignement').upsert({
          ecole_id:     ecoleId,
          code:         String(u.code_ue || u.code || ''),
          intitule:     String(u.intitule),
          type:         String(u.type || 'obligatoire'),
          credits_ects: Number(u.credits_ects) || 6,
          poids_cc:     Number(u.poids_cc) || 40,
          poids_exam:   Number(u.poids_exam) || 60,
          programme_id: progId,
        }, { onConflict: 'ecole_id,code', ignoreDuplicates: true })
        if (!error) ueOk++
      }

      // 3. Matieres — recuperer les UE pour faire le lien
      const { data: uesDb } = await supabase.from('unites_enseignement')
        .select('id,code').eq('ecole_id', ecoleId)
      const ueMap: Record<string, string> = {}
      ;(uesDb ?? []).forEach((u: any) => { ueMap[u.code] = u.id })

      for (const m of preview.matieres) {
        if (!m.intitule) continue
        const ueId = ueMap[m.code_ue] ?? null
        const { error } = await supabase.from('matieres_lmd').upsert({
          ecole_id:  ecoleId,
          code:      String(m.code_matiere || m.code || ''),
          intitule:  String(m.intitule),
          volume_cm: Number(m.volume_cm) || 0,
          volume_td: Number(m.volume_td) || 0,
          volume_tp: Number(m.volume_tp) || 0,
          ue_id:     ueId,
        }, { onConflict: 'ecole_id,code', ignoreDuplicates: true })
        if (!error) matOk++
      }

      setMsg({ type: 'success', text: `Import termine : ${progOk} programmes, ${ueOk} UE, ${matOk} matieres inseres` })
      setPreview(null)
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message })
    } finally {
      setImporting(false)
    }
  }

  const previewTabs: { id: 'programmes'|'ues'|'matieres'; label: string; count: number }[] = preview ? [
    { id: 'programmes', label: 'Programmes', count: preview.programmes.length },
    { id: 'ues',        label: 'UE',         count: preview.ues.length },
    { id: 'matieres',   label: 'Matieres',   count: preview.matieres.length },
  ] : []

  return (
    <div>
      {msg && <div style={msg.type === 'success' ? S.success : msg.type === 'error' ? S.error : S.info}>
        {msg.type === 'success' ? '\u2705' : msg.type === 'error' ? '\u26A0\uFE0F' : '\u2139\uFE0F'} {msg.text}
      </div>}

      <div style={S.section}>
        <div style={S.sectionTitle}>Exporter des donnees</div>
        <div style={S.grid2}>
          {EXPORT_TYPES.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid #f1f5f9', borderRadius: 10, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{t.ico}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{t.desc}</div>
                </div>
              </div>
              <button onClick={() => handleExport(t.id)} disabled={exporting === t.id} style={S.btnSecondary}>
                {exporting === t.id ? '\u23F3' : '\u2B07\uFE0F'} CSV
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Importer la maquette pedagogique</div>
        <div style={S.info}>
          {'\u2139\uFE0F'} Importez Programmes, UE et Matieres en une seule operation depuis un fichier Excel.
          Les doublons sont ignores automatiquement.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={downloadTemplate} style={S.btnSecondary}>{'\u2B07\uFE0F'} Telecharger le template Excel</button>
        </div>
        <div style={S.uploadZone} onClick={() => fileRef.current?.click()}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>{'\u{1F4E4}'}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Glisser-deposer ou cliquer pour selectionner</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>XLSX uniquement · max 10 Mo</div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFile} style={{ display: 'none' }} />

        {preview && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {previewTabs.map(t => (
                <button key={t.id} onClick={() => setActivePreview(t.id)}
                  style={{ ...S.btnSmall, background: activePreview === t.id ? '#1e3a5f' : '#f1f5f9', color: activePreview === t.id ? '#fff' : '#374151', fontWeight: activePreview === t.id ? 600 : 400 }}>
                  {t.label} ({t.count})
                </button>
              ))}
            </div>
            <div style={{ ...S.tableWrap, maxHeight: 220, overflowY: 'auto' }}>
              <table style={S.table}>
                <thead style={S.thead}>
                  <tr>
                    {preview[activePreview][0] && Object.keys(preview[activePreview][0]).map(k => (
                      <th key={k} style={S.th}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview[activePreview].slice(0, 20).map((row: any, i: number) => (
                    <tr key={i}>
                      {Object.values(row).map((v: any, j: number) => (
                        <td key={j} style={S.td}>{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ ...S.footer, justifyContent: 'flex-start', gap: 8 }}>
              <button onClick={handleImport} disabled={importing} style={S.btnPrimary}>
                {importing ? '\u23F3 Import en cours...' : '\u2705 Importer dans EduLink'}
              </button>
              <button onClick={() => setPreview(null)} style={S.btnSecondary}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
