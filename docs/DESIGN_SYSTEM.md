# Design System — EduLink Sup

> Formalisation du design system réellement utilisé en production, tel qu'il
> existe depuis le Sprint B7 et enrichi par les Sprints B9–B15 (accessibilité,
> dark mode, PWA, charte email/PDF). Ce document **ne propose aucune refonte** :
> il documente l'existant.

**Sprint :** B15 — Action 1
**Dernière mise à jour :** 11 août 2026
**Sources :** `src/index.css`, `src/components/AppLayout.tsx`,
`portail/…/releves/components/releveTheme.ts`, `supabase/functions/_shared/email-charte.ts`

---

## 1. Couleurs

### 1.1 Palette primaire

| Nom | Hex | Usage |
|---|---|---|
| Navy | `#1B2A4A` | Couleur de marque principale — sidebar, titres de page (`.top h2`), boutons primaires (`.btn-blue`), en-têtes de tableau, en-têtes d'email et de PDF, documents institutionnels |
| Ocre | `#C8932E` | Couleur d'accent — état actif (onglets, nav), focus des champs, bordure supérieure des tableaux, initiale avatar, filet sous les en-têtes d'email |
| Off-white (crème) | `#F7F4ED` | Texte sur fond navy (sidebar, logo « Sup »), fond doux (`table-wrap thead`, `btn-ghost:hover`), pied de page des emails |

> ⚠️ **Variante observée : `#1e3a5f`.** Les pages **Délibérations, Portail
> Public et Messages** utilisent `#1e3a5f` au lieu de `#1B2A4A` pour le navy
> dans leurs boutons primaires et onglets locaux (styles inline `const S = {...}`
> de ces modules). Visuellement proche mais valeur différente — probable dérive
> plutôt que choix délibéré. La fondation CSS globale (`src/index.css`) est
> intégralement en `#1B2A4A`, tout comme les gabarits email/PDF et les
> documents/pages produits depuis le Sprint B15 : le reliquat est localisé à
> ces trois modules, pas structurel. **Décision : `#1B2A4A` est la valeur
> canonique ; harmonisation de ces trois modules planifiée en chantier séparé,
> après les démos.**

### 1.2 Neutres

| Hex | Usage typique |
|---|---|
| `#374151` | Texte de titre secondaire (empty state `h3`), corps de texte des documents |
| `#4b5563` | Labels, sous-titres de page (`.page-subtitle`) |
| `#6b7280` | Texte atténué (empty state, loading) — *remplace `#9ca3af` depuis B11.1 pour conformité WCAG AA (ratio 2.5:1 → 4.8:1)* |
| `#94a3b8` | Placeholder, icônes secondaires, texte dark mode atténué |
| `#e5e7eb` / `#e2e8f0` | Bordures de champs, boutons ghost |
| `#f1f5f9` / `#f8fafc` / `#f9fafb` / `#f3f4f6` | Fonds de page et de survol |
| `#FBFAF6` | Fond d'en-tête de tableau, survol de ligne |

### 1.3 Badges de statut

| Couleur | Fond | Texte | Usage |
|---|---|---|---|
| Blue | `#dbeafe` | `#1d4ed8` | Info / archivé |
| Green | `#d1fae5` | `#065f46` | Succès / en cours |
| Amber | `#fef3c7` | `#92400e` | Attention / clôturé |
| Red | `#fee2e2` | `#991b1b` | Erreur / critique |
| Purple | `#ede9fe` | `#4c1d95` | Catégorie spéciale |
| Teal | `#ccfbf1` | `#0f766e` | Catégorie secondaire |
| Gray | `#f3f4f6` | `#374151` | Neutre / planifié |
| Ocre | `rgba(200,147,46,.15)` | `#92400e` | Accent de marque |

Statuts semestre (`.s-*`) réutilisent cette logique : `planifie` = gray,
`en_cours` = green, `cloture` = amber, `archive` = blue.

### 1.4 Palette dark mode (`prefers-color-scheme: dark`, Sprint B11.10)

| Hex | Usage |
|---|---|
| `#0f172a` | Fond de page, fond d'en-tête de tableau |
| `#1e293b` | Fond modal / table / champs ghost |
| `#334155` | Bordures |
| `#e2e8f0` | Texte principal |
| `#94a3b8` | Texte atténué |
| `#263449` | Survol de ligne de tableau |

---

## 2. Typographie

| Rôle | Police | Usage |
|---|---|---|
| Titres de page | `'Lora', serif` | `.top h2` |
| Wordmark "EduLink Sup" | `Georgia, 'Times New Roman', serif`, graisse 700 | En-têtes d'email, page de confidentialité, documents Word (secours web-safe de Lora) |
| Corps de texte | `'Segoe UI', system-ui, sans-serif` | Toute l'interface applicative |
| Emails (secours) | `Arial, Helvetica, sans-serif` | Compatibilité maximale des clients mail — ne pas utiliser Segoe UI dans les emails |

