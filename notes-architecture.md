# Notes d'architecture

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