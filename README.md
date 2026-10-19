# Portfolio — premier draft

Site statique (HTML, CSS, JS sans build), prêt pour GitHub Pages.

## Lancer en local

Le site lit ses fichiers de contenu avec `fetch`, ce que les navigateurs bloquent quand on ouvre `index.html` par double-clic. Depuis ce dossier :

```bash
python3 tools/serve.py
```

puis ouvrir http://localhost:8000. Tout est inclus (polices et bibliothèque Markdown) : le site fonctionne hors ligne.

Préférer ce serveur à `python3 -m http.server 8000` : celui-ci interdit le cache, donc le navigateur affiche toujours la dernière version des fichiers (avec `http.server`, il peut garder d'anciens scripts, ce qui donne par exemple l'ancienne démo). Il accepte aussi la lecture partielle des vidéos, comme GitHub Pages. Avec l'ancien serveur, recharger avec Cmd+Shift+R après chaque modification.

## Organisation

```
index.html            squelette, ne change presque jamais (modèle de toutes les pages)
css/style.css         couleurs, typo, grille (tokens en haut du fichier)
js/app.js             moteur : adresses, arbre, fil d'Ariane, placement des cellules
js/demos.js           démos digits et media (aperçu animé + version interactive) ;
                      PIPELINE_3D : intègre demo/ sur sa page de simulation
demo/                 démo PIPELINE_3D autonome (voir demo/README.md)
tools/build_pages.py  génère un dossier par page (adresses sans #)
tools/record_demo.*   enregistre la vidéo de la démo PIPELINE_3D
tools/train_digits.py entraîne le modèle provisoire de la démo digits
assets/               photo, CV, poids du modèle digits, PDF d'exemple, vidéo
content/site.json     structure du site et métadonnées de chaque page
content/<section>/<page>/index.md   texte long de chaque page
projects/, research/, experience/, about/   GÉNÉRÉS par tools/build_pages.py
```

## Sur téléphone

Sous 960 px de large, la grille passe à 10 colonnes et la page tient en une colonne :

- la bande de gauche devient un en-tête de 10 × 3 cellules qui reste en haut de l'écran (A1:J3) : le portrait, le nom (lien vers l'accueil) et le mail de `owner.barEmail` dans `site.json`, « read cv », le bouton « menu + » et le fil d'Ariane sans « home » (sur l'accueil, le rôle à la place) ; un fil trop long pour sa rangée perd ses premiers noms, puis le dernier est coupé par « … » ;
- le bouton « menu + » ouvre, sous l'en-tête et par-dessus la page voilée, un tiroir en deux blocs : « pages » (le menu) puis « contact » (la fiche de contact de la page about sans le nom ni l'intro : mails, téléphone, lieu, profils et « Read CV » en bas à droite) ; un toucher sur le voile, la touche Échap ou le passage à une autre page le referme ;
- toute page se termine par un pied de page sur toute la largeur (A à J), ses cellules collées : sur une page d'une section, une case d'une rangée « ←  section · 3 / 5  → » (page précédente, la section et la place de la page, page suivante ; elle remplace les blocs previous / parent / next), puis le bloc contact (nom, mails, téléphone, lieu, profils et « read cv » en bas à droite, tirés de `owner` dans `site.json`) ; rien ne vient sous ce pied de page : sur une page courte il descend en bas de l'écran, sinon la page s'arrête avec lui ;
- sur une page dont l'en-tête est la fiche de contact (`header.contact`, la page about), cette fiche garde 9 rangées (B5:I13), son texte suivant la taille de la grille (sur ordinateur, elle garde 4 rangées, G4:O7 : les deux mails sur une ligne, « Read CV » au bout de la ligne des profils) ;
- les blocs de la partie de droite s'empilent dans l'ordre de lecture de la version ordinateur : bande après bande, et dans une bande de haut en bas puis de gauche à droite (un bloc posé sous un autre vient après les blocs placés à côté de celui-ci). Pour changer leur ordre sur téléphone, changer leur place sur ordinateur (`arrangement`, `bands`).

## Adresses

