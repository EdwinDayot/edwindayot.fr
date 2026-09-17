# Orchestration de « La Maison des possibles »

Ce document explique **comment** [game-design.md](game-design.md) sera construit par des agents LLM, sans intervention humaine entre les sessions. Il ne redécrit pas le jeu ; il décrit le processus de fabrication, epic par epic. Le carnet de travail concret (la file d'epics, leur état) vit dans [campagne-backlog.md](campagne-backlog.md). Ce qu'il faut en plus pour que cette routine s'enchaîne seule, sans qu'un humain relance une session, sur toute la durée de la campagne, est décrit séparément dans [execution-continue.md](execution-continue.md).

## Principe directeur : continuer la discipline déjà éprouvée, pas en inventer une nouvelle

Le prototype existant (voir [garden.md](garden.md)) a déjà produit plus de vingt epics vérifiés sans supervision humaine continue, avec un taux de régression nul documenté. Cette discipline fonctionne déjà ; l'orchestration de la campagne la reprend telle quelle plutôt que d'introduire un nouveau processus :

- **Epics petits et additifs.** Un epic ajoute une capacité vérifiable en une session, jamais une refonte simultanée de plusieurs systèmes.
- **Généraliser plutôt que spécialiser.** Un nouveau geste de Rainelle, un nouveau visiteur, une nouvelle plante doivent s'exprimer en données (`data-*.js`) au-dessus de primitives génériques existantes (`job`/`buffer`/`sow`/`aura`/`dispense` dans `automation.js`, rôles dans `data-roles.js`), jamais en `if` spécifique empilé dans la boucle de simulation.
- **Règles avant rendu.** La simulation (état, transitions, réservations, sauvegarde) doit être prouvée par des tests Node sans WebGL avant que l'habillage Three.js ne soit construit dessus. C'est déjà la séparation documentée dans [garden-structure.md](garden-structure.md#architecture) ; la campagne l'étend, ne la contourne pas.
- **Rien ne casse une sauvegarde existante.** Tout nouveau champ persistant suit le patron « valeur par défaut » ou un bump `landscape`/`campaign` explicite avec migration testée, jamais une hypothèse silencieuse sur une sauvegarde ancienne.
- **Vérifié veut dire exécuté, pas plausible.** Chaque epic clos rapporte ce qui a été réellement exécuté (commande de test, résultat, capture le cas échéant), jamais une affirmation de fonctionnement non observée — c'est le format déjà utilisé par chaque entrée datée de `garden.md`.
- **Le changelog est la mémoire du projet, pas la mémoire de session.** Comme aucun humain ne supervise en continu, le fichier de suivi (`campagne-backlog.md`) et le changelog sont la seule source de vérité entre deux sessions d'agent. Un agent qui reprend le travail doit pouvoir reconstituer l'état complet en lisant ces fichiers, jamais en supposant un contexte de conversation antérieur.

## Pourquoi une branche dédiée

`public/` sert un site déployé (portfolio + jardin libre existant). La campagne est une transformation profonde et longue (section 15 du design : sept étapes, plusieurs dizaines d'heures agent cumulées). Le travail se fait sur la branche `maison-des-possibles`, avec un commit par epic vérifié. La fusion vers `main` se fait par **jalon de phase** (fin d'étape 1 à 7 du plan de réalisation), jamais à chaque epic pris isolément, pour que chaque tranche fusionnée soit cohérente et que son historique reste lisible. Comme aucun pipeline n'est connecté à `main` (aucun workflow CI, aucun déploiement automatique dans ce dépôt), cette fusion de phase peut faire partie de l'exécution automatisée elle-même une fois ses scénarios de validation vérifiés — voir [execution-continue.md](execution-continue.md) pour la politique exacte. Ce qui reste hors de ce processus, sans exception : pousser vers un service de déploiement ou publier le site servi.

## Rôles

Ce ne sont pas des processus permanents mais des **postures de prompt** que l'orchestrateur (la session qui pilote le backlog) endosse lui-même ou délègue à un fork/sous-agent selon la taille du travail. Un même epic peut mobiliser plusieurs rôles en séquence.

| Rôle | Fait quoi | Porté par |
| --- | --- | --- |
| **Cartographe** | Traduit une section de `game-design.md` en epics de la taille de ceux déjà livrés (voir le gabarit dans `campagne-backlog.md`) ; maintient `campagne-backlog.md` à jour, tranche par tranche, sans découper toute la campagne d'un coup. | L'orchestrateur, en tête de chaque phase. |
| **Artisan moteur** | Implémente la simulation pure d'un epic (schéma de données, transitions, réservations, migration de sauvegarde) et ses tests Node (`tests/campaign-*.cjs`), sans toucher au rendu. | Fork ou sous-agent dédié par epic, avec pointeurs précis vers les fichiers concernés. |
| **Artisan rendu** | Une fois la règle prouvée par ses tests, construit son habillage Three.js (géométrie, matériaux, instanciation, budget d'ombre/triangles), en suivant [direction-artistique.md](direction-artistique.md) (palette et matériaux déjà en usage, pas de teinte inventée hors guide) et en relisant sa propre capture (outil Read sur l'image, pas seulement le code) avant de conclure. N'intervient jamais avant l'Artisan moteur sur le même epic. | Fork ou sous-agent dédié. |
| **Scénariste** | Écrit dialogues, texte de quête, voix de personnage, en respectant la grammaire narrative des sections 9 à 11 (verbes recevoir/inventer/transmettre, mise en scène de la culpabilité sans accusation fabriquée). Produit des données (`data-quests.js`, fichiers de dialogue), jamais de prose hors jeu. | Fork ou sous-agent dédié, en français, avec le design doc en contexte. |
| **Vérificateur** | Exécute la suite complète (`npm test`, `npm run test:browser`, `npm run test:visual` quand le rendu est concerné), ajoute les scénarios de la section 16 du design comme tests de non-régression, lance `/code-review` sur le diff. Bloque le passage au commit si un test échoue ou si un budget de performance est dépassé. | L'orchestrateur ou un sous-agent séparé de celui qui a codé, pour éviter l'auto-complaisance. |
| **Chroniqueur** | Met à jour `campagne-backlog.md` (état de l'epic), ajoute une entrée datée et vérifiable dans le changelog concerné, effectue le commit. | L'orchestrateur, toujours en dernière étape, jamais délégué. |

## La routine, epic par epic

1. **Choisir** le prochain epic `todo` dans `campagne-backlog.md` dont les dépendances sont `done`. Ne jamais sauter une dépendance pour avancer plus vite : la section 8 du design l'interdit explicitement au niveau narratif (« aucune quête de pelle ne demande une graine enterrée derrière la pelle ») et cela vaut aussi pour l'ordre d'implémentation.
2. **Rédiger le mandat** : critère de sortie (repris ou affiné depuis le backlog), fichiers probablement concernés, conventions à respecter (renvoi vers `garden-structure.md`), rappel explicite « pas de régression sur l'existant ».
3. **Déléguer l'implémentation** (Artisan moteur puis, si nécessaire, Artisan rendu ou Scénariste) via un fork ou un sous-agent portant ce mandat complet — un agent frais ne connaît pas cette conversation.
4. **Vérifier** : suite de tests existante + tests neufs de l'epic + `/code-review` sur le diff. Un echec renvoie à l'étape 3 avec le détail de l'échec, jusqu'à deux reprises ; au-delà, l'epic passe à l'état `bloqué` avec la raison précise, jamais abandonné silencieusement ni contourné en réduisant discrètement le critère de sortie.
5. **Consigner** : commit dédié sur `maison-des-possibles`, entrée de changelog vérifiable, mise à jour du backlog.
6. **Reprendre** à l'étape 1.

**Le rapport d'un agent délégué n'est jamais la preuve.** Un fork ou sous-agent peut renvoyer un résumé de complétion plausible sans avoir rien fait (observé une fois : un fork a terminé en quelques secondes, zéro appel d'outil, et a paraphrasé un message précédent au lieu d'exécuter son mandat). Avant de consigner un epic comme fait, vérifier indépendamment l'état réel du dépôt (`git log`, `git show --stat`, présence des fichiers annoncés, `npm test` relancé soi-même) — jamais seulement la prose du rapport reçu.

## Portes de phase (reprises de la section 15 du design)

Chaque phase du plan de réalisation devient un jalon de fusion, pas seulement un regroupement thématique. Le détail epic par epic est dans `campagne-backlog.md` ; voici le critère de sortie de chaque porte, tel que fixé par le design :

1. **Laboratoire botanique** — un joueur reconnaît des caractères parentaux, cible un besoin donné et retrouve exactement son cultivar après rechargement.
2. **Jardin d'imitation** — un joueur enseigne un geste à une Rainelle sans guide externe ; une chaîne fonctionne, sature proprement puis redémarre.
3. **Tranche verticale** — habiter, croiser, organiser, rencontrer fonctionnent ensemble en une courte partie sauvegardable.
4. **Première version jouable (actes I à III)** — l'arc « retour puis ouverture au village » se conclut sans dépendre de contenu annoncé mais absent.
5. **Prototype du retournement** — veilleuses, prélèvement d'eau, repos, mémoire factuelle et une scène de culpabilité/réparation sont compris par un joueur, avec une partie attentive distincte d'une partie intensive.
6. **Campagne complète (actes IV à VI)** — tous les parcours narratifs prévus concluent sans imposer l'exploitation ni inventer une faute.
7. **Profondeur et finition** — saisons, extensions, catalogue décoratif, tactile et performances tenues sur les appareils de référence.

Aucune phase ne fusionne vers `main` tant que ses scénarios de validation (section 16 du design, repris en tests automatisés) ne passent pas — voir [execution-continue.md](execution-continue.md) pour qui déclenche cette fusion sous exécution continue.

## Continuité entre sessions

Un agent ne dispose que du contexte de sa propre session. La continuité vient exclusivement de trois fichiers versionnés, jamais de la mémoire d'une conversation :

- `docs/campagne-backlog.md` — la file d'epics et leur état (`todo`/`en cours`/`bloqué`/`fait`) : **la** source de vérité sur « où en est-on ».
- `docs/campagne.md` (créé au premier epic livré) — le changelog daté et vérifiable de la campagne, sur le modèle de `garden.md`.
- L'historique git de la branche `maison-des-possibles` — un commit par epic, message explicite.

Toute reprise de travail (nouvelle session, `/loop`, tâche planifiée) suit la même instruction : lire `campagne-backlog.md`, exécuter la routine ci-dessus sur le prochain epic disponible, s'arrêter et documenter si un choix engage une décision hors du mandat de conception déjà tranchée par `game-design.md` (par exemple une divergence de nom commercial, une décision d'accessibilité non couverte, un déploiement public).

## Ce qui reste une décision humaine explicite

Cette orchestration couvre l'implémentation, pas la publication. Restent hors de son périmètre, à ne jamais déclencher automatiquement (voir [execution-continue.md](execution-continue.md) pour la liste complète et son raisonnement) :
- Créer et autoriser l'infrastructure d'exécution continue elle-même (dépôt distant, routine planifiée).
- Pousser vers un service de déploiement, ou publier le site servi.
- Renommer définitivement le jeu ou les Rainelles (le design les qualifie lui-même de noms de travail).
- Toute décision qui changerait un choix déjà « confirmé par l'utilisateur » dans le design (la culpabilisation de fin de campagne, Alma vivante, etc.) — ces choix sont des données d'entrée, pas des variables d'orchestration.
