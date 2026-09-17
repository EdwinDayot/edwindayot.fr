# La Maison des possibles — changelog de la campagne

Journal daté et vérifiable des epics de la campagne narrative, sur le modèle de [garden.md](garden.md) : chaque entrée décrit ce qui a été implémenté et ce qui a été **réellement exécuté** pour le vérifier, pas une intention. Le processus qui produit ces entrées est décrit dans [orchestration.md](orchestration.md) ; la file d'epics à venir est dans [campagne-backlog.md](campagne-backlog.md). Ce fichier documente la campagne ; le fonctionnement du jardin libre existant reste dans `garden.md`/`garden-structure.md`, que la campagne réutilise sans le remplacer.

Travail effectué sur la branche `maison-des-possibles`, jamais fusionné vers `main` avant la fin d'une phase entière (voir « Portes de phase » dans `orchestration.md`).

## Vérification locale du 17 septembre 2026 — schéma cultivar/spécimen (epic C1.1)

Premier epic de la phase 1 (Laboratoire botanique). Pose uniquement le schéma de persistance des cultivars et spécimens décrits en §4 du design — aucun croisement, aucune règle d'héritage, aucune interface, aucun rendu : c'est le périmètre des epics C1.2/C1.3/C1.4/C1.7 qui suivent.

