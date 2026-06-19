-- ═══════════════════════════════════════════════════════════════════════════
-- B3.1 — Inscriptions semestrielles
-- Exécuter BLOC PAR BLOC dans le SQL Editor Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- ── BLOC 1 : Contrainte unicité (évite doublons d'inscription) ─────────────
ALTER TABLE inscriptions_semestre
  ADD CONSTRAINT IF NOT EXISTS uq_inscription_etudiant_semestre
  UNIQUE (etudiant_id, semestre_id);

-- ── BLOC 2 : Fonction inscription individuelle ─────────────────────────────
-- Inscrit un étudiant à un semestre + génère une facture si demandé
CREATE OR REPLACE FUNCTION fn_inscrire_etudiant_semestre(
  p_etudiant_id         UUID,
  p_semestre_id         UUID,
  p_promotion_id        UUID,
  p_annee_academique_id UUID,
  p_ecole_id            UUID,
  p_montant_scolarite   NUMERIC DEFAULT 0,
  p_generer_facture     BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inscription_id UUID;
  v_facture_id     UUID;
  v_reference      TEXT;
  v_etudiant_nom   TEXT;
  v_semestre_lib   TEXT;
  v_already        BOOLEAN;
BEGIN
  -- Vérifier doublon
  SELECT EXISTS(
    SELECT 1 FROM inscriptions_semestre
    WHERE etudiant_id = p_etudiant_id
      AND semestre_id = p_semestre_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Étudiant déjà inscrit à ce semestre',
      'code', 'DOUBLON'
    );
  END IF;

  -- Créer l'inscription
  INSERT INTO inscriptions_semestre (
    etudiant_id, semestre_id, promotion_id,
    annee_academique_id, ecole_id,
    statut, date_inscription
  )
  VALUES (
    p_etudiant_id, p_semestre_id, p_promotion_id,
    p_annee_academique_id, p_ecole_id,
    'active', CURRENT_DATE
  )
  RETURNING id INTO v_inscription_id;

  -- Générer facture si demandé et montant > 0
  IF p_generer_facture AND p_montant_scolarite > 0 THEN
    SELECT nom || ' ' || COALESCE(prenom, '') INTO v_etudiant_nom
    FROM etudiants WHERE id = p_etudiant_id;

    SELECT libelle INTO v_semestre_lib
    FROM semestres WHERE id = p_semestre_id;

    -- Référence unique : FAC-YYYYMMDD-matricule
    SELECT 'FAC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
           COALESCE(LPAD(sequence_matricule::TEXT, 4, '0'), 'XXXX')
    INTO v_reference
    FROM etudiants WHERE id = p_etudiant_id;

    INSERT INTO factures (
      ecole_id, etudiant_id,
      reference, libelle,
      montant_total, montant, montant_paye,
      statut, type_frais,
      annee_scolaire, date_echeance
    )
    VALUES (
      p_ecole_id, p_etudiant_id,
      v_reference,
      'Frais de scolarité — ' || COALESCE(v_semestre_lib, 'Semestre'),
      p_montant_scolarite, p_montant_scolarite, 0,
      'impayee', 'scolarite',
      TO_CHAR(NOW(), 'YYYY') || '-' || TO_CHAR(NOW() + INTERVAL '1 year', 'YYYY'),
      CURRENT_DATE + INTERVAL '30 days'
    )
    RETURNING id INTO v_facture_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'inscription_id', v_inscription_id,
    'facture_id',     v_facture_id
  );
END;
$$;

-- ── BLOC 3 : Fonction inscription batch (promotion entière) ────────────────
CREATE OR REPLACE FUNCTION fn_inscrire_promotion(
  p_promotion_id        UUID,
  p_semestre_id         UUID,
  p_annee_academique_id UUID,
  p_ecole_id            UUID,
  p_montant_scolarite   NUMERIC DEFAULT 0,
  p_generer_factures    BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_etudiant        RECORD;
  v_result          JSONB;
  v_inscrits        INTEGER := 0;
  v_doublons        INTEGER := 0;
  v_erreurs         INTEGER := 0;
  v_factures        INTEGER := 0;
  v_semestre_lib    TEXT;
BEGIN
  SELECT libelle INTO v_semestre_lib
  FROM semestres WHERE id = p_semestre_id;

  -- Parcourir tous les étudiants actifs de la promotion
  FOR v_etudiant IN
    SELECT e.id, e.nom, e.prenom, e.matricule
    FROM etudiants e
    WHERE e.ecole_id = p_ecole_id
      -- Filtre par promotion via inscriptions existantes ou niveau
      AND (
        EXISTS (
          SELECT 1 FROM inscriptions_semestre ins
          WHERE ins.etudiant_id = e.id
            AND ins.promotion_id = p_promotion_id
        )
        OR e.niveau = (SELECT niveau FROM promotions WHERE id = p_promotion_id)
      )
      AND e.statut = 'actif'
  LOOP
    -- Vérifier doublon
    IF EXISTS (
      SELECT 1 FROM inscriptions_semestre
      WHERE etudiant_id = v_etudiant.id
        AND semestre_id = p_semestre_id
    ) THEN
      v_doublons := v_doublons + 1;
      CONTINUE;
    END IF;

    BEGIN
      -- Inscrire
      INSERT INTO inscriptions_semestre (
        etudiant_id, semestre_id, promotion_id,
        annee_academique_id, ecole_id,
        statut, date_inscription
      )
      VALUES (
        v_etudiant.id, p_semestre_id, p_promotion_id,
        p_annee_academique_id, p_ecole_id,
        'active', CURRENT_DATE
      );
      v_inscrits := v_inscrits + 1;

      -- Facture individuelle si demandée
      IF p_generer_factures AND p_montant_scolarite > 0 THEN
        INSERT INTO factures (
          ecole_id, etudiant_id,
          reference, libelle,
          montant_total, montant, montant_paye,
          statut, type_frais,
          annee_scolaire, date_echeance
        )
        VALUES (
          p_ecole_id, v_etudiant.id,
          'FAC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
            COALESCE(LPAD(
              (SELECT sequence_matricule::TEXT FROM etudiants WHERE id = v_etudiant.id),
              4, '0'
            ), 'XXXX'),
          'Frais de scolarité — ' || COALESCE(v_semestre_lib, 'Semestre'),
          p_montant_scolarite, p_montant_scolarite, 0,
          'impayee', 'scolarite',
          TO_CHAR(NOW(), 'YYYY') || '-' || TO_CHAR(NOW() + INTERVAL '1 year', 'YYYY'),
          CURRENT_DATE + INTERVAL '30 days'
        );
        v_factures := v_factures + 1;
      END IF;

    EXCEPTION WHEN unique_violation THEN
      v_doublons := v_doublons + 1;
    WHEN OTHERS THEN
      v_erreurs := v_erreurs + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',       true,
    'inscrits', v_inscrits,
    'doublons', v_doublons,
    'erreurs',  v_erreurs,
    'factures', v_factures
  );
END;
$$;

-- ── BLOC 4 : RPC liste inscriptions avec jointures ─────────────────────────
CREATE OR REPLACE FUNCTION fn_get_inscriptions_semestre(
  p_ecole_id   UUID,
  p_semestre_id UUID DEFAULT NULL,
  p_statut     TEXT DEFAULT NULL
)
RETURNS TABLE (
  inscription_id        UUID,
  etudiant_id           UUID,
  etudiant_nom          TEXT,
  etudiant_prenom       TEXT,
  etudiant_matricule    TEXT,
  etudiant_niveau       TEXT,
  semestre_id           UUID,
  semestre_libelle      TEXT,
  promotion_id          UUID,
  promotion_nom         TEXT,
  annee_academique_id   UUID,
  annee_libelle         TEXT,
  statut                TEXT,
  date_inscription      DATE,
  created_at            TIMESTAMPTZ,
  facture_statut        TEXT,
  facture_montant_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ins.id                  AS inscription_id,
    e.id                    AS etudiant_id,
    e.nom                   AS etudiant_nom,
    e.prenom                AS etudiant_prenom,
    e.matricule             AS etudiant_matricule,
    e.niveau                AS etudiant_niveau,
    s.id                    AS semestre_id,
    s.libelle               AS semestre_libelle,
    p.id                    AS promotion_id,
    p.nom                   AS promotion_nom,
    aa.id                   AS annee_academique_id,
    aa.libelle              AS annee_libelle,
    ins.statut::TEXT        AS statut,
    ins.date_inscription,
    ins.created_at,
    f.statut                AS facture_statut,
    f.montant_total         AS facture_montant_total
  FROM inscriptions_semestre ins
  JOIN etudiants e   ON e.id  = ins.etudiant_id
  JOIN semestres s   ON s.id  = ins.semestre_id
  LEFT JOIN promotions p       ON p.id  = ins.promotion_id
  LEFT JOIN annees_academiques aa ON aa.id = ins.annee_academique_id
  LEFT JOIN LATERAL (
    SELECT statut, montant_total
    FROM factures
    WHERE etudiant_id = ins.etudiant_id
      AND ecole_id    = ins.ecole_id
      AND type_frais  = 'scolarite'
    ORDER BY created_at DESC
    LIMIT 1
  ) f ON true
  WHERE ins.ecole_id = p_ecole_id
    AND (p_semestre_id IS NULL OR ins.semestre_id = p_semestre_id)
    AND (p_statut IS NULL OR ins.statut::TEXT = p_statut)
  ORDER BY e.nom, e.prenom;
END;
$$;

-- ── BLOC 5 : Test rapide ───────────────────────────────────────────────────
SELECT fn_get_inscriptions_semestre(
  '8916ae3b-eaba-4f64-b785-9f2b00ab1334'::UUID,
  NULL, NULL
) LIMIT 1;
