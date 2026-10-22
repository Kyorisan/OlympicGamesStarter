# Notes d'architecture | OlympicGamesStarter

# Partie 1 - Audit du starter

### Objectifs du document
- Identifier les mauvaises pratiques, la dette technique et les points de fragilité.
- Préparer le terrain pour un front-end qui consommera une vraie API.

## 1. Inventaire du projet

Architecture actuel
```src/app/
├── app.module.ts
├── app-routing.module.ts
├── app.component.{ts,html,scss}
└── pages/
    ├── home/
    ├── country/
    └── not-found/
src/styles.scss
src/assets/mock/olympic.json
```

### Première observation réalisée
- Le problème n'est pas la taille des fichiers. (70 lignes pour le plus gros, contre 300 lignes pour la limite imposée.)
- Un composant possède plusieurs responsabilités en peu de lignes.
    - Rien a découper en volume, tout à déplacer.

### Deuxième observation réalisée
- De nombreux fichiers sont manquants.
    - On nous demande de consulter ``olympic.service.ts``, c'est un fichier qui n'existe pas.
    - On nous demande de consulter les composants ``services/`` et ``/models``, les dossiers n'existent pas.

## 2. Problèmes identifiés

Plusieurs problèmes ont été identifiés sur le projet.

## 2.1 - Séparation des responsabilités

### L'appel HTTP est fait directement dans les composants

``home.component.ts`` et ``country.component.ts`` : Injection de ``HttpClient`` et appellent ``this.http.get<any[]> ('./assets/mock/olympic.json')`` dans leur méthode ``ngOnInit``.

```
// home.component.ts ET country.component.ts - Duplication
private olympicUrl = './assets/mock/olympic.json';
```

#### Il s'agit de l'anti-pattern du projet

- **Duplication de l'URL** : Deux sources de vérité pour la même ressource. Si on modifie l'URL un jour, il faudra la modifier dans les deux fichiers, la pratique n'est pas là.

- **Aucune mise en cache** : La Navigation ``Dashboard > Pays > Retour`` fait 3 requêtes pour le même fichier. Sur un mock c'est invisible, sur une API c'est 3 allers-retours réseau inutiles.

- **Composants non testables** : Impossible de tester la logique. Obligation de réaliser un ``HttpTestingController`` pour permettre à un composant d'être testé avec un service.

- **Logique métier dans la couche présentation** : Calcul du nombre de JOs, du total de médailles, de l'agrégation par pays, c'est pas de l'affichage mais du domaine, c'est à corriger.

**Piste retenue** : Création d'un ``OlympicService`` dans ``core/services/``.

## 2.2 - Duplication de la logique d'agrégation

Dans le fichier `home.component.ts` :
```
const medals = data.map((i: any) => i.participations.map((i: any) => (i.medalsCount)));
const sumOfAllMedalsYears = medals.map((i) => i.reduce((acc: any, i: any) => acc + i, 0));
```

Dans le fichier `country.component.ts` :
```
const medals = selectedCountry?.participations.map((i: any) => i.medalsCount.toString());
this.totalMedals = medals.reduce((acc: any, item: any) => acc + parseInt(item), 0);
```

Les deux font la même chose. Il s'agit de deux implémentations du même calcul, donc deux endroits où un bug peut arriver.

La seconde méthode fait un aller-retour `number > string -> number` pour que le tableau soit accepté comme `string[]` par Chart.js. **On parle d'un comportement de typage, et pas de typage directement.**

## 2.3 - Absence totale de typage

14 fois. Dans le code actuel (20-10-2026), on retrouve `any` utilisé 14 fois entre les deux composants. **Le cahier des charges l'interdit.**

Différents exemples :
- `(i : any) => i.participations` : On n'a aucune garantie que `participations` existe.
- `public totalEntries: any = 0;` : On retrouve un compteur typé `any` alors qu'il s'agit d'un `number`.
- `(acc: any, i : any)` dans les reduce.

A noter également que les variables à nommage pauvre comme `i`, `f` ou encore `acc` rendent le code encore plus mauvais.

Exemple avec `i` : `i` est **réutilisé en shadowing** dans `data.map((i: any) => i.participations.map((i : any) => ...))`, où le `i` interne cache le `i` externe.

## 2.4 - Mauvaise gestion des observables

Quatre problèmes ont été trouvés dans le code en date du 20-10-2026.

