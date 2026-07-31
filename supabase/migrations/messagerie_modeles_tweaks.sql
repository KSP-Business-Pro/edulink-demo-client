-- Migration : ajustements de contenu des gabarits globaux (Chantier D)
-- Capture a posteriori des UPDATE exécutés directement en base pour enrichir
-- le contenu des messages — versionnés ici pour l'historique/traçabilité.

-- 1) Gabarit 'note' — déjà exécutée en base le 31/07/2026 (voir edulink-messagerie.md)
update modeles_notification
set corps_texte = 'Une nouvelle note a été enregistrée pour {etudiant} en {matiere} ({evaluation}) : {note}/20.'
where ecole_id is null and type = 'note' and canal = 'email';

-- 2) Gabarit 'paiement' — corps générique enrichi avec montant + numéro de reçu.
-- Variables disponibles au moment de l'appel (notifierPaiement côté client) :
-- {etudiant} (auto-injectée par fn_notifier_evenement), {montant}, {numero_recu},
-- {etablissement} (nom de l'école, résolu via jointure factures->ecoles).
update modeles_notification
set corps_texte = 'Bonjour {etudiant},

Nous confirmons la réception de votre paiement de {montant} FCFA (reçu n° {numero_recu}) auprès de {etablissement}.'
where ecole_id is null and type = 'paiement' and canal = 'email';
