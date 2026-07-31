# Design System — EduLink Sup

> Formalisation du design system réellement utilisé en production, tel qu'il existe depuis le Sprint B7 et enrichi par les Sprints B9–B14 (accessibilité, dark mode, PWA). Ce document **ne propose aucune refonte** : il documente l'existant à partir de `src/index.css` et `src/components/AppLayout.tsx`.

**Sprint :** B15 — Action 1
**Dernière mise à jour :** Juillet 2026
**Sources :** `src/index.css`, `src/components/AppLayout.tsx`

---

## 1. Couleurs

### 1.1 Palette primaire

| Nom | Hex | Usage |
|---|---|---|
| Navy | `#1B2A4A` | Couleur de marque principale — sidebar, titres de page (`.top h2`), boutons primaires (`.btn-blue`), en-têtes de tableau |
| Ocre | `#C8932E` | Couleur d'accent — état actif (onglets, nav), focus des champs, bordure supérieure des tableaux, initiale avatar |
| Off-white (crème) | `#F7F4ED` | Texte sur fond navy (sidebar, logo « Sup »), fond doux (`table-wrap thead`, `btn-ghost:hover` → `#F7F4ED`) |

> ⚠️ **Variante observée : `#1e3a5f`.** Plusieurs pages (Délibérations, Portail Public, Messages) utilisent `#1e3a5f` au lieu de `#1B2A4A` pour le navy dans leurs boutons primaires et onglets locaux. Visuellement proche mais valeur différente — probable dérive plutôt que choix délibéré. À trancher : harmoniser sur `#1B2A4A` ou documenter comme navy secondaire.

### 1.2 Neutres

| Hex | Usage typique |
|---|---|
| `#374151` | Texte de titre secondaire (empty state `h3`) |
| `#4b5563` | Labels, sous-titres de page |
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
| Ocre | `rgba(200,147,46,0.15)` | `#92400e` | Accent de marque |

**Statuts semestre** (`.s-*`) réutilisent cette logique : `planifie` = gray, `en_cours` = green, `cloture` = amber, `archive` = blue.

### 1.4 Palette dark mode (`prefers-color-scheme: dark`)

| Hex | Usage |
|---|---|
| `#0f172a` | Fond de page, fond d'en-tête de tableau |
| `#1e293b` | Fond modal / table / champs ghost |
| `#334155` | Bordures |
| `#e2e8f0` | Texte principal |
| `#94a3b8` | Texte atténué |
| `#263449` | Survol de ligne de tableau |

> ⚠️ **Limitation connue (B11.10) :** le dark mode ne couvre que les classes CSS partagées. Les pages avec styles inline (ex. cartes de dashboard) ne sont pas encore adaptées.

---

## 2. Typographie

| Élément | Police | Taille | Poids |
|---|---|---|---|
| Titre de page (`.top h2`) | `'Lora', serif` | 22px | 600 |
| Logo sidebar | `'Lora', serif` | 19px | 600 |
| Corps de texte / UI | `'Segoe UI', sans-serif` | 13px | 400–600 |
| Sous-titre de page | Segoe UI | 13px | 400 |
| Label de champ | Segoe UI | 11px, uppercase, `letter-spacing: .04em` | 600 |
| En-tête de tableau | Segoe UI | 12px | 600 |
| Groupe de nav sidebar | Segoe UI | 10px, uppercase, `letter-spacing: .06em` | 600 |
| Badge | Segoe UI | 11px | 600 |

**Règle :** Lora est réservée aux titres de marque et de page (identité visuelle) ; tout le reste de l'interface reste en Segoe UI pour la lisibilité en contexte de gestion de données.

---

## 3. Espacements & rayons

Pas de token formel dédié — grille implicite en incréments de 2–4px sur une base de 8px.

**Paddings courants :** `4px 8px` (petit bouton) · `7px 10px`–`7px 12px` (champ, bouton ghost) · `8px 16px` (bouton principal) · `9px 14px`–`10px 14px` (ligne de tableau, item de recherche)

**Border-radius :**
| Valeur | Usage |
|---|---|
| 6px | Petit bouton (`.btn-ghost.btn-sm`) |
| 8px | Bouton, champ, item de nav, badge groupe |
| 10px | Table, dropdown de recherche |
| 12px | Dropdown résultats |
| 14px | Modal |
| 999px | Badge (pilule) |

**Ombres :**
- Modal : `0 20px 60px rgba(0,0,0,.2)` (dark : `.6`)
- Dropdown : `0 8px 24px rgba(0,0,0,.1)`
- Drawer mobile : `4px 0 24px rgba(0,0,0,.25)`

---

## 4. Composants

### 4.1 Boutons