### A - La signature dépréciée de ``subscribe``

```
this.http.get<any[]>(this.olympicUrl).pipe().subscribe(
  (data) => { ... },
  (error: HttpErrorResponse) => { ... }
)
```

Depuis RxJS 6.4, la méthode est dépréciée, elle est carrément supprimée en RxJS 8. Il faut donc passer par la méthode ``subscribe({ next, error })``.

Le ``.pipe()`` juste avant la méthode subscribe est du code mort.

### B - Aucun désabonnement HTTP, aucun OnDestroy

Aucun des deux composants n'implémente la méthode ``onDestroy``. Ce qui fait que l'abonnement HTTP se termine tout seul (HttpClient complète après une émission) mais il ne se termine jamais vraiment :

```
this.route.paramMap.subscribe((param: ParamMap) => countryName = param.get('countryName'));
```

`paramMap` > Observable infini, provocation d'une fuite mémoire à chaque visite d'une page pays. Il faudrait utilise l'`async` pipe dans le template, qui pourra gérer le désabonnement tout seul.


### C - Deux abonnements imbriqués en séquence implicite

```
let countryName: string | null = null
this.route.paramMap.subscribe((param) => countryName = param.get('countryName'));
this.http.get<any[]>(this.olympicUrl).subscribe((data) => {
  const selectedCountry = data.find((i: any) => i.country === countryName);
```

Fonctionnement **par chance** : ``paramMap`` émet de façon synchrone au premier abonnement, donc ``countryName`` est déjà renseigné quand la réponse HTTP arrive. Sauf que dans le code, la dépendance entre les deux flux n'est renseignée nulle part, pas une seule information / donnée. Le code cassera silencieusement si un jour on décide d'ajouter un ``delay`` par exemple.

### D - Le composant ne réagit pas au changement de paramètre

Comme la méthode ``ngOnInit`` est jouée qu'une seule fois, faire une navigation de ``/country/France`` vers ``/country/Italy`` sans détruire le composant n'actualisera pas l'affichage. Angular va réutiliser l'instance quand seul le paramètre change. Sauf qu'actuellement, rien n'existe pour ça, donc c'est un bug silencieux / qui dort jusqu'à ce qu'on ajoute une navigation entre pays.

## 2.5 - Gestion des erreurs absente ou dangereuse

**Le crash le plus évident du projet**, si on tape une URL avec un pays qui n'existe pas dans le projet ``Exemple : /country/Japan``, la méthode ``find()`` retournera ``undefined`` et la ligne suivante lève un ``TypeError`` :
```
const selectedCountry = data.find((i: any) => i.country === countryName);
this.titlePage = selectedCountry.country;
```

Un détail qui est révélateur, les lignes suivantes utilisent bien ``selectedCountry?.participations`` avec l'optional chaining.

Donc l'auteur savait que la valeur pouvait être ``undefined`` mais a oublié la première ligne. Le ``?.`` sur les lignes d'après ne sert donc à rien, puisqu'on n'y arrive jamais.

Le cahier des charges demande explicitement de gérer l'ID invalide, actuellement on retrouve un écran blanc avec une erreur console.`

**Les erreurs HTTP, elles, sont capturées mais jamais affichées**. En effet, les deux composants stockent ``this.error = error.message``, et aucune des deux templates n'affiche cette variable. Elle est inutile actuellement.

Par ailleurs, on retrouve ``public error!: string`` qui abuse de l'assertion ``!`` vu qu'on l'a met sur une propriété qui n'est pas toujours assignée.

Le cahier des charges demande des états **loading** et **empty**, actuellement elles n'existent pas du tout. L'utilisateur voit donc une page qui est vide et ensuite le graphe apparaît > Problème.

## 2.6 - Code mort / de debug

Dans le code, plusieurs choses sont à supprimer : 
- ``console.log`` : A la fois du debug oublié et sur une vraie API, une fuite potentielle de données en console de production.
- ``console.log(erreur : ${error})`` : Présent dans le handler d'erreur de ``home``.
- ``.pipe()`` : C'est un appel vide, qui n'a pas d'opérateur.
- ``.map((i: any) => i)`` : Cette fois, c'est une copie d'identité.

