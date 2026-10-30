# Architecture - Télésport

Documentation de l'architecture front-end du projet "Jeux Olympiques".
Destinée à une personne qui arrive sur le projet et qui doit pouvoir y
contribuer sans avoir à lire tout le code.

- **Stack** : Angular 18 (architecture NgModule), TypeScript 5.4, SCSS, Chart.js 4
- **Deux pages** : Un dashboard et une page de détail par pays
- **Source de données** : Un fichier JSON servi depuis les assets, destiné à être
remplacé par une API REST à l'avenir

> Le *pourquoi* de chaque décision : L'audit du code d'origine et les arbitrages de conception. Tout est consigné dans `notes-architecture.md`.
> Le document actuel, lui, décrit le *quoi* : ce qui existe aujourd'hui et comment s'en servir.

---

## 1. Démarrer

```bash
npm install
npm start # http://localhost:4200
npm test # 31 tests
npm run build # build de production dans dist/
```

---

## 2. Arborescence

```
src/
├── app/
│   ├── components/ (Composants présentationnels, réutilisables)
│   │   ├── header/ (Titre + liste d'indicateurs)
│   │   ├── pie-chart/ (Graphe circulaire + alternative clavier)
│   │   ├── line-chart/ (Graphe en ligne + équivalent tabulaire)
│   │   └── state-panel/ (Chargement / vide / erreur)
│   │
│   ├── models/ (Interfaces TypeScript, sans logique)
│   │   ├── olympic.model.ts
│   │   ├── participation.model.ts
│   │   ├── indicator.model.ts
│   │   ├── country-medals.model.ts
│   │   └── view-state.model.ts
│   │
│   ├── pages/ (Composants conteneurs, cibles des routes)
│   │   ├── dashboard/
│   │   ├── country-detail/
│   │   └── not-found/
│   │
│   ├── services/ (Seul accès aux données)
│   │   └── data.service.ts
│   │
│   ├── app.component.{ts,html} (Coquille : uniquement le <router-outlet>)
│   ├── app.module.ts (Déclarations et providers)
│   └── app-routing.module.ts (Routes)
│
├── assets/mock/olympic.json (Données simulées)
├── environments/ (apiUrl par environnement)
├── styles/ (_variables.scss, _breakpoints.scss)
└── styles.scss (Styles globaux (importe les partials))
```

Quatre dossiers sous `app/`, volontairement à plat : à l'échelle de deux pages, un niveau `core/` ou `shared/` supplémentaire n'apporterait aucune séparation réelle.

---

## 3. Le principe directeur

> **Une seule porte d'entrée pour les données, et des composants qui ignorent
> d'où elles viennent.**

C'est la règle dont tout le reste découle. En pratique, elle se vérifie
mécaniquement :

```bash
grep -rl "from '@angular/common/http'" src/app --include="*.ts" | grep -v spec
# -> src/app/services/data.service.ts (le seul à injecter HttpClient)
# -> src/app/app.module.ts (uniquement provideHttpClient())
```

Toute autre ligne dans cette sortie signale une violation de la règle.

Deux conventions complètent cette règle :

| Dossier | Peut injecter un service | Connaît le routeur | Reçoit ses données par |
|---|---|---|---|
| `pages/` | oui | oui | Injection du `DataService` |
| `components/` | **non** | **non** | `@Input()` uniquement |

Un fichier de `components/` qui contient `Service`, `inject` ou `Router` est au
mauvais endroit.

---

## 4. Les modèles

Interfaces pures, sans dépendance Angular. Elles constituent le vocabulaire commun
du projet.

| Interface | Champs | Rôle |
|---|---|---|
| `Participation` | `id`, `year`, `city`, `medalsCount`, `athleteCount` | Une édition des JO pour un pays |
| `Olympic` | `id`, `country`, `participations[]` | Un pays et son historique |
| `Indicator` | `label`, `value` | Un indicateur affiché par le header |
| `CountryMedals` | `id`, `country`, `total` | Forme dérivée pour le pie chart |
| `ViewState` | `'loading' \| 'loaded' \| 'empty' \| 'error'` | État d'affichage d'une page |