```css
.btn-blue   /* Action principale — fond navy, texte blanc */
.btn-ghost  /* Action secondaire — fond blanc, bordure grise */
.btn-ghost.btn-sm  /* Variante compacte */
```
- `.btn-blue:hover` → `opacity: 0.85`
- `.btn-ghost:hover` → fond `#F7F4ED`
- Cible tactile : hauteur min. 44px sur les boutons interactifs de navigation (norme WCAG posée en B11)

### 4.2 Badges

Classe de base `.badge` + modificateur de couleur (`.blue`, `.green`, `.amber`, `.red`, `.purple`, `.teal`, `.gray`, `.ocre`). `display: inline-flex`, forme pilule, texte 11px/600.

### 4.3 Tabs

`.tabs` (conteneur, bordure basse 2px) + `.tab` / `.tab.active` (soulignement ocre, texte navy au survol/actif).

### 4.4 Table (`.table-wrap`)

- Bordure supérieure ocre 2px (signature visuelle de marque)
- En-tête sur fond `#FBFAF6`, texte navy
- Survol de ligne : fond `#FBFAF6` (dark : `#263449`)
- Pas de bordure sur la dernière ligne

### 4.5 Modal

`.modal-overlay` (fond semi-transparent, `z-index: 9999`) + `.modal` (fond blanc, radius 14px, `max-height: 90vh` avec scroll).

### 4.6 Formulaires

- Labels : uppercase, 11px, gris `#4b5563`
- Champs (`input[type=text|number|date]`, `select`) : bordure `#e5e7eb`, radius 8px
- Focus : bordure ocre + halo `box-shadow: 0 0 0 2px rgba(200,147,46,0.15)`

### 4.7 Empty state

Icône + titre (`h3`, gris foncé) + description + bouton d'action, centré, padding généreux (`3rem 1rem`).

### 4.8 En-tête de page (`.top`)

Structure flex : titre + sous-titre à gauche, actions (`.top-actions`) à droite, wrap sur mobile.

### 4.9 Cartes KPI

Deux implémentations coexistent, à harmoniser si l'occasion se présente :

- **Variante grille inline** (Délibérations, Enseignants) : `display: grid`, 4 à 6 colonnes, chaque carte = icône emoji + valeur (20–22px, `font-weight: 800`) + label (11px, gris `#64748b`), fond et couleur de texte paramétrables par carte (ex. vert `#f0fdf4`/`#059669` pour « Admis », rouge `#fef2f2`/`#dc2626` pour « Redoublants »).
- **Variante classes CSS** (Enseignants) : `.card` + `.c-ico` / `.c-val` / `.c-lbl` — mêmes proportions mais via classes partagées plutôt que styles inline.

### 4.10 Toast de notification

Pattern répété à l'identique sur Délibérations, Enseignants et Messages : position `fixed`, `top: 20, right: 20`, `z-index: 200`, fond coloré selon le type (`success` → `#059669`, `error` → `#dc2626`, `info` → `#1e3a5f`), texte blanc 13px/600, disparition automatique après 3–4s (`setTimeout`). Candidat naturel à l'extraction en composant partagé (`<Toast />` ou hook `useToast`) si ce n'est pas déjà fait ailleurs dans le repo.

### 4.11 Avatar (initiale)

Cercle 32px, fond coloré, initiale du nom en majuscule, centré (`display: flex; align-items: center; justify-content: center`). Vu dans Messages (fond navy `#1e3a5f` si l'expéditeur est l'utilisateur courant, gris `#6b7280` sinon) et dans la sidebar `AppLayout` (fond ocre `#C8932E`, texte navy).

### 4.12 Switch / Toggle personnalisé

Pas de `<input type="checkbox">` natif stylé — implémentation maison vue dans Portail Public : conteneur 44×24px, `border-radius: 12px`, fond navy si actif / gris `#d1d5db` sinon, cercle blanc 18px qui se déplace en `left: 2px` / `22px` avec transition. Pas d'attribut `role="switch"` ni `aria-checked` détecté — point d'attention accessibilité pour une prochaine passe.

### 4.13 Formulaire modal CRUD

Pattern stable sur Enseignants et Messages : `.modal-overlay open` + `.modal`, en-tête avec titre + bouton fermeture (`✕`), corps en grille 1 ou 2 colonnes (`label` au-dessus de l'`input`), zone d'erreur optionnelle (`role="alert"`, fond `#fee2e2`, texte `#dc2626`), pied de formulaire avec `btn-ghost` (Annuler) + `btn-blue` (submit, texte dynamique selon l'état `saving`).

### 4.14 Panneau d'import Excel/CSV

Vu dans Enseignants : encart d'instructions (fond `#f8fafc`, format attendu en `font-family: monospace`), champ `<input type="file">`, prévisualisation des lignes détectées avec statut ligne par ligne (✓/✗ + message d'erreur), bouton d'import désactivé tant qu'aucun fichier n'est chargé ou pendant l'import.

### 4.15 Style-objects locaux (pattern alternatif)

Portail Public n'utilise **aucune classe CSS partagée** — tout le styling passe par un objet `S = { ... }` local au fichier (boutons, champs, tableau, tabs, empty state, toggle, tout y est redéfini). Résultat visuellement cohérent avec le reste de l'app (mêmes rayons, mêmes couleurs), mais dupliqué plutôt que réutilisé — et porteur de la variante `#1e3a5f` mentionnée en section 1. À surveiller si d'autres pages suivent ce pattern plutôt que les classes partagées.

---

## 5. Navigation & Layout (`AppLayout.tsx`)

### 5.1 Structure

- **Sidebar** fixe 240px, fond navy, sticky, scroll interne — devient un **drawer** en dessous de 768px (transform + overlay + fermeture Échap/clic extérieur)
- **5 groupes de navigation** : Tableau de bord (épinglé, non repliable), Pédagogie LMD, Évaluation, Établissement, Système
- Groupes repliables individuellement (`aria-expanded` + `aria-controls`), état par défaut : tous ouverts
- Items filtrés dynamiquement par `visibleModules` (permissions par rôle)

### 5.2 Icônes

Toutes les icônes de nav sont des SVG inline (`ICON_PATHS`), 17px par défaut, `stroke="currentColor"`, `aria-hidden="true"` — **toujours accompagnées d'un libellé texte visible** (conformité WCAG 1.1.1, remplace les émojis pré-B11).

### 5.3 Recherche globale

- Barre de recherche unique interrogeant `etudiants`, `enseignants`, `factures` (Supabase, scoping par `ecole_id`)
- Raccourci clavier `Ctrl+K` / `⌘K` (détection plateforme via `navigator.platform`)
- Debounce 300ms, seuil de déclenchement : 2 caractères
- Résultats en dropdown avec badge de type coloré par catégorie

### 5.4 État actif

Item de nav actif : fond `rgba(200,147,46,0.18)`, bordure gauche ocre 2px, texte crème `#F7F4ED`, `aria-current="page"`.

---

## 6. Accessibilité (WCAG 2.1 AA — B11)

| Mécanisme | Implémentation |
|---|---|
| Focus visible | `outline: 3px solid #2563eb` sur tous les éléments interactifs (`:focus-visible`) |
| Skip link | Lien d'évitement vers `#el-main-content`, visible seulement au focus clavier |
| Cibles tactiles | Minimum 44×44px sur boutons et liens de nav |
| Contraste élevé | `@media (prefers-contrast: high)` — bordures et focus renforcés (outline 4px) |
| Windows High Contrast | `@media (forced-colors: active)` — `forced-color-adjust: none` + bordures `CanvasText` |
| Dark mode | `@media (prefers-color-scheme: dark)` sur les classes partagées uniquement |
| Rôles ARIA | `role="navigation"`, `role="listbox"`/`role="option"` sur la recherche, `aria-current`, `aria-expanded` |

---

## 7. Constats & incohérences relevés

Ces points ne bloquent pas la publication du document — ce sont des écarts réels entre pages, à trancher (harmoniser ou accepter) lors d'un futur sprint de conformité :

- **Navy à deux valeurs** : `#1B2A4A` (canonique, CSS partagé) vs `#1e3a5f` (Délibérations, Portail Public, Messages). Cf. section 1.
- **Régression de contraste partielle** : `#9ca3af` (texte secondaire, ratio ~2.5:1) réapparaît en styles inline dans Délibérations, Enseignants et Messages, alors que B11.1 l'a remplacé par `#6b7280` (ratio 4.8:1) dans les classes CSS partagées. Le correctif WCAG AA n'a pas été répercuté aux styles inline des pages métier.
- **Toggle personnalisé sans sémantique ARIA** (`role="switch"`, `aria-checked`) — cf. 4.12.
- **Duplication de styles** : Portail Public réimplémente l'intégralité du système visuel via un objet `S` local plutôt que les classes partagées — cf. 4.15.

## 8. Limitations connues / hors périmètre de ce document

- Les styles **inline** de certaines pages (cartes de dashboard, etc.) ne sont pas couverts par le dark mode — seules les classes CSS partagées le sont.
- **Portail Enseignant** n'a pas encore été audité (fichier non fourni à date de rédaction) — à intégrer dans une prochaine révision de ce document.
- Modules non couverts : formulaires complexes de saisie de notes, wizards multi-étapes, autres pages du groupe Établissement/Système non échantillonnées.

---

*Document généré dans le cadre du Sprint B15 (Action 1). À maintenir à jour à chaque évolution du CSS partagé ou de l'AppLayout.*