- ``{{ pieChart }}`` et ``{{ lineChart }}`` dans les balises ``<canvas>`` :
```
<canvas id="DashboardPieChart">{{ pieChart }}</canvas>
```
Cet endroit est principalement là pour une description textuelle accessible. Sauf que là on récupère l'objet ``Chart`` complètement, dont le ``toString()`` qui va donc afficher : ``[object Object]``. Tout cela n'est pas bon car nous avons à la fois, du code inutile ainsi que le gaspillage du seul emplacement prévu pour l'accessibilité du graphe.

## 2.7 - Cycle de vie sur les graphiques Chart.js

```
const pieChart = new Chart("DashboardPieChart", { ... });
```

Ici, on retrouve trois problèmes :

- **Sélection par ID global plutôt que par @ViewChild** : Le composant va chercher un élément du DOM par identifiant au lieu de s'appuyer sur sa propre vue. Deux instances du composant sur la même page et elles se marchent dessus. Pas bon et mauvaise optimisation.

- **Aucun destroy()** : Les instances ``Chart`` ne sont jamais détruites. Donc chaque navigation va en créer une nouvelle et va abandonner la précédente. Le fait qu'elle garde donc ses écouteurs d'événements sur un canvas détaché, on peut parler d'une fuite mémoire importante qui va s'accumuler à chaque aller-retour.

- **Fragilité structurelle** : ``new Chart(...)`` est appelé depuis le callback HTTP, en supposant que le canvas est déjà dans le DOM. Dès qu'on va chercher à le mettre dans un ``*ngIf`` pour gérer l'état **loading** (demande du cahier des charges), on va perdre le canvas au moment de l'appel et donc le graphe va plus s'afficher.

Un autre problème a été trouvé mais moins grave que les autres :
```
backgroundColor: ['#0b868f', '#adc3de', '#7a3c53', '#8f6263', 'orange', '#94819d'],
```
La palette de couleurs est codée en dur. Si on ajoute un nouveau pays depuis une API par exemple, aucun couleur lui sera attribué. Enfin, le ``orange`` au milieu des codes couleurs fait tâche.

## 2.8 - Les styles et responsives du projet

- **CSS globalement fragile** : ``styles.scss`` définit ``.center`` et ``.split`` avec des sélecteurs descendants (``.split div { ... }``, ``.center div { ... }``). Vous rajoutez un ``<div>`` dans les conteneurs visés et il va hériter par défaut du style. Mauvaise optimisation.

- **Couleur de marque dupliquée** : ``#0b868f`` apparaît dans ``styles.scss`` deux fois, une fois respectivement dans ``home.component.ts`` et ``country.component.ts``. Pas de variable SCSS, alors que c'est demandé par le cahier des charges.

- **Deux fichiers SCSS vides** : ``app.component.scss`` et ``home.component.scss`` font 0 ligne. Rien n'est codé dedans.

- **Responsive quasiment inexistante** : Une seule media query dans tout le projet (``max-width: 1000px`` sur ``.container``). Les breakpoints demandés par le cahier des charges ne sont pas là.

- **Casse annoncée sur mobile** : ``.split`` est un ``display: flex; flex-direction: row`` sans ``flex-wrap``. Autrement dit, les trois indicateurs de la page détail ne passeront pas à la ligne quand on sera sur petit écran, ils vont déborder voir s'écraser.

- **Largeur en dur** : ``.container { width : 50% }`` sur la page des pays, on parle d'une valeur arbitraire et pas d'une grille.

## 2.9 - Accès

Encore là, on retrouve plusieurs problèmes qui empêchent le bon fonctionnement pour les utilisateurs.

- **Aucun ``<h1>`` dans l'application** : La page d'accueil démarre sur un ``<h2>``, la page pays n'a aucun titre sémantique (le nom du pays est dans un ``<div>``). La hiérarchie de titres invalide.

- **La navigation principale inaccessible au clavier** : Le seul moyen d'atteindre une page pays (US-02) est de **cliquer sur une part de la pie chart**. Un canvas n'est pas focusable, il n'y a aucun lien, aucune liste alternative.
Un utilisateur au clavier ou au lecteur d'écran ne peut pas littéralement pas accéder à la moitié du projet.

- **Aucune description textuelle des graphes**, aucun ``aria-label``, aucun ``role="img"``.

- **``<h2>Date<h2>`` dans ``country.component.html``** : Sert de légende d'axe : un titre de niveau 2 est détourné pour du décoratif.

- Aucun style ``:focus-visible`` nulle part.

