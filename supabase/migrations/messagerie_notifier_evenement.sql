-- Migration : fn_notifier_evenement
-- Chantier D (messagerie) — modèles automatiques / notifications d'événements métier.
-- Résout un modèle actif dans modeles_notification (type + canal='email'),
-- substitue les variables {var} de p_vars, et crée un message interne catégorisé.
-- SECURITY DEFINER ; erreurs avalées (RAISE WARNING) pour ne jamais bloquer
-- l'action métier appelante.
--
-- Contexte : cette fonction avait été exécutée directement en base sans être
-- versionnée. Fichier reconstitué depuis pg_get_functiondef le 30/07/2026.
-- MAJ 30/07/2026 : résolution du modèle en fallback global — l'école-spécifique
-- prime, sinon on prend le modèle global (ecole_id IS NULL). Évite le no-op
-- silencieux pour toute école non provisionnée.
-- MAJ 31/07/2026 : injection automatique de {etudiant} (nom+prenom) dans les
-- variables de substitution — corrige un {etudiant} laissé littéral dans les
-- messages déjà envoyés (absence notamment), les appelants n'ayant jamais
-- besoin de la passer manuellement.
-- MAJ 01/08/2026 : alimente aussi la table `notifications` (centre "Alertes"
-- du portail famille, jamais utilisée jusqu'ici) en plus de `messages`.
-- Insert isolé dans son propre bloc BEGIN/EXCEPTION pour ne jamais faire
-- échouer le message interne si ce second insert pose problème.
-- MAJ 01/08/2026 (fix) : notifications.type est contraint (CHECK) aux 4
-- valeurs de sévérité info/success/warning/error, pas aux catégories métier
-- — p_type mappé en conséquence (absence→warning, sinon→info), la vraie
-- catégorie étant détectée côté portail via mots-clés dans titre/corps.

CREATE OR REPLACE FUNCTION public.fn_notifier_evenement(
  p_ecole_id    uuid,
  p_etudiant_id uuid,
  p_type        text,
  p_vars        jsonb DEFAULT '{}'::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_expediteur  utilisateurs%ROWTYPE;
  v_etudiant    etudiants%ROWTYPE;
  v_modele      record;
  v_sujet       text;
  v_corps       text;
  v_categorie   text;
  v_message_id  uuid;
  v_key         text;
  v_val         text;
  v_type_notif  text;
BEGIN
  SELECT * INTO v_expediteur FROM utilisateurs WHERE auth_id = auth.uid() AND actif = true;
  IF v_expediteur.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_type NOT IN ('note', 'absence', 'paiement', 'releve') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_etudiant FROM etudiants WHERE id = p_etudiant_id AND ecole_id = p_ecole_id;
  IF v_etudiant.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Résolution du modèle : l'école-spécifique prime, le modèle global
  -- (ecole_id IS NULL) sert de fallback quand l'école n'a aucune ligne.
  -- Une école qui désactive SA ligne (actif=false) opte-out volontairement :
  -- on ne repasse pas sur le global dans ce cas (sa ligne, inactive, gagne).
  SELECT actif, sujet, corps_texte INTO v_modele
  FROM modeles_notification
  WHERE type = p_type AND canal = 'email'
    AND (ecole_id = p_ecole_id OR ecole_id IS NULL)
  ORDER BY ecole_id NULLS LAST   -- non-null (école) avant NULL (global)
  LIMIT 1;
  IF NOT FOUND OR v_modele.actif IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  v_sujet := coalesce(v_modele.sujet, '');
  v_corps := coalesce(v_modele.corps_texte, '');
  -- {etudiant} est toujours disponible, injectée automatiquement (nom+prenom
  -- de v_etudiant deja charge) ; p_vars peut la surcharger si besoin.
  FOR v_key, v_val IN
    SELECT key, value FROM jsonb_each_text(
      jsonb_build_object('etudiant', v_etudiant.prenom || ' ' || v_etudiant.nom) || p_vars
    )
  LOOP
    v_sujet := replace(v_sujet, '{' || v_key || '}', v_val);
    v_corps := replace(v_corps, '{' || v_key || '}', v_val);
  END LOOP;

  v_categorie := CASE p_type
    WHEN 'note'     THEN 'NOT'
    WHEN 'absence'  THEN 'ABS'
    WHEN 'paiement' THEN 'FIN'
    WHEN 'releve'   THEN 'REL'
  END;

  INSERT INTO messages (ecole_id, expediteur_id, expediteur_nom, expediteur_role,
                        destinataire_nom, destinataire_role,
                        sujet, objet, contenu, categorie, priorite, statut)
  VALUES (p_ecole_id, v_expediteur.id, v_expediteur.nom, v_expediteur.role,
          v_etudiant.nom || ' ' || v_etudiant.prenom || ' (famille)', 'famille',
          v_sujet, v_sujet, v_corps, v_categorie, 'normale', 'envoye')
  RETURNING id INTO v_message_id;

  INSERT INTO message_destinataires (message_id, etudiant_id, destinataire_role)
  VALUES (v_message_id, p_etudiant_id, 'famille');

  INSERT INTO message_audit (message_id, action, user_id)
  VALUES (v_message_id, 'creation', v_expediteur.id);

  -- Chantier E — alimente aussi le centre "Alertes" du portail famille
  -- (table `notifications`, distincte de `messages` : c'est elle que
  -- portail/index.html::chargerNotifsPortail() lit). Isolée dans son propre
  -- bloc : un echec ici ne doit jamais faire echouer le message interne
  -- deja cree ci-dessus.
  -- notifications.type est contraint (CHECK) aux 4 valeurs de severite
  -- info/success/warning/error — PAS aux categories metier. Le portail
  -- detecte la vraie categorie via mots-cles dans titre/corps (deja presents
  -- dans nos sujets : "absences", "note", "paiement").
  v_type_notif := CASE p_type
    WHEN 'absence' THEN 'warning'
    ELSE 'info'
  END;
  BEGIN
    INSERT INTO notifications (ecole_id, etudiant_id, titre, corps, message, type)
    VALUES (p_ecole_id, p_etudiant_id, v_sujet, v_corps, v_corps, v_type_notif);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'fn_notifier_evenement: notifications insert echec (%): %', SQLSTATE, SQLERRM;
  END;

  RETURN v_message_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'fn_notifier_evenement: echec (%): %', SQLSTATE, SQLERRM;
    RETURN NULL;
END;
$function$;