---

## 3. Rayons, ombres, focus

| Token | Valeur | Usage |
|---|---|---|
| Rayon standard | `8px` | Boutons, champs, badges de statut long |
| Rayon carte / modal | `10–14px` | `.table-wrap`, `.modal` |
| Rayon badge | `999px` (pilule) | `.badge` |
| Ombre modal | `0 20px 60px rgba(0,0,0,.2)` | `.modal` |
| Focus (champs) | Bordure ocre + `box-shadow: 0 0 0 2px rgba(200,147,46,.15)` | `input:focus`, `select:focus` |

---

## 4. Sources de vérité — importer, ne pas recopier

Deux gabarits partagés existent en dehors de `index.css` et **doivent être
importés**, jamais dupliqués dans une nouvelle fonction ou un nouveau module :

- **`releveTheme.ts`** (`portail/…/releves/components/`) — thème des documents
  PDF (relevés officiels, reçus). Déjà réutilisé par `RelevePDF.tsx`,
  `ReceiptPDF.tsx` et `ModalEditeurModele.tsx` (import `RELEVE_THEME`).
- **`supabase/functions/_shared/email-charte.ts`** (créé Sprint B15, action 2)
  — gabarit HTML des emails (`buildEmailCharteHtml`, palette `EMAIL_CHARTE`,
  `escapeHtml`). Importé par `send-notification-email`, `send-email` et
  `send-otp`. `publish-releve` conserve volontairement son propre gabarit
  riche, spécifique aux relevés.

Toute nouvelle Edge Function qui envoie un email **doit** importer
`buildEmailCharteHtml`. Tout nouveau PDF **doit** importer `RELEVE_THEME`.

---

## 5. Composants partagés (`src/index.css`)

Classes globales disponibles dans tous les modules React sans import
supplémentaire.

**Boutons** — `.btn-blue` (action primaire, navy) · `.btn-ghost` (action
secondaire, fond crème au survol) · `.btn-ghost.btn-sm` (variante compacte).

**Badges** — `.badge` + une couleur du § 1.3. Statuts semestre dédiés :
`.s-planifie`, `.s-en_cours`, `.s-cloture`, `.s-archive`.

**Tableaux** — `.table-wrap` (bordure supérieure ocre de 2px, signature
visuelle des données tabulaires) · en-têtes navy sur fond `#FBFAF6` · survol
teinté crème.

**Onglets** — `.tabs` / `.tab` / `.tab.active` (soulignement ocre 2px).

**Modales** — `.modal-overlay` (+ `.open`) / `.modal` (recouvrement 50%
sombre, carte blanche 14px, ombre prononcée).

**Formulaires** — `label` (majuscules, gris, letter-spacing) ·
`input[type=text|number|date]`, `select` (focus ocre systématique).

**États** — `.empty-state` (icône, titre, texte, bouton optionnel) ·
`.loading` (texte centré discret).

**En-tête de page** — `.top` / `.top h2` (titre Lora navy) / `.page-subtitle`
/ `.top-actions`.

---

## 6. Accessibilité (Sprint B11.10)

`src/index.css` couvre, sur l'ensemble des composants partagés ci-dessus :

- **`prefers-contrast: high`** — bordures et contours de focus renforcés
  (jusqu'à 4px sur les éléments focusés).
- **`forced-colors: active`** (contraste élevé Windows) — bordures forcées via
  les couleurs système (`CanvasText`) sur boutons, tableaux, modales, champs.
- **`prefers-color-scheme: dark`** — palette complète (§ 1.4) pour modales,
  tableaux, formulaires, onglets, états vides.

> ⚠️ Le mode sombre ne couvre que les éléments basés sur les classes CSS
> partagées ci-dessus. Les pages construites avec des styles React **inline**
> (cartes de tableau de bord, notamment) n'en héritent pas — point de suivi
> pour une prochaine passe d'accessibilité, hors périmètre de cette action.

Toute nouvelle interface doit réutiliser ces classes partagées plutôt que des
styles inline, pour hériter automatiquement de l'accessibilité déjà en place.

---

## 7. Conventions rapides

- Couleur de statut : toujours l'une des 8 couleurs du § 1.3, jamais une teinte ad hoc.
- Bouton d'action : `.btn-blue` pour l'action principale d'une vue, `.btn-ghost` pour le reste.
- Tableau de données : toujours dans `.table-wrap`.
- Email : toujours via `buildEmailCharteHtml`, jamais de HTML écrit à la main.
- PDF : toujours via `RELEVE_THEME`.
- Navy : toujours `#1B2A4A` dans tout nouveau code — ne pas réintroduire `#1e3a5f`.