`Olympic` et `Participation` décrivent le contrat de la source de données et sont
repris mot pour mot du cahier des charges. Les trois autres sont internes.

`ViewState` est une union de chaînes plutôt qu'une série de booléens : les états
deviennent mutuellement exclusifs par construction, et les gabarits restent lisibles
(`*ngIf="vm.state === 'loading'"`).

---

## 5. Le service

`DataService` dans le fichier `src/app/services/data.service.ts` fourni en singleton
(`@Injectable({ providedIn: 'root' })`), soit **une instance pour toute
l'application**.

### Responsabilités

1. **Charger** les données une seule fois, depuis `environment.apiUrl`.
2. **Diffuser** via un `BehaviorSubject` : les abonnés tardifs reçoivent
   immédiatement la dernière valeur connue, sans nouvelle requête.
3. **Calculer les agrégats** en un seul endroit (totaux, décomptes).
4. **Chercher un pays** en retournant explicitement `undefined` s'il est inconnu.
5. **Capturer les erreurs** et les traduire en état exploitable par l'interface.

### API publique

| Méthode | Retour | Usage |
|---|---|---|
| `getOlympics()` | `Observable<Olympic[]>` | Flux des données brutes ; déclenche le chargement au premier appel |
| `getState()` | `Observable<ViewState>` | Cycle de vie du chargement |
| `getOlympicById(id)` | `Observable<Olympic \| undefined>` | Un pays ; `undefined` si l'id est inconnu |
| `getCountryCount()` | `Observable<number>` | Nombre de pays |
| `getGameCount()` | `Observable<number>` | Nombre d'éditions distinctes |
| `getMedalsByCountry()` | `Observable<CountryMedals[]>` | Totaux par pays, triés alphabétiquement |
| `sumMedals(olympic)` | `number` | Total de médailles d'un pays |
| `sumAthletes(olympic)` | `number` | Total d'athlètes d'un pays |

Le chargement est **paresseux et idempotent** : il part au premier appel de
`getOlympics()` ou `getState()`, et une garde interne empêche toute requête
supplémentaire. Trois composants qui consomment le service ne déclenchent qu'un
seul appel réseau.

---

## 6. Les composants présentationnels

Aucun n'injecte de service. Ils reçoivent par `@Input()`, signalent par `@Output()`,
et se testent sans aucun mock.

| Composant | Sélecteur | Entrées | Sorties |
|---|---|---|---|
| `HeaderComponent` | `app-header` | `title`, `indicators` | Aucune |
| `PieChartComponent` | `app-pie-chart` | `labels`, `values`, `description` | `sliceClick: number` |
| `LineChartComponent` | `app-line-chart` | `labels`, `values`, `seriesLabel`, `axisLabel`, `description` | Aucune |
| `StatePanelComponent` | `app-state-panel` | `state`, `message`, `showBackLink` | Aucune |

### Points à connaître

**Les graphes sont génériques** : Ils reçoivent des libellés et des valeurs, et ne
savent rien des pays. `PieChartComponent` émet l'**index** de la part cliquée ; c'est
la page qui le traduit en identifiant et qui navigue. C'est ce qui permet de les
réutiliser et de les tester sans routeur.

**Ils encapsulent le cycle de vie de Chart.js** : Le canvas est obtenu par
`@ViewChild` (jamais par identifiant global), le graphe est créé dans
`ngAfterViewInit`, mis à jour dans `ngOnChanges`, et **détruit dans `ngOnDestroy`**.
Sans cette destruction, chaque navigation laisserait une instance Chart.js et ses
écouteurs attachés à un canvas retiré du DOM.

**La palette du pie chart est cyclique** : (`index % PALETTE.length`) : une part aura
toujours une couleur, quel que soit le nombre de pays renvoyés par la source.

**Chaque graphe porte son équivalent accessible.** Un canvas n'est ni restituable par
un lecteur d'écran, ni atteignable au clavier :