## 2.10 - Routage

```
{ path: 'country/:countryName', component: CountryComponent },
{ path: 'not-found', component: NotFoundComponent },
{ path: '**', component: NotFoundComponent },
```

Plusieurs problèmes retrouvés dans ce bout de code.
- Le paramètre s'appelle ``:countryName`` alors que le cahier des charges souhaite avoir ``/country/:id``.

- La route ``/not-found`` fait doublon avec le wildcard ``**`` et **n'est donc jamais utilisée** : Aucun ``navigate(['/not-found'])`` trouvé dans le code. C'est avec cette route qu'il faut rédiriger quand un pays n'existe pas. On parle d'une route préparée mais oubliée.

- ``routerLink=""`` pour le bouton retour fonctionne correctement, cependant le cahier des charges demande un ``routerLink="/"``.

## 2.11 - Les tests

Pour voir si l'application fonctionnait, la commande ``npm test`` a été lancé. Une erreur est survenue et ça compile pas l'application :
```
Error: src/app/app.component.spec.ts:26:16 - error TS2339: Property 'title' does not exist on type 'AppComponent'.

26     expect(app.title).toEqual('olympic-games-starter');
                  ~~~~~
```

``app.component.spec.ts`` est le spec généré par défaut du CLI : il va venir tester un ``title`` et un ``.content span`` qui ont été supprimés de ``AppComponent`` sans que le test soit mis à jour.

Autre problème, deux autres specs sont tout aussi cassés, mais cette fois c'est pendant le runtime : ``home.component.spec.ts`` et ``country.component.spec.ts`` : Ils déclarent leur composant sans fournir ``HttpClinet`` et ``ActivatedRoute``, ça provoque un échec d'injection.

Bien que les tests ne soient pas dans les critères d'acceptation du projet, le mieux est quand même de les faire, pour éviter les problèmes de compilation à l'avenir.

---
# Partie 2 - Architecture Cible

Avant de préparer l'architecture, il faut poser certains points important.

Actuellement, chaque composant va chercher la donnée **lui-même**, il connaît son URL, et il refait ses propres calculs. L'objectif du projet est **qu'un seul fichier sait où est la donnée, et tout le reste la reçoit.**

Une question que l'on peut se poser : "**Si un jour, le mock JSON devient une API REST, qu'est-ce qu'il va casser ?**"
> Si la réponse devient "Un seul fichier", le découpage de l'architecture sera bon.

## 1. Architecture souhaité

```
src/
├── app/
│   ├── components/ (Présentationnels et réutilisables)
│   │   ├── header/ (Pour le titre et la liste d'indicateurs)
│   │   ├── pie-chart/ (Pour les canvas pie + cycle de vie Chart.js)
│   │   ├── line-chart/ (Pour les canvas line + cycle de vie Chart.js)
│   │   └── state-panel/ (Les états loading / empty / error)
│   │
│   ├── models/ (Contrats de données, interfaces seules)
│   │   ├── olympic.model.ts
│   │   ├── participation.model.ts
│   │   ├── indicator.model.ts
│   │   └── view-state.model.ts
│   │
│   ├── pages/
│   │   ├── dashboard/ (Anciennement home/)
│   │   ├── country-detail/ (Anciennement country/)
│   │   └── not-found/
│   │
│   ├── services/ (Seul accès aux données)
│   │   └── data.service.ts
│   │
│   ├── app.component.{ts,html,scss}
│   ├── app.module.ts
│   └── app-routing.module.ts
│
├── assets/mock/olympic.json
│
├── environments/
│   ├── environment.ts
│   └── environment.prod.ts
│
├── styles/
│   ├── variables.scss (Couleurs de marque, espacements)
│   └── breakpoints.scss (Les résolutions 1200 / 768 / 767px)
└── styles.scss
```

## 2. Les quatres blocs

### 2.1 - ``models/`` - Les contrats

On parle d'interfaces pures, aucune logique, aucune dépendance Angular. En gros, c'est le vocabulaire commun du reste de l'application.