Chaque page a une vraie adresse, sans `#` : `/projects/blast-routing/`. Pour que ces adresses fonctionnent aussi quand on les ouvre directement (lien partagé, rechargement), chaque page existe comme un dossier contenant une copie de `index.html` avec son propre titre et sa description (utilisés par Google et par les aperçus de lien). Ces dossiers sont générés :

```bash
python3 tools/build_pages.py
```

À relancer après chaque modification de `content/site.json` (nouvelle page, titre, résumé) ou de `index.html`, puis publier les dossiers générés avec le reste. Ne pas les modifier à la main : le script les réécrit. Les anciennes adresses en `#/…` redirigent vers les nouvelles.

Le script ajoute aussi une empreinte du contenu aux scripts et à la feuille de style (`js/app.js?v=6461f1e3`) : quand un fichier change, son adresse change, et aucun navigateur ne peut garder l'ancienne version. Il faut donc le relancer après chaque modification de `css/` ou `js/`, même sans nouvelle page.

Pour les aperçus de lien, renseigner `baseUrl` en tête de `content/site.json` (l'adresse publique du site, par exemple `https://mon-pseudo.github.io`), puis relancer le script : chaque page reçoit alors `og:url`, `og:image` (si `ogImage`), `canonical` et `twitter:card`. Pour partager une page, utiliser son adresse complète, par exemple `https://mon-pseudo.github.io/projects/blast-routing/`.

## Ajouter un projet (ou une expérience, une note de recherche)

1. Créer le dossier `content/projects/mon-projet/` avec un `index.md` dedans.
2. Ajouter un objet dans `children` de la bonne section de `content/site.json` (puis lancer `python3 tools/build_pages.py`, voir « Adresses ») :

```json
{
  "id": "mon-projet",
  "title": "Mon projet",
  "subtitle": "Une ligne sous le titre",
  "summary": "Une ligne pour la carte",
  "layout": "article",
  "role": "...", "team": "...", "period": "2025",
  "date": "2025-06",
  "stack": ["Python"],
  "links": [{ "label": "code on GitHub", "href": "https://..." }],
  "pdf": "content/projects/mon-projet/report.pdf",
  "status": "done"
}
```

C'est tout : la carte, la ligne dans le menu et la navigation précédent/suivant apparaissent seules.

Champs utiles :

| champ | effet |
|---|---|
| `layout` | `article` (texte + liens), `lab` (démo interactive en tête), `document` (PDF intégré en tête), `case` (étude de cas, voir plus bas) |
| `aliases` | anciens identifiants de la page : leurs adresses redirigent vers l'adresse actuelle |
| `metaTitle`, `metaDescription`, `ogImage` | titre, description et image des aperçus de lien (LinkedIn, Slack, moteurs de recherche) ; `metaTitle` sert aussi de titre d'onglet |
| `kind` | catégorie affichée sur les cartes épinglées : `academic`, `research`, `professional` ou `personal` |
| `partner` | partenaire (affiché « with … » sur la carte épinglée, seulement s'il est renseigné) |
| `tags`, `updated`, `repo` | mots-clés, date de mise à jour (affichée dans la fiche), dépôt de code (aucun bouton tant que vide) |
| `demo` | `path`, `digits` ou `media` : branche une démo ; la page passe en tête de section et dans « try it » sur l'accueil |
| `start` | début du projet, `AAAA-MM` (ou `AAAA`) : les pages d'une section sont rangées dans l'ordre chronologique, du plus ancien au plus récent, dans le menu, la grille de la section, les liens précédent / suivant et les épinglés de l'accueil ; une page sans `start` vient en dernier |
| `cover`, `coverAlt` | image (dans le dossier de la page) : aperçu sur la carte de la grille « projects » et sur l'accueil si la page est épinglée (quand la page n'a pas de démo), et, sur une page article, au-dessus des liens |
| `video`, `poster` | avec `demo` : la page montre cet enregistrement au lieu de la démo, avec un bouton vers sa page `…/simulation/` où tourne la vraie démo ; sur les cartes de l'accueil et de la section, la vidéo prend son tour dans la rotation des aperçus (5 s chacun, courte pause, puis le suivant, en boucle) ; seul le visiteur l'interrompt : le survol lance une carte et met les autres en pause ; quand la souris la quitte, elle se met aussitôt en pause (en vert) et, après la courte pause, la boucle reprend à la carte suivante |
| `videoCaption`, `liveLede` | texte sous la vidéo, et chapeau de la page de simulation |
| `liveSeed` | carte sur laquelle s'ouvre la page de simulation (la même que la vidéo) ; « new start » tire ensuite des cartes aléatoires |
| `status` | `wip` fait apparaître la page dans « on the bench » sur l'accueil |
| `date` | la page la plus récente (hors `wip`) devient « last entry » ; `home.latest` force un choix |
| `pdf` | ajoute « read the report » et « download pdf » |
| `hidden` | garde la page en réserve sans l'afficher |

Dans le Markdown, les images et liens relatifs sont résolus depuis le dossier de la page (`![schéma](schema.png)`).

## Page d'accueil : les trois cartes épinglées

`home.pinned` dans `content/site.json` liste les trois pages mises en avant, par leur chemin : `["research/vtnn-notes", "projects/autogear", "projects/blast-routing"]` ; elles s'affichent dans l'ordre chronologique (voir `start` ci-dessous), quel que soit leur ordre dans la liste. N'importe quelle page peut y figurer (expérience, note de recherche…). Chaque carte affiche, en haut, la catégorie (`kind`), la période (`period`), le partenaire (`partner`, s'il y en a un) et « ongoing » si la page est en cours (`status` `wip` ou `current`) ; puis le nom (précédé de ▶ si la page a une démo) ; puis la description rapide (`summary`). Une page avec démo ou vidéo garde son aperçu animé ; une page sans démo montre son image `cover` si elle en a une, sinon sa description en plus grand. Une valeur `TODO` s'affiche en couleur pour être repérée. Sans `home.pinned`, l'accueil reprend les trois premières pages avec démo.

