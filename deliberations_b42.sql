-- ═══════════════════════════════════════════════════════════════════════════
-- B4.2 — Délibérations avancées
-- Exécuter BLOC PAR BLOC dans le SQL Editor Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- ── BLOC 1 : Colonne decision_jury sur resultats_cache ─────────────────────
ALTER TABLE resultats_cache
  ADD COLUMN IF NOT EXISTS decision_jury TEXT,
  ADD COLUMN IF NOT EXISTS note_jury     TEXT;

-- Vérifier
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'resultats_cache' ORDER BY ordinal_position;

-- ── BLOC 2 : Table deliberations (PV officiel) ─────────────────────────────
CREATE TABLE IF NOT EXISTS deliberations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id          UUID NOT NULL REFERENCES ecoles(id),
  semestre_id       UUID NOT NULL REFERENCES semestres(id),
  date_deliberation DATE NOT NULL DEFAULT CURRENT_DATE,
  president_jury    TEXT,
  membres_jury      TEXT[],
  statut            TEXT NOT NULL DEFAULT 'brouillon'
                    CHECK (statut IN ('brouillon','valide','archive')),
  observations      TEXT,
  valide_le         TIMESTAMPTZ,
  valide_par        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ecole_id, semestre_id)
);

-- ── BLOC 3 : Fonction recalcul résultats semestre ─────────────────────────
CREATE OR REPLACE FUNCTION fn_recalcul_semestre(
  p_semestre_id UUID,
  p_ecole_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_etudiant RECORD;
  v_result   JSONB;
  v_ok       INTEGER := 0;
  v_err      INTEGER := 0;
BEGIN
  FOR v_etudiant IN
    SELECT e.id
    FROM etudiants e
    JOIN inscriptions_semestre ins ON ins.etudiant_id = e.id
    WHERE ins.semestre_id  = p_semestre_id
      AND ins.ecole_id     = p_ecole_id
      AND ins.statut       = 'active'
  LOOP
    BEGIN
      SELECT fn_resultats_semestre(v_etudiant.id, p_semestre_id) INTO v_result;
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', v_ok, 'erreurs', v_err);
END;
$func$;

-- ── BLOC 4 : Fonction stats délibération ──────────────────────────────────
CREATE OR REPLACE FUNCTION fn_stats_deliberation(
  p_semestre_id UUID,
  p_ecole_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total',        COUNT(*),
    'calcules',     COUNT(rc.etudiant_id),
    'admis',        COUNT(*) FILTER (WHERE COALESCE(rc.decision_jury, rc.decision) = 'admis'),
    'ajournes',     COUNT(*) FILTER (WHERE COALESCE(rc.decision_jury, rc.decision) = 'ajourné'),
    'redoublants',  COUNT(*) FILTER (WHERE COALESCE(rc.decision_jury, rc.decision) = 'redoublant'),
    'exclus',       COUNT(*) FILTER (WHERE COALESCE(rc.decision_jury, rc.decision) = 'exclus'),
    'moyenne_promo',ROUND(AVG(rc.moyenne_semestre)::numeric, 2),
    'min_moyenne',  ROUND(MIN(rc.moyenne_semestre)::numeric, 2),
    'max_moyenne',  ROUND(MAX(rc.moyenne_semestre)::numeric, 2),
    'mentions', jsonb_build_object(
      'tres_bien',  COUNT(*) FILTER (WHERE rc.mention = 'tres_bien'),
      'bien',       COUNT(*) FILTER (WHERE rc.mention = 'bien'),
      'assez_bien', COUNT(*) FILTER (WHERE rc.mention = 'assez_bien'),
      'passable',   COUNT(*) FILTER (WHERE rc.mention = 'passable'),
      'insuffisant',COUNT(*) FILTER (WHERE rc.mention = 'insuffisant')
    ),
    'publies', COUNT(rn.etudiant_id)
  )
  INTO v_stats
  FROM inscriptions_semestre ins
  JOIN etudiants e ON e.id = ins.etudiant_id
  LEFT JOIN resultats_cache rc ON rc.etudiant_id = ins.etudiant_id
    AND rc.semestre_id = p_semestre_id
  LEFT JOIN releves_notes rn ON rn.etudiant_id = ins.etudiant_id
    AND rn.semestre_id = p_semestre_id
  WHERE ins.semestre_id = p_semestre_id
    AND ins.ecole_id    = p_ecole_id
    AND ins.statut      = 'active';

  RETURN v_stats;
END;
$func$;

-- ── BLOC 5 : Test ──────────────────────────────────────────────────────────
SELECT fn_stats_deliberation(
  'c0c00001-0000-0000-0000-000000000001'::UUID,
  '8916ae3b-eaba-4f64-b785-9f2b00ab1334'::UUID
);