| Fichier | Contenu | Origine |
| --- | --- | --- |
| ``olympic.model.ts`` | ``Olympic { id, country, participations }`` | Fourni tel quel par la spécification technique |
| ``participation.model.ts`` | ``Participation { id, year, city, medalsCount, athleteCount }`` | Fourni tel quel par la spécification technique |
| ``indicator.model.ts`` | ``Indicator { label: string; value: number / string }`` | Déduit de "Un indicateur étant caractérisé par un libellé et une valeur"
| ``view-state.model.ts`` | ``type ViewState = 'loading' / 'loaded' / 'empty' / 'error'`` | Déduit des trois états exigés (loading, empty, error)
| ``country-medals.model.ts`` | ``CountryMedals { id: number; country: string; total: number }`` | C'est une forme dérivée qui est consommée par le pie chart

Ici, pour correspondre à la convention Angular, on rédige un fichier par concept. Les deux premiers fichiers sont copiés-collés de la spécification technique.

Pourquoi ``ViewState`` ? La spécification technique ne le demande pas. Pourtant imaginez : Trois états à gérer * 2 pages : La même cascade de booléens écrite deux fois, ajoutez-y la combinaison absurde autorisée (``loading && error`` à la fois). 

Une union de chaînes de caractères va coûter **une ligne**, ça rend les états mutuellement exclusifs par construction, et du coup ça donne des templates lisibles (``*ngIf="state === 'loading'"``).

### 2.2 - ``services/`` - La porte d'accès des données

Création nécessaire du fichier ``DataService``, qui sera **le seul fichier de l'application autorisé à injecter** ``HttpClient``.

**Responsabilités du fichier ``DataService``**
- **Charger** la donnée une fois (``environment.apiUrl``), jamais deux fois.
- **Diffuser** via un ``BehaviorSubject<Olympic[]>``, les abonnés tardifs reçoivent immédiatement la dernière valeur.
- **Exposer les agrégats** calculés une seule fois :
  - Nombre de pays,
  - Nombre d'éditions,
  - Total de médailles par pays,
  - Total d'athlètes.
- **Chercher un pays par son id**, en retournant explicitement ``Olympic | undefined``. Le type force l'appelant à traiter le cas manquant, ça réglera le crash provoqué exposé en ``Partie 1 - 2.5``.
- **Attraper les erreurs** (``catchError``) et les transformer en état ``error`` exploitable, plutôt qu'avoir une exception silencieuse.

**Surface publique visée (En réflexion)**
```
@Injectable({ providedIn: 'root' })
export class DataService {

  // Chargé si nécessaire et va renvoyer le flux des données.
  getOlympics(): Observable<Olympic[]>

  // Un pays par son id -> "undefined" si l'id n'existe pas.
  getOlympicById(id: number): Observable<Olympic | undefined>

  // Les KPIs du dashboard.
  getCountryCount(): Observable<number>
  getGameCount(): Observable<number>

  // Médailles totaux par pays, prêts pour le pie chart (avec l'id conservé pour la navigation).
  getMedalsByCountry(): Observable<CountryMedals[]>

  // Cycle de vie du chargement, utilisé par StatePanelComponent.
  getState(): Observable<ViewState>
}
```

Attention à la méthode ``getState()`` : elle décrira l'état du chargement, partagé sur toute l'application. Le cas *empty* qui est propre à la page de détails des pays n'est pas un état du service de l'application mais une conclusion réalisé lors du chargement de la page. Obtenu par ``undefined`` de ``getOlympicById()``.

### 2.3 - ``components/`` - Les présentationnels

Une règle commune est définie pour les composants. **Aucun n'injecte de service et aucun ne connaît le routeur.**

Réception par ``@Input()`` et signalement par ``@Output()``.

| Composant | Contrat | Utilisé par | Résout |
| --- | --- | --- | --- |
| ``HeaderComponent`` | ``@Input() title``, ``@Input() indicators: Indicator[]`` | Les 2 pages | En-tête dupliquée (Partie 1 - 2.8), exigence explicite du CDC |
| ``PieChartComponent`` | ``@Input() labels``, ``values``, ``description``, ``@Output() sliceClick: number`` | Dashboard | Cycle de vie Chart.js (Partie 1 - 2.7), Navigation dans le callback (Partie 1 - 2.1) |
| ``LineChartComponent`` | ``@Input() labels``, ``values``, ``seriesLabel``, ``description`` | Détails des pays | Même chose que PieChartComponent |
| ``StatePanelComponent`` | ``@Input() state: ViewState``, ``message``, ``showBackLink`` | Les 2 pages | Les états absents |

Attention : Deux points méritent d'être justifiés.

