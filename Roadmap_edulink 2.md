# EduLink Sup — Roadmap v2 (Post-Avis Expert)
*Généré le 11/06/2026 · Basé sur avis expert Backoffice + Portail Famille*

---

## État actuel (acquis)

### Backoffice React (`app.edulink.bj`)
✅ Modules opérationnels : Dashboard, Étudiants, Programmes & UE, Semestres, Promotions, Saisie des notes, Présences, Résultats, Délibérations, Relevés, Enseignants, Comptabilité, Paramètres  
✅ Import Excel : Étudiants, Enseignants, Matières  
✅ Navigation React Router (SPA sans rechargement)  
✅ RLS désactivée sur tables critiques (super-admin opérationnel)  
✅ WEBHOOK_SECRET injecté via variable d'environnement Vercel  
✅ Edge Function publish-releve avec audit snapshot  
✅ Calculs LMD côté serveur (fn_resultats_semestre, fn_resultats_annuels)  

### Portail Famille (`portail.edulink.bj`)
✅ Connexion email + OTP SMS  
✅ Notes, relevés, absences, paiements, messages, examens  
✅ PWA mobile-first  
✅ RPC SECURITY DEFINER pour isolation par étudiant  

---

## PHASE 1 — Sécurité critique (0–15 jours)

### B1.1 — Retirer WEBHOOK_SECRET du legacy HTML
**Priorité : P1 CRITIQUE**  
Le `index_legacy.html` contient encore le WEBHOOK_SECRET en clair.  
- Remplacer l'appel direct à `publish-releve` dans le legacy par un proxy Vercel `/api/releve` (déjà en place côté React)
- Supprimer toute occurrence de la valeur UUID dans le HTML

### B1.2 — Audit RLS complet par rôle
**Priorité : P1 CRITIQUE**  
Actuellement RLS désactivée sur ~30 tables = tout utilisateur authentifié peut tout lire.  
- Réactiver RLS sur les tables sensibles avec policies par rôle
- Matrice minimale :
  - `notes_lmd` : enseignant voit uniquement ses matières, étudiant voit uniquement ses notes
  - `factures/paiements` : comptable + direction uniquement
  - `utilisateurs` : chaque user voit son propre profil
  - `resultats_cache` : lecture publique école, écriture serveur uniquement
- Conserver `DISABLE ROW LEVEL SECURITY` uniquement sur tables de référentiel non-sensibles

### B1.3 — Rate limiting OTP portail
**Priorité : P1 CRITIQUE**  
- Ajouter compteur de tentatives dans Edge Function OTP
- Bloquer après 5 tentatives / 15 minutes par numéro
- Message neutre : "Si ce numéro est enregistré, un code sera envoyé"

### B1.4 — Journal d'audit serveur
**Priorité : P1 CRITIQUE**  
Table `audit_log` existe déjà — brancher les événements critiques :
- Modification de note (auteur, ancienne valeur, nouvelle valeur, date)
- Publication de relevé
- Export de données
- Suppression d'étudiant/facture
- Connexion OTP (succès/échec, IP masquée)

---

## PHASE 2 — Fiabilité & UX (15–45 jours)

### B2.1 — Recherche globale backoffice
**Priorité : P2**  
Barre de recherche universelle dans AppLayout :  
- Étudiant par nom/matricule → fiche étudiant
- Facture par référence → comptabilité
- Enseignant par nom → enseignants
- Résultats par matricule → résultats

### B2.2 — Gestion d'erreurs centralisée
**Priorité : P2**  
- Créer `src/services/error.service.ts` avec `handleError(err, context)`
- Toast d'erreur uniforme dans tous les modules React
- Afficher code erreur Supabase lisible pour l'admin

### B2.3 — États loading/erreur/retry sur tous les modules
**Priorité : P2**  
Modules manquants : Semestres, Promotions, Paramètres  
- Skeleton loader sur chargement initial
- Bouton "Réessayer" si erreur réseau
- Message "Dernière sync : HH:MM" sur Dashboard

### B2.4 — Portail : simplification navigation mobile
**Priorité : P2**  
Réduire à 5 entrées barre du bas : Accueil, Notes, Paiements, Messages, Plus  
Déplacer dans "Plus" : Relevés, Examens, Emploi du temps, Alertes, Documents