## Étude de cas (`"layout": "case"`)

Gabarit des pages projet racontées comme une étude de cas (aujourd'hui `projects/blast-routing`). Tout le texte est dans le dossier de la page : `page.json` donne la structure, les textes courts et les formules ; les textes longs sont dans des `.md` qu'il nomme (`summary.md`, `role.md`, `how.md`, `decision-1.md`…, `limits.md`, `credits.md`). Le code (`js/app.js`, fonction `caseBands`) ne fait que les placer sur la grille, dans l'ordre : en-tête et fiche, aperçu de la démo, ligne d'accès, résumé et rôle, schéma, une bande par décision (texte à gauche, formule à droite), limites et ressources, navigation. Pour un autre projet : copier `page.json` et les `.md`, changer les textes, mettre `"layout": "case"` et `"page": "page.json"` dans `site.json`.

Le schéma « how it works » se décrit dans `page.json` (`how.diagram`) : des modules placés sur une petite grille (`col`, `row`), `accent: true` pour mettre l'un d'eux en évidence, et des flèches (`from`, `to`, `label`, `dashed`).

Options de `page.json` (exemples : `projects/blast-routing`, `projects/absorber-placement`, `research/tfjm-2022`) :

- `arrangement` : l'ordre des bandes, une liste de noms par bande, par exemple `[["header:full"], ["role:full"], ["summary", "facts"], ["how"], ["decisions"], ["figure"], ["limits", "resources"]]` (noms : `header`, `facts`, `preview`, `hint`, `figure`, `summary`, `role`, `how`, `decisions`, `limits`, `resources` ; `:full` = toute la largeur ; deux noms = gauche et droite). Les téléphones lisent les bandes de gauche à droite et de haut en bas. Sans ce champ : en-tête et fiche, aperçu, ligne d'accès, figure, résumé et rôle, schéma, décisions, limites et ressources ;
- `blocks` : des blocs de texte en plus, par nom, à placer dans `arrangement` (exemple : `"overview": { "label": "the project", "md": "overview.md", "list": true }`) ;
- `decisions:group` dans `arrangement` : toutes les décisions en sous-blocs d'un seul grand bloc pleine largeur (texte à gauche, formule à droite), titré par `decisionGroup.label` ; avec `"collapsible": true`, le bloc reste replié jusqu'à ce que le lecteur l'ouvre (`open` / `close` : textes du lien) ; avec `"toggleIn": "role"` (ou le nom d'une autre cellule), le bloc n'est pas du tout sur la page au départ : un lien en bas de cette cellule l'affiche juste en dessous, puis le retire (exemples : les deux projets) ; avec `"relief": true`, le texte et la formule deviennent deux cartes en relief (ombre décalée) posées dans le grand bloc (exemples : `research/tfjm-2022`, les deux projets) ; `"wideText": true` donne plus de place au texte qu'à la formule (8/5 au lieu de 7/6) ;
- `blocks.<nom>.image` (+ `imageAlt`, `imageCaption`) : une image à côté du texte du bloc ;
- `report`, `credits`, `related` : les ressources en cellules séparées, à placer dans `arrangement` (au lieu de `resources` d'un seul tenant) ; `report.readAndDownload: true` remplace « read » et « download » par un seul lien (`readLabel`) qui ouvre le PDF et le télécharge ;
- `figure` : pour un projet sans démo, une figure statique à la place de l'aperçu (`panels` : images et légendes côte à côte, en 2 × 2 sur téléphone ; `caption` : la légende générale ; `panelWidth` : une largeur fixe en px pour des panneaux centrés, utile pour deux ou trois photos, exemple : `projects/autogear`) ;
- `video` (`label`, `src`, `poster`, `caption`) : une vidéo du projet (fichiers dans le dossier de la page), à placer dans `arrangement` sous le nom `video` ; tant que `src` est vide, le bloc n'apparaît pas (exemple : `projects/autogear`) ;
- `hint.inPreview: true` : la ligne d'explication de la démo passe dans le bloc de l'aperçu, juste sous la vidéo (exemple : `projects/blast-routing`) ;
- `facts.compact: true` : la fiche écrit chaque terme devant sa valeur, sur toute la largeur, pour tenir en moins de rangées ;
- `resources.more` : des lignes de fiche déplacées dans les ressources (pour garder l'aperçu ou la figure visible à l'arrivée) ;
- `decisionLabels` : les libellés des bandes de décisions (`decision` / `math`, ou `contribution` / `math`) ;
- schéma (`how.diagram`) : `boxWidth`, `minWidth` (largeur minimale en px, le schéma défile alors sur téléphone), `below` (une ligne de texte sous le schéma), `caption` ; par module, `style` : `filled` (fond vert : mon travail), `outline` (contour vert épais : travail partagé) ou rien (équipe), `sub` (une ou plusieurs lignes) ; par flèche, `loop: true` pour un retour sous les blocs.
- dans `arrangement`, `"a>b>c"` empile des cellules dans une même colonne, chacune sous la précédente (avec une rangée vide pour son étiquette), indépendamment de l'autre colonne ; `":0-7"` après un nom fixe ses colonnes (de 0 à 13, soit G à T sur ordinateur) ; exemple : `[["header>tournament>problem", "facts>debate"], …, ["takeaways:0-7", "documents:8-13"]]` dans `research/tfjm-2022` ;
- `header.class` : une classe en plus sur l'en-tête ; `"case-head-airy"` répartit ses lignes sur toute la hauteur de la cellule ;
- `header.badge` : un libellé encadré sous l'accroche (par exemple un classement) ; `header.buttons` : des boutons en plus, vers des fichiers du dossier de la page (`{ "label", "file" }`, ou `href` pour une adresse) ;
- `blocks.<nom>.class` : une classe CSS en plus sur le bloc ; `"case-steps"` présente la liste numérotée du bloc en étapes, en ligne sur ordinateur et empilées sur téléphone (exemple : « our year, from research to debate » de TFJM) ;
- `resources.documents` (cellule `documents`) : des documents côte à côte, chacun avec sa vignette, son titre, sa description et les liens « read » et « download » ; `resources.links` : des liens en dessous ; `"hidden": true` masque un document (ou un bouton) dont le fichier n'est pas encore là ; `"readAndDownload": true` sur un document remplace « read » et « download » par un seul lien (`readLabel`) qui ouvre le PDF et le télécharge ;
- `formula` peut être une liste de lignes : elles s'affichent l'une sous l'autre (une ligne `"\\[4pt]"` seule ajoute l'espacement entre les deux lignes qu'elle sépare) ;
- Une valeur `[TO CONFIRM]` ou `TODO` dans la fiche s'affiche en couleur, pour être repérée ; `*texte*` dans une valeur de la fiche s'affiche en italique.

Dans `site.json`, `menuTitle` donne un nom plus court pour le menu quand le titre de la page est trop long (exemple : « TFJM² 2022 »).

### Écrire une formule

Les formules sont rendues par KaTeX (`js/vendor/katex/`, version 0.16.11, chargé seulement sur les pages qui en ont) :

- dans un `.md` : `$…$` dans le texte, `$$…$$` en bloc ; pour un vrai signe dollar, écrire `\$` ;
- dans `page.json` (champ `formula`) : le LaTeX seul, sans dollars, en doublant les `\` (c'est du JSON) : `"\\sigma_{\\text{rel}} < 0.05"`.

Une formule invalide s'affiche en rouge (KaTeX) ou en code source brut ; la page ne casse pas. Une formule plus large que sa cellule est réduite à 0,85 em, ou à 0,72 em si elle tient alors entièrement ; sinon elle défile horizontalement dans sa cellule.

## Expérience (`"layout": "role"`)

Gabarit court pour un poste, un rôle ou du bénévolat (exemples : `experience/dassault`, `iagrim`, `teaching`, `cheerup`). Dans `site.json`, mettre `"layout": "role"` et `"page": "page.json"` ; tout le reste est dans le dossier de la page :

- `header` : `label`, `title`, `subtitle`, `tags` (colonnes 1–9) ; `facts` : `label`, `rows` (colonnes 11–14) ;
- `bands` : une liste de bandes, chacune avec `main` (`label`, `md` : colonnes 1–9 ; avec `"full": true`, toute la largeur, sous les deux colonnes) et, si besoin, `aside` (`label`, puis `rows` pour une petite fiche « at a glance », ou `md` pour une liste ; `caption` en option : colonnes 11–14) ;
- `note` (`label`, `md`) : une bande pleine largeur en bas, en option (statut, remarque) ; avec `"column": "main"`, elle se place sous les blocs principaux, dans leur colonne ;
- `columns` : les colonnes de toute la page, par exemple `{ "main": [0, 7], "aside": [9, 13] }` pour G–N et P–T (par défaut G–O et Q–T).

Chaque colonne se remplit depuis le haut, avec une seule rangée vide (l'étiquette) entre deux blocs : à gauche l'en-tête puis les blocs principaux, à droite la fiche puis les encadrés, chaque encadré jamais plus haut que le bloc principal qui lui correspond.

Un bloc absent ne s'affiche pas et ne laisse pas de cellule vide. Sur téléphone : en-tête, fiche, premier bloc principal, son encadré, puis la suite.

Le gabarit sert aussi à une page sans pages filles (exemple : `about`, avec `"layout": "role"` sur la section elle-même ; pas de liens précédent / suivant). Options en plus :

- `header.buttons` : des boutons sous l'accroche (`{ "label", "href", "download": true }`) ; avec `"ifExists": true`, le bouton n'apparaît que si le fichier existe ; avec `"cv": true`, le bouton ouvre le CV de `owner.cv` et le télécharge ;
- la fiche de contact, sans le nom ni l'intro, sert aussi de bloc contact en bas de la bande de gauche sur ordinateur (son texte suit la taille de la grille pour tenir en 4 rangées ; dans une fenêtre trop basse, elle laisse de côté la ligne « based ») et dans le menu du téléphone ;
- `header.md` : un texte sous l'accroche de l'en-tête (exemple : `about`, où l'en-tête « who I am » porte le nom, l'intro puis `who-i-am.md`) ; `"side": "right"` sur un `aside` sans `main` : l'encadré va dans la colonne de droite, sous les précédents (exemple : « research interests » de `about`) ;
- `header.contact: true` : l'en-tête devient la fiche de contact (exemple : `about`) : le nom pour titre, puis les mails et les profils de `owner.contact`, `owner.phone` et `owner.based` (une ligne ou une liste de lignes) pris dans `site.json` ;
- `"stacked": true` sur un `aside` à `rows` : chaque terme au-dessus de sa valeur, pour les termes longs ;
- un `main` peut aussi porter `rows` (une liste de définitions) au lieu d'un `md`, par exemple sur toute la largeur avec `"full": true` (« languages & tools » de `about`) ;
- dans un `.md`, un lien écrit `#/section/page` pointe vers une page du site ; si la page n'existe pas, le texte reste sans lien.

Pour une page qui regroupe plusieurs engagements du même type (exemple : `experience/cheerup`, « Volunteer work »), remplacer `facts` et `bands` par `entries` : une liste d'entrées, chacune affichée comme un grand bloc pleine largeur (`tag` : l'étiquette au-dessus, par exemple la période ; `title`, `subtitle`, `tags`, `facts`, et `blocks` : une liste de `{ label, md }`). Dans le grand bloc, les parties sont des cartes en relief : en haut la présentation et la fiche, le premier texte sous la présentation, les autres sur toute la largeur. Ajouter une entrée ajoute un grand bloc. Une valeur `[TO CONFIRM…]` dans une fiche s'affiche en couleur ; dans un `.md`, l'entourer de `<span class="todo">…</span>`.

