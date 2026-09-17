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