**Pourquoi des composants graphe alors qu'ils ne servent qu'une fois chacun ?** - On cherche pas le réutiliser, mais à l'isoler. Cette méthode débloque un problème signalé en ``Partie 1 - 2.7``.

Aujourd'hui ``new Chart("DashboardPieChart")`` est appelé depuis le callback HTTP, en supposant que le canvas est déjà dans le DOM. Si on enveloppe le canvas dans un ``*ngIf`` pour afficher l'état *loading*, le canvas ne va plus exister au moment de l'appel et donc le graphe va disparaître.

**Pourquoi un ``@Output() sliceClick: number`` plutôt qu'une navigation directe ?** - C'est simple, le graphe n'a pas à connaître l'existence des pays ainsi que du routeur. On lui signale "*On vient de cliquer sur l'élément 3*" donc la page doit traduire l'identifiant et navigation direct.

Cette méthode va rendre les composants génériques (avec leurs noms génériques justifiés) et c'est ça qui va permettre de les tester sans créer un fichier ``RouterTestingModule``.

### 2.4 - ``pages/`` - Les conteneurs

Elles font ce que les présentationnels ne font pas, c'est-à-dire injecter ``DataService``, lire les paramètres de route, tenir l'état ainsi que naviguer.

| Dossier | Classe | Nom CDC | Rôle |
| --- | --- | --- | --- |
| ``pages/dashboard/`` | ``DashboardComponent`` | *DashboardPage* | KPIs pays/éditions + pie chart |
| ``pages/country-detail`` | ``CountryDetailComponent`` | *CountryDetailPage* | KPIs du pays + line chart + retour |
| ``pages/not-found`` | ``NotFoundComponent`` | *Aucune information* | 404 et cible de redirection |

On a appelé les fichiers avec le suffixe ``Component`` (guide de style Angular, cohérent avec le sélecteur ``app-dashboard``).

## 3. Déplacements virtuels demandés