- le pie chart expose une **liste de boutons** masquée visuellement mais présente dans
  l'ordre de tabulation, qui réapparaît au focus et émet le même `sliceClick`, c'est
  la seule façon d'ouvrir une page pays au clavier.
- le line chart expose un **tableau** masqué visuellement, enveloppé dans un `<div>`
  (`width: 1px` est sans effet sur un `<table>`, qui ne descend jamais sous la largeur
  minimale de son contenu).

**`StatePanelComponent` ne rend rien** quand l'état vaut `'loaded'`. Un seul composant
piloté par un état, plutôt que trois composants qui s'excluent mutuellement.

---

## 7. Les pages conteneurs

| Page | Route | Rôle |
|---|---|---|
| `DashboardComponent` | `/` | KPIs globaux + pie chart cliquable |
| `CountryDetailComponent` | `/country/:id` | KPIs du pays + courbe d'évolution + retour |
| `NotFoundComponent` | `**` | 404 |

Chaque page expose **un seul flux**, `vm$`, consommé par le gabarit via le pipe
`async` qui gère le désabonnement. Il n'y a aucun `.subscribe()` manuel dans
`pages/`.

Ce `vm$` est un *view-model* : un objet unique portant l'état, les libellés et les
valeurs prêts à l'affichage. Le gabarit n'a qu'un `| async` et aucun calcul.

```
DashboardComponent | combineLatest({ state, medals, countryCount, gameCount })
CountryDetailComponent | paramMap -> switchMap -> combineLatest({ state, olympic })
```

La page détail compose la route et les données par `switchMap`, et non par deux
abonnements côte à côte : la dépendance est explicite, et la page se met à jour si
l'identifiant change sans que le composant soit détruit.

---

## 8. La gestion des états

Quatre états, une seule source pour chacun.

| État | Déclencheur | Affichage |
|---|---|---|
| `loading` | requête en cours | squelettes gris |
| `loaded` | données reçues, non vides | la page |
| `empty` | source vide, **ou** identifiant inconnu | « Aucune donnée » / « Ce pays n'existe pas. » |
| `error` | requête en échec | message + lien de retour |

Nuance importante : `getState()` décrit **le chargement**, pas le contenu d'une page.
Le cas « cet identifiant n'existe pas » n'est pas un état du service : c'est une
conclusion que `CountryDetailComponent` tire du `undefined` renvoyé par
`getOlympicById()`. Les deux se combinent dans le view-model de la page.

C'est ce qui remplace le plantage du code d'origine, où un identifiant inconnu
produisait une page blanche et une erreur en console.

---

## 9. Les styles

| Fichier | Contenu |
|---|---|
| `styles/_variables.scss` | couleurs de marque, palette des graphes, espacements, rayons |
| `styles/_breakpoints.scss` | points de rupture et mixins `below-desktop`, `tablet-only`, `mobile-only` |
| `styles.scss` | remise à zéro, typographie, focus visible, conteneur `.page`, utilitaire `.visually-hidden` |

Les partials sont accessibles depuis n'importe quel composant par `@use 'variables'`,
grâce à `stylePreprocessorOptions.includePaths` déclaré dans `angular.json`. Aucune
couleur ni aucun point de rupture n'est écrit en dur dans un composant.

Trois paliers, conformes au cahier des charges : desktop ≥ 1200 px, tablette
768–1199 px, mobile ≤ 767 px.

---

## 10. Flux de données

```
   environment.apiUrl
          │
          ▼
  ┌─────────────────────────────────┐
  │          DataService            │   singleton
  │  • seul détenteur de HttpClient │   -> Une seule requête
  │  • BehaviorSubject<Olympic[]>   │   -> diffusée à tous
  │  • agrégats + getOlympicById()  │   -> Un seul calcul
  └─────────────────────────────────┘
          │ Observable
          ├──────────────────────────────┐
          ▼                              ▼
  ┌──────────────────┐          ┌──────────────────────┐
  │ DashboardComp.   │          │ CountryDetailComp.   │ Pages
  │ vm$, navigation  │          │ vm$, :id             │ injectent, routent
  └──────────────────┘          └──────────────────────┘
    │ @Input  ▲ @Output                 │ @Input
    ▼         │                         ▼
  ┌─────────────────────┐      ┌──────────────────────┐
  │ HeaderComponent     │      │ HeaderComponent      │ Composants
  │ PieChartComponent   │      │ LineChartComponent   │ @Input / @Output
  │ StatePanelComponent │      │ StatePanelComponent  │ aucun service
  └─────────────────────┘      └──────────────────────┘
```

La donnée descend, les événements remontent. Aucune flèche latérale entre composants,
aucun accès au réseau depuis le bas.

---

## 11. Patterns employés

**Singleton** : `providedIn: 'root'`. Une instance, donc un cache réel : naviguer
dashboard → pays → dashboard ne déclenche qu'une requête au lieu de trois.

**Container / Presentational** : la frontière `pages/` ↔ `components/`. Les
présentationnels se testent sans `TestBed` complexe, sans `HttpClient` ni
`ActivatedRoute` à fournir.

**Observer** : RxJS et le pipe `async`. Angular gère le désabonnement, ce qui écarte
toute fuite mémoire sur les flux infinis comme `paramMap`.

**Facade** : `DataService` masque la provenance. Les pages appellent `getOlympics()`
sans savoir s'il y a derrière un fichier JSON, une API REST ou un faux service de
test.

---

## 12. Préparer la connexion à une API

C'est le critère qui a guidé le découpage : **qu'est-ce qui casse le jour où le mock
devient une API REST ?**

| Fichier | Change ? | Quoi |
|---|---|---|
| `environments/environment*.ts` | oui | `apiUrl` pointe vers le back |
| `services/data.service.ts` | peut-être | un `map()` d'adaptation si le contrat diffère |
| `models/*.model.ts` | si le back renvoie une autre forme | Rien |
| `pages/**` | **non** | Rien |
| `components/**` | **non** | Rien |
| `app-routing.module.ts` | **non** | Rien |

**Un fichier et demi.**

Quatre réalités que l'API rendra incontournables, et que cette structure anticipe
déjà :

- **La latence devient visible** : l'état `loading` cesse d'être décoratif.
- **Les erreurs deviennent probables** (404, 500, timeout, hors-ligne) : l'état
  `error` est déjà câblé jusqu'à l'affichage.
- **Le contrat n'est plus garanti** : les interfaces de `models/` sont la frontière
  où une divergence avec le back apparaît à la compilation.
- **Le volume devient inconnu** : d'où la palette cyclique et l'absence de toute
  hypothèse sur le nombre de pays.

---

## 13. Ce qu'il faut savoir avant de modifier

**`getOlympics()` émet un tableau vide avant l'arrivée des données** : C'est la valeur
initiale du `BehaviorSubject`. Les pages n'en souffrent pas parce qu'elles
conditionnent leur affichage à `getState()` — tout nouveau consommateur doit faire de
même, sous peine d'afficher « aucune donnée » pendant le chargement.

**Le tri est alphabétique et doit le rester** : `getMedalsByCountry()` trie par nom de
pays ; la page détail trie les participations par année. Le cahier des charges laisse
le tri libre mais exige qu'il soit cohérent entre les deux pages.

**`medalsCount` fait foi** : Le cahier des charges mentionne une règle
`Totals = gold + silver + bronze`, inapplicable : le jeu de données ne contient que
`medalsCount`, jamais le détail par métal. Écart assumé et documenté.

**Les KPIs reflètent les données, pas la maquette** : La maquette affiche 10 pays et
10 éditions, le mock en contient 5 et 3. L'affichage montrera donc 5 et 3.

---

## 14. Tests

31 tests, exécutés par `npm test`.

| Cible | Couvre |
|---|---|
| `DataService` | requête unique pour plusieurs consommateurs, agrégats, tri, identifiant inconnu, les trois états |
| Composants | rendu des entrées, émission des sorties, équivalents accessibles |
| Pages | création, affichage du panneau d'état avant arrivée des données |

Pour un environnement sans interface graphique :
`npm test -- --browsers=ChromeHeadlessNoSandbox`.

---