- Nouveau `public/game/cultivars.js` : `createCultivar(s, {name, parentIds, traits})` fige un cultivar (id stable `c<n>`, traits copiés une fois pour toutes, jamais recalculés depuis `parentIds` par la suite) et l'ajoute à `s.cultivars` ; `createSpecimen({cultivarId, x, z, stage})` construit la forme d'un spécimen. Aucun des deux n'est encore appelé par une commande de jeu ni par le rendu — ce sont des fonctions pures, prêtes à être branchées par C1.3.
- `public/garden-state-lifecycle.js` : une partie neuve démarre avec `cultivars: []` et `cultivarNextId: 1`.
- `public/garden-state-validate.js` : `cultivars`/`cultivarNextId` suivent exactement le patron déjà utilisé pour `quests` (champ optionnel, validé strictement s'il est présent, complété par une valeur par défaut sinon — voir `result.quests ??= …` juste au-dessus dans le même fichier). Une sauvegarde dont `cultivarNextId` ne dépasserait pas l'id le plus élevé réellement présent est rejetée, sur le même principe que la vérification déjà faite pour `nextId`/les entités.
- Nouveau `tests/campaign-cultivars.cjs` (7 tests), ajouté à la commande `test` de `package.json` : liste vide par défaut sur une partie neuve ; un cultivar créé garde exactement le même id et les mêmes traits après un aller-retour JSON réel de sauvegarde/rechargement (`JSON.parse(JSON.stringify(...))`, pas une simple comparaison d'objet en mémoire) ; deux cultivars créés à la suite reçoivent des ids distincts et incrémentaux ; une sauvegarde v3 à laquelle on retire `cultivars`/`cultivarNextId` migre vers la valeur par défaut sans qu'aucun autre champ ne change (comparaison JSON complète avant/après) ; sept formes de `cultivars` malformé sont rejetées explicitement ; une collision d'id (`cultivarNextId` trop bas) est rejetée, sa correction acceptée.

**Résultat réellement exécuté** : `npm test` → 132 tests de règles/géométrie passent (125 existants + 7 nouveaux, zéro régression), plus les vérifications HTML/site existantes. Sortie complète :

```
ℹ tests 132
ℹ suites 0
ℹ pass 132
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Aucun test navigateur ni visuel requis pour cet epic : aucun fichier de rendu n'a été touché, `cultivars.js` n'est chargé que côté règles pour l'instant.

## Vérification locale du 17 septembre 2026 — grammaire des six attributs et compatibilité de croisement (epic C1.2)

Deuxième epic de la phase 1. Pose la grammaire de traits et la table de compatibilité que le pot (C1.3) devra utiliser pour tirer un cultivar — toujours aucun tirage aléatoire, aucune commande de jeu, aucune interface, aucun rendu : ce sont les epics C1.3/C1.4/C1.7 qui suivent.

- **Écart volontaire par rapport au backlog, justifié ici** : le mandat proposait d'étendre `public/game/data-species.js` (le catalogue réel de plantes d'intérieur du jardin libre — pilea, monstera...). Cette catalogue est sans rapport avec la flore fictive de Rivebrume nommée en §4 du design (Oreille-de-pluie, Clochette du soir...). Greffer la génétique de la campagne sur le catalogue du jardin libre aurait couplé deux modes de jeu que le design tient explicitement séparés (§15 : « Continuer mon jardin libre » / « Commencer l'histoire »). Nouveau `public/game/botany-genetics.js` à la place, avec son propre catalogue des huit espèces fondatrices déjà nommées et caractérisées par le design.
- Six axes exposés (design §4, premier prototype) : `port`, `feuilles` (forme + taille), `fleurs` (forme + groupement, ou `null`), `palette` (deux dominantes + accent), `humidite` (sec/frais/humide) et `fonction` (type + intensité, ou `null`). Chaque axe est **un seul locus** — conforme au design (« chaque locus discret vient de l'un des parents ») : `feuilles` par exemple est hérité comme un tout (forme et taille ensemble depuis le même parent), pas forme et taille indépendamment.
- Huit espèces fondatrices du tableau §4, avec leurs six traits explicites : Oreille-de-pluie (feuille en coupe, retient l'eau), Clochette du soir (fleur qui éclaire), Menthe de velours (parfum), Ronce à rubans (fibre — hors des six axes, `fonction: null`), Mousse de source (filtre), Fraise timide (fruit — hors des six axes, `fonction: null`), Fougère d'écho (absorbe le bruit), Aster des vents (aucune fonction remarquable).
- `crossCompatible(idA, idB)` : règle écologique généralisable (écart d'humidité préférée ≤ 1 sur l'échelle sec/frais/humide), pas une liste de paires ad hoc — une neuvième espèce fondatrice n'aura besoin que de son propre jeu de traits pour s'intégrer au graphe de compatibilité existant.
- `traitCombinationValid(traits)` applique la règle de compatibilité des caractères dépendants du design (§4, point 5 : « une fonction ne peut pas hériter d'un montage impossible ») : `retenir_eau` exige une feuille en coupe, `eclairer` exige une fleur présente, `filtrer` exige un sol humide, `absorber_bruit` exige une grande feuille ; `parfumer` n'a pas de contrainte structurelle.
- `enumerateReachableTraitSets(idA, idB)` énumère les 64 combinaisons possibles (2⁶, un tirage indépendant par locus) et marque chacune valide ou non — la pose de traits invalides (ex. fonction retenir_eau héritée avec une feuille ronde de l'autre parent) est donc explicitement détectée plutôt que silencieusement produite ; c'est cette liste filtrée que C1.3 tirera au sort, jamais l'ensemble brut des 64 combinaisons.

Nouveau `tests/campaign-genetics.cjs` (12 tests), ajouté à `package.json` : chaque espèce fondatrice satisfait sa propre contrainte de fonction ; les cinq fonctions sont testées individuellement (acceptée dans le bon contexte, rejetée dans le mauvais) ; la compatibilité est symétrique et réflexive ; deux espèces aux préférences d'humidité opposées (sec/humide) ne sont pas compatibles ; toute paire compatible a au moins une combinaison valide parmi ses 64 combinaisons réalisables ; un croisement connu pour produire un montage invalide (fonction d'un parent + feuille incompatible de l'autre) apparaît bien dans l'énumération et y est marqué invalide, pas silencieusement absent ; un identifiant d'espèce inconnu lève une erreur explicite plutôt que d'être traité comme compatible par défaut.

**Résultat réellement exécuté** : `npm test` → 144 tests de règles/géométrie passent (132 existants + 12 nouveaux, zéro régression), plus les vérifications HTML/site existantes.

```
ℹ tests 144
ℹ suites 0
ℹ pass 144
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Aucun test navigateur ni visuel requis : aucun fichier de rendu touché.

## Vérification locale du 17 septembre 2026 — horloge quotidienne de campagne (epic C2.1)

Premier epic de la phase 2 (Jardin d'imitation). Pose l'horloge de jeu propre à la campagne (design §3, « Horloge, repos et alimentation ») — une journée 7h-23h distincte du cycle solaire purement visuel de 1200 secondes déjà utilisé par le jardin libre (`public/game/lighting.js`, non modifié) et du rattrapage hors ligne du jardin libre (`public/game/save.js`, non modifié). Le passage de nuit lui-même (transition, résolution du pot, retour à la maison) reste hors périmètre : c'est l'epic C2.2 qui suit.

- Nouveau `public/game/campaign-clock.js` : `CampaignClock` pure, sans dépendance DOM (sur le même principe que `lighting.js`, qui documente déjà cette contrainte dans son en-tête). `activeSeconds` (24 minutes réelles par défaut, nommé, réglable) fixe la vitesse de l'horloge ; `DAY_SECONDS` dérive de `DAY_START_HOUR`/`DAY_END_HOUR` (7h/23h).
- `tick(nowWallMs)` avance l'horloge de jeu à partir du temps réel écoulé depuis le tick précédent. Trois cas : pause active → 0 seconde créditée ; écart réel supérieur à `SUSPEND_GAP_MS` (5 s, un onglet masqué/fermé) → 0 seconde créditée, l'écart est **jeté**, jamais rattrapé au tick suivant ; sinon → avance proportionnelle au taux courant, plafonnée à 23h.
- `pause()`/`resume(nowWallMs)`/`isPaused()` : `resume` réarme seulement le point de référence, ne crédite jamais l'intervalle passé en pause.
- `isEveningReminderTime()` (vrai entre 22h30 et 23h) et `isNightfall()` (vrai à 23h et au-delà) : fonctions pures, l'affichage réel du rappel viendra avec l'interface (epics ultérieurs).
- Nouveau `tests/campaign-clock.cjs` (8 tests), ajouté à `package.json` : une journée complète s'écoule en ~24 minutes réelles à 1 seconde de tolérance près, ticks 1 s pendant `DEFAULT_ACTIVE_SECONDS` pas ; l'horloge ne dépasse jamais 23h même si on continue de la faire avancer ; un `activeSeconds` personnalisé change le taux proportionnellement ; une pause gèle l'horloge sur un grand écart réel puis une reprise ne crédite pas l'intervalle passé en pause ; un grand écart réel entre deux ticks (onglet masqué) est traité comme une suspension et jeté, avec reprise normale ensuite ; le seuil de suspension est testé pile à la limite (créditée) et juste au-dessus (jetée) ; le rappel de 22h30 ne se déclenche ni avant ni après 23h ; une horloge neuve démarre à 7h non figée, et son tout premier `tick()` ne fait qu'établir le point de référence (0 seconde créditée).

**Résultat réellement exécuté** : `npm test` → 152 tests de règles/géométrie passent (144 existants + 8 nouveaux, zéro régression), plus les vérifications HTML/site existantes.

```
ℹ tests 152
ℹ suites 0
ℹ pass 152
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Aucun test navigateur ni visuel requis : aucun fichier de rendu touché ; `campaign-clock.js` n'est pas encore chargé par `index.html`, il n'est utilisé que par ses tests Node pour l'instant (le câblage à l'interface et au rendu viendra avec les epics qui introduisent les écrans concernés).