### B2.5 — Portail : page Profil famille
**Priorité : P2**  
- Enfant(s) lié(s) avec photo, classe, filière
- Préférences de notifications (notes, absences, paiements)
- Bouton déconnexion
- Historique de connexions OTP

### B2.6 — Portail : cache local PWA
**Priorité : P2**  
- Mettre en cache : notes, factures, examens, messages récents, relevés publiés
- Afficher "Dernière sync : date" sur accueil
- File d'attente messages hors-ligne avec statut (en attente / envoyé / échec)

---

## PHASE 3 — Fonctionnalités métier (45–90 jours)

### B3.1 — Module Inscriptions semestrielles
**Priorité : P2**  
Workflow complet d'inscription :  
- Demande d'inscription étudiant → validation secrétariat
- Vérification crédits CAMES (controle_credits_actif)
- Blocage si solde impayé (blocage déjà en place pour relevés → étendre aux inscriptions)
- Vue Kanban : En attente / Validée / Rejetée

### B3.2 — Emploi du temps
**Priorité : P3**  
- Grille hebdomadaire par promotion/semestre
- CRUD séances avec enseignant, salle, matière, horaire
- Export PDF emploi du temps
- Visible côté portail famille

### B3.3 — Tableau de bord analytique avancé
**Priorité : P3**  
- Taux de réussite par programme/niveau/semestre (historique)
- Évolution des paiements (courbe mensuelle)
- Alertes absences : top 10 étudiants à risque
- Comparaison inter-semestres

### B3.4 — Signature numérique des relevés
**Priorité : P3**  
- Hash SHA-256 du snapshot stocké dans `releves_notes`
- QR Code sur relevé PDF pointant vers URL de vérification
- Page publique de vérification d'authenticité

### B3.5 — Versioning des règles LMD
**Priorité : P3**  
- Historiser les changements de `regles_ecole` (seuils, compensation, rattrapage)
- Recalcul ciblé uniquement pour les semestres affectés
- Interface diff : règles avant/après

---

## PHASE 4 — Industrialisation (90–180 jours)

### B4.1 — Tests automatisés Playwright
**Priorité : P3**  
Parcours critiques à couvrir :  
- Login → Dashboard → Saisie note → Sauvegarde
- Import Excel étudiants → Vérification liste
- Calcul résultats → Délibération → Publication relevé
- Portail : connexion OTP → lecture notes → téléchargement relevé

### B4.2 — Tests unitaires calculs LMD
**Priorité : P3**  
- `fn_resultats_semestre` : compensation, note plancher, exclusion
- `fn_resultats_annuels` : progression crédits, redoublement
- `fn_moy_ue_rattrapage` : règle MAX vs REMPLACEMENT

### B4.3 — CI/CD GitHub Actions
**Priorité : P3**  
- Build Vite + TypeScript check sur chaque PR
- Tests Playwright sur staging avant merge main
- Deploy automatique Vercel sur merge main

### B4.4 — Migration legacy → React complète
**Priorité : P4**  
Modules legacy restants à migrer :  
- Années académiques
- Messages (boîte de réception)
- Monitoring système
- Prospects/CRM

### B4.5 — Architecture multi-tenant renforcée
**Priorité : P4**  
Pour passage de HEMEC (pilote) à ESM (~3000 étudiants) :  
- RLS stricte par ecole_id sur toutes les tables
- Quotas par école (stockage, emails Brevo, exports)
- Panneau super-admin dédié (métriques par école, facturation)

---

## Métriques de succès

| Indicateur | Cible Phase 1 | Cible Phase 2 | Cible Phase 4 |
|---|---|---|---|
| Erreurs console (403/400) | < 5/page | 0 | 0 |
| WEBHOOK_SECRET exposé | Retiré | — | — |
| Tables avec RLS active | 15 critiques | 30+ | Toutes |
| Couverture tests | 0% | 20% | 70% |
| Temps chargement Dashboard | < 3s | < 2s | < 1s |
| Score Lighthouse mobile | — | 75+ | 90+ |

---

## Priorités immédiates (cette semaine)

1. **WEBHOOK_SECRET legacy** — retirer du HTML (30 min)
2. **RLS audit** — réactiver sur `notes_lmd`, `factures`, `paiements` avec policies (2h)
3. **Rate limit OTP** — Edge Function (1h)
4. **Journal audit** — brancher `audit_log` sur notes + relevés (2h)