## Vidéo de la démo (Blast-aware routing)

La page du projet et l'accueil montrent un enregistrement (`assets/video/pipeline-3d.mp4`, 35 s, 2 Mo) pour ne rien calculer ; la vraie démo tourne sur `/projects/blast-routing/simulation/`. Sur la page du projet, la vidéo se lance une fois, se met en pause dès qu'elle n'est plus entièrement visible, reprend quand elle l'est, ne se relance pas à la fin, et repart du début au survol si elle est entièrement visible.

Pour la réenregistrer (après une modification de `demo/`, ou pour une autre carte), avec ffmpeg installé :

```bash
python3 tools/record_demo.py
```

puis ouvrir http://localhost:8001/tools/record_demo.html?seed=19&speed=2 et attendre « done » (environ 40 s). La vidéo et son image d'aperçu sont réécrites ; mettre à jour `videoCaption` si la graine change.

## Photo

Mettre la photo dans `assets/photo.jpg` et renseigner `"photo": "assets/photo.jpg"` dans `owner`. Un filtre bichrome (vert foncé → écru) l'harmonise automatiquement avec le site.

## Changer les couleurs

Un seul endroit : le bloc `PALETTE` en haut de `css/style.css`.

```css
--bg: #FBFAF7;      /* fond des pages et des cellules */
--line: #ECE7DB;    /* quadrillage fin */
--ink: #333539;     /* texte et bord des cellules fusionnées */
--muted: #717274;   /* texte secondaire, coordonnées */
--accent: #346560;  /* cellule active, liens, démos */
```

