-- =============================================================================
-- EduLink Sup — Sprint B15, action 3 : préférences de notification par destinataire
-- Table + RPC pour le portail famille. Modèle opt-out : tout est actif par
-- défaut (true), une famille désactive ce qu'elle ne veut plus recevoir.
-- La messagerie interne (table `messages`) et le centre "Alertes" du portail
-- (table `notifications`) ne sont JAMAIS filtrés par ces préférences — elles
-- ne s'appliquent qu'aux canaux externes (email, SMS, push).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.preferences_notification_famille (
  etudiant_id uuid PRIMARY KEY REFERENCES etudiants(id) ON DELETE CASCADE,
  ecole_id    uuid NOT NULL,
  email_actif boolean NOT NULL DEFAULT true,
  sms_actif   boolean NOT NULL DEFAULT true,
  push_actif  boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.preferences_notification_famille IS
  'Préférences de canal (email/SMS/push) par étudiant, pour les notifications '
  'automatiques (absence/note/paiement). Absence de ligne = tout actif par défaut.';

ALTER TABLE public.preferences_notification_famille ENABLE ROW LEVEL SECURITY;
-- Aucune policy directe : accès exclusivement via les RPC SECURITY DEFINER
-- ci-dessous (portail famille) et via service_role (Edge Functions).


-- ── Lecture : la famille consulte ses propres préférences ───────────────────
CREATE OR REPLACE FUNCTION public.fn_get_preferences_notification_famille()
RETURNS TABLE (email_actif boolean, sms_actif boolean, push_actif boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(p.email_actif, true),
    COALESCE(p.sms_actif, true),
    COALESCE(p.push_actif, true)
  FROM etudiants e
  LEFT JOIN preferences_notification_famille p ON p.etudiant_id = e.id
  WHERE e.auth_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_preferences_notification_famille() TO authenticated;


-- ── Écriture : la famille bascule un canal ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_definir_preference_notification_famille(
  p_canal text,
  p_actif boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_etudiant_id uuid;
  v_ecole_id    uuid;
BEGIN
  IF p_canal NOT IN ('email', 'sms', 'push') THEN
    RAISE EXCEPTION 'Canal invalide : %', p_canal;
  END IF;

  SELECT id, ecole_id INTO v_etudiant_id, v_ecole_id
  FROM etudiants WHERE auth_id = auth.uid();

  IF v_etudiant_id IS NULL THEN
    RAISE EXCEPTION 'Aucun étudiant lié à ce compte';
  END IF;

  INSERT INTO preferences_notification_famille (etudiant_id, ecole_id)
  VALUES (v_etudiant_id, v_ecole_id)
  ON CONFLICT (etudiant_id) DO NOTHING;

  -- p_canal whitelisté ci-dessus avant toute construction dynamique du nom
  -- de colonne : aucune injection possible.
  EXECUTE format(
    'UPDATE preferences_notification_famille SET %I = $1, updated_at = now() WHERE etudiant_id = $2',
    p_canal || '_actif'
  ) USING p_actif, v_etudiant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_definir_preference_notification_famille(text, boolean) TO authenticated;


-- ============================================================================
-- VÉRIFICATION POST-EXÉCUTION :
--   SELECT * FROM preferences_notification_famille LIMIT 5;
--   -- attendu : table vide au départ (toutes les familles sont opt-in par défaut,
--   -- une ligne n'apparaît que lorsqu'une famille bascule un interrupteur)
-- ============================================================================