| Avant | Après | Nature |
| --- | --- | --- |
| ``pages/home/*`` | ``pages/dashboard/*`` | Renommé avec ``git mv`` |
| ``pages/country/*`` | ``pages/country-detail/*`` | Renommé avec ``git mv`` |
| ``pages/not-found/*`` | Inchangé | Aucune |
| ``http.get()`` dans ``home.component.ts`` | ``services/data.service.ts`` | Extraction |
| ``http.get()`` dans ``country.component.ts`` | ``services/data.service.ts`` | Suppression (doublon) |
| Calculs de totaux (x2 versions) | ``services/data.service.ts`` | Fusion |
| ``new Chart(...)`` x2 | ``components/{pie,line}-chart/`` | Extraction |
| En-tête ``.center`` + ``.split`` dans les 2 templates | ``components/header/`` | Fusion |
| ``'./assets/mock/olympic.json'`` | ``environments/environment*.ts`` | Centralisation |
| ``#0b868f`` x4 | ``styles/_variables.scss`` | Centralisation |
| Media Query ``1000px`` | ``styles/_breakpoints.scss`` | Remplacée par 1200/768/767 |
| ``console.log`` x2, ``.pipe()``, ``.map(i => i)`` | Aucun fichier / dossier | Suppression |

Actuellement, aucun fichier mal rangé est à déplacer, c'est simplement que les fichiers sont au mauvais endroit car **les dossiers ``services/``, ``models/`` et ``components/`` n'existent pas**.

## 4. Le flux de données

```
   environment.ts ──> apiUrl (Il s'agit d'un mock aujourd'hui mais d'une API demain)
          │
          ▼
  ┌───────────────────────────────┐
  │        DataService            │ @Injectable({ providedIn: 'root' })
  │  • HttpClient (uniquement là) │ - Une instance pour toute l'app
  │  • BehaviorSubject<Olympic[]> │ - Une requête diffusée à tous
  │  • agrégats + getById()       │ - Un calcul, pas deux
  └───────────────────────────────┘
          │ Observable<Olympic[]>
          ├────────────────────────────────┐
          ▼                                ▼
  ┌──────────────────┐            ┌──────────────────────┐
  │ DashboardComp.   │            │ CountryDetailComp.   │ - PAGES (conteneurs)
  │ state, KPIs      │            │ state, KPIs, :id     │ - injectent, routent
  └──────────────────┘            └──────────────────────┘
    │ @Input  ▲ @Output                    │ @Input
    ▼         │                            ▼
  ┌─────────────────────┐        ┌──────────────────────┐ - Composants
  │ HeaderComponent     │        │ HeaderComponent      │ - Présentationnels
  │ PieChartComponent   │        │ LineChartComponent   │ - @Input / @Output
  │ StatePanelComponent │        │ StatePanelComponent  │ - Zéro service
  └─────────────────────┘        └──────────────────────┘ 
```
Pour résumer ce flux de données, **la donné descend, et les événements remontent**.

## 5. Les patterns retenus

Seuls les architectures utilisés seront listés avec le(s) problème(s) qu'elles vont résoudre.

- **Singleton ``@Injectable({ providedIn: 'root' })``** : Une instance unique pour toute l'application. C'est ça qui va permettre au cache d'en être un également : Actuellement, si on navigue de *dashboard vers pays vers dashboard* à nouveau, on réalise **3 requêtes** pour le même fichier utilisé.

  Grâce à un service **Singleton** qui est porteur d'un ``BehaviorSubject`` > On passe d'une requête et deux lecteurs de cache, contre 3 requêtes avant.

  Pourquoi ce changement ? Sur un mock en local, ça ne changerait rien, mais l'objectif du projet est d'avoir une **API REST réelle** derrière, donc ici la différence se verra.

- **Container / Presentational** : La frontière entre ``pages/`` et ``components/`` n'est pas décorative, c'est une règle vérifiable : Si un fichier venant de ``components/``  possède le mot ``inject``, ``Service`` ou encore ``Router``, il est au mauvais endroit.

  C'est une correction importante, car elle bloquerait encore les tests actuellement sans.

- **Observer** : RxJS + pipe ``async``. Les pages s'abonnent via ``| async`` dans le template au lieu de passer par un ``.subscribe()`` manuel. 

  Angular est capable de gérer le désabonnement, ce qui permettra de supprimer la fuite mémoire présente sur ``paramMap`` (Partie 1 - 2.4) ainsi que la signature dépréciée ``subcribe(next, error)`` présentes dans les fichiers.

- **Facade ``DataService`` masque la provenance** : Les pages appellent ``getOlympics()`` sans savoir si derrière on possède un fichier JSON, un appel REST, un cache ou un mock de test. Danger.

- **Injection de dépendances (fournie par Angular)** : Mentionnée pour une raison : c'est elle qui va rendre le pattern Facade exploitable en test.

## 6. Préparation future du back-end

A l'avenir, l'objectif est que le projet passe par une **API REST** plutôt que de rester avec le fichier JSON ``olympic.json``.

Passage du **fichier JSON** à l'**API REST** : Ca change quoi ?

| Fichier | Changement prévu | Quoi exactement |
| --- | --- | --- |
| ``environments/environment*.ts`` | Oui | ``apiUrl`` pointera vers le back
| ``services/data.service.ts`` | Oui | Éventuellement un ``map()`` d'adaptation si le contrat diffère
| ``models/*.model.ts`` | Possiblement | Seulement si le back renvoie une autre forme
| ``pages/**`` | Non | Rien |`
| ``components/**`` | Non | Rien |
| ``app-routing.module.ts**`` | Non | Rien |

**Un fichier et demi.** À comparer avec l'état actuel, où l'URL est écrite en dur dans deux composants, le typage est ``any`` (donc aucune erreur de compilation ne signalerait un changement de contrat), et où les cas d'erreur réseau n'ont aucun endroit où s'afficher.

**Important : 4 points que le passage à une vraie API rendra non négociables, et que cette structure anticipe :**

- **La latence va devenir visible** : L'état *loading* cesse d'être décoratif. *StatePanelComponent* et *ViewState* existent pour ça.

- **Les erreurs deviennent probables** : 404, 500, timeout, hors-ligne. Le *catchError* du service alimente l'état error plutôt qu'un console.log (Partie 1 - 2.6).

- **Le contrat n'est plus garanti.** : Les interfaces de *models/* deviennent la frontière où une divergence avec le back se voit à la compilation, pas en production.

- **Le volume devient inconnu.** : On parle de 5 pays aujourd'hui, peut-être 200 demain. La palette de 6 couleurs codées en dur (Partie 1 - 2.7) doit être une palette générée, c'est le PieChartComponent qui en portera la responsabilité.