Écrire les valeurs en hexadécimal à 6 chiffres. Tout le reste en découle : les démos lisent ces variables au chargement, la teinte pâle `--accent-soft` est calculée, et le filtre de la photo (ombres = accent assombri, lumières = fond) est recalculé par `js/app.js`.

Deux règles pour garder le site lisible :
- `--muted` et `--accent` doivent garder un contraste d'au moins 4,5:1 sur `--bg` (vérifiable sur webaim.org/resources/contrastchecker) ;
- `--line` doit rester à peine plus sombre que `--bg`, sinon le quadrillage concurrence les cellules.

Après modification, recharger la page sans cache (Cmd+Shift+R).

## Mettre en ligne sur GitHub Pages

1. Créer un dépôt nommé `<ton-pseudo>.github.io`.
2. Pousser le contenu de ce dossier à la racine.
3. Settings → Pages → Deploy from a branch → `main` / root.

Le site est alors servi à `https://<ton-pseudo>.github.io`.

## À remplir

Tous les `TODO` dans `content/site.json` et les fichiers `index.md`, plus : nom de famille, liens de contact, CV, rapports PDF, photo. La démo digits utilise un modèle provisoire (MLP entraîné sur les chiffres 8 × 8 de l'UCI) à remplacer par le classifieur MPS.
