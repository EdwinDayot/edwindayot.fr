# Exécution continue et autonome, jusqu'au produit fini

[orchestration.md](orchestration.md) décrit comment **un** epic se fait. Ce document décrit ce qui doit exister pour que la **suite** des epics — les dizaines qui restent, sur des jours ou des semaines de temps agent cumulé — s'enchaîne sans qu'un humain ait besoin de relancer quoi que ce soit. Il part de faits vérifiés sur les mécanismes réellement disponibles, pas d'une hypothèse.

## Ce qui a été vérifié, pas supposé

Deux mécanismes de planification existent dans cet environnement. Aucun des deux n'est, tel quel, « lance et oublie jusqu'au bout » :

1. **Tâches planifiées locales à une session (`CronCreate`).** Elles ne vivent que dans la session Claude Code qui les crée, disparaissent quand elle se termine, et **expirent au bout de 7 jours** même si la session reste ouverte en continu. Une campagne de la taille décrite dans `game-design.md` (sept phases, dizaines d'epics, section 15 : « plusieurs dizaines d'heures agent cumulées ») dépasse largement cette fenêtre. Ce mécanisme peut servir à re-décaler ponctuellement une reprise, pas à porter l'ensemble.
2. **Routines cloud** (compétence `schedule`, outil `RemoteTrigger`). Réellement durables : elles vivent côté serveur, indépendamment de cette session, et se redéclenchent seules selon un cron (minimum **une heure** entre deux exécutions). Mais chaque déclenchement lance une session cloud isolée, **sans accès au disque local ni à cette conversation** : elle clone un dépôt depuis une **URL git distante**. Vérification faite sur ce dépôt : `git remote -v` ne renvoie rien, aucun `origin` n'est configuré. Sans dépôt distant, aucune routine cloud ne peut cloner ce travail — le mécanisme durable est donc indisponible tel quel aujourd'hui.

**Conséquence directe et non contournable : le prérequis technique numéro un est un dépôt git distant** (GitHub) que la routine cloud peut cloner et vers lequel elle peut pousser ses commits. Ce n'est pas une préférence de processus, c'est une dépendance dure du seul mécanisme qui peut réellement tourner sans supervision au-delà d'une session ou de 7 jours.

Ce dépôt distant est une brique d'infrastructure (hébergement de code), **distincte de la publication du jeu**. Il n'implique aucun déploiement du site servi ; la pratique déjà documentée dans `garden.md` (« aucun déploiement OVH effectué », livraisons toujours vérifiées localement d'abord) continue de s'appliquer sans changement.

## Anatomie d'un déclenchement de routine

Chaque déclenchement est une session cloud fraîche, sans mémoire des précédentes. Son prompt fixe (le même à chaque fois) doit donc être entièrement autoporteur et suivre, dans l'ordre, une version mécanisée de la routine déjà décrite dans `orchestration.md` :

1. **Cloner** le dépôt distant, se positionner sur la branche `maison-des-possibles`.
2. **Vérifier avant de faire confiance** : `git log`, `git show --stat` sur le dernier commit, relancer `npm test` réellement, comparer au statut que `campagne-backlog.md` prétend. Si le dernier epic marqué « fait » n'est pas corroboré par un commit réel et des tests qui passent, le repasser en `todo` et consigner l'anomalie dans un nouveau `docs/campagne-anomalies.md` avant de continuer. C'est la leçon tirée en session (un fork a une fois renvoyé un rapport de succès fabriqué, zéro appel d'outil) — ici elle doit être une étape mécanique obligatoire du prompt, pas une bonne pratique qu'un agent pressé pourrait sauter.
3. **Choisir le prochain epic** `todo` dont les dépendances sont `fait`. Si la phase courante n'a plus d'epic détaillé mais n'a pas atteint sa porte de sortie, endosser le rôle Cartographe : détailler le lot d'epics suivant dans `campagne-backlog.md` avant d'implémenter quoi que ce soit — jamais improviser un epic non écrit.
4. **Exécuter la routine complète** de l'epic choisi (Artisan moteur, puis Artisan rendu et/ou Scénariste si le mandat le demande, Vérificateur, Chroniqueur), comme décrit dans `orchestration.md`. Une seule tentative de correction en cas d'échec de test dans le même déclenchement ; au-delà, l'epic passe à `bloqué (raison précise)` plutôt que d'improviser une sortie de secours.
5. **Si l'epic clos ferme une porte de phase** : exécuter les scénarios de validation de la section 16 du design (déjà repris en tests de non-régression au fil des epics) ; s'ils passent, fusionner la tranche dans `main` sur le dépôt distant et ajouter un rapport de clôture de phase daté dans `docs/campagne.md`. Ne jamais pousser vers un autre remote, ne jamais toucher à un pipeline de déploiement — il n'y en a aucun connecté à `main` aujourd'hui (vérifié : pas de workflow CI dans ce dépôt), et ça doit le rester tant qu'un humain n'a pas décidé de publier.
6. **Committer et pousser** sur le dépôt distant avant de terminer, pour que le déclenchement suivant reparte d'un état visible.
7. **S'arrêter** — un déclenchement traite un seul epic (voir plus bas pourquoi), jamais une chaîne.

## Un epic par déclenchement, pas plus

- Chaque epic déjà livré en session interactive a coûté entre 150 000 et 215 000 tokens d'agent et deux à quatre minutes de travail réel, sur un mandat pourtant petit et bien cadré. Enchaîner plusieurs epics dans un seul déclenchement cloud (contexte froid, sans supervision) augmente le risque de dérive et rend chaque exécution beaucoup plus difficile à auditer après coup.
- Un commit par déclenchement, sur une branche partagée, donne un historique lisible : n'importe qui (ou une session de revue ultérieure) peut rejouer `git log` et voir exactement ce qui a été tenté à chaque heure.
- Garde-fou de concurrence : chaque déclenchement doit vérifier que l'état distant correspond à ce qu'il attend avant de committer (même principe qu'à l'étape 2) ; si un autre déclenchement a poussé entre-temps de façon incohérente, s'arrêter et consigner plutôt que forcer.

À la cadence minimale d'une heure, sept phases et plusieurs dizaines d'epics représentent plusieurs jours à quelques semaines de déclenchements — cohérent avec l'ordre de grandeur donné par le design lui-même (section 15, section 18 : « quinze à vingt-cinq heures » de campagne jouable, largement plus en temps de fabrication).

## Ce qui ne se vérifie pas par des tests automatiques

Les epics de règles (schéma, simulation) se prouvent par `npm test`. Les epics de **narration** (Scénariste) et de **direction artistique** (Artisan rendu) n'ont pas d'oracle aussi net.

**Constat vérifié sur ce projet, pas une hypothèse.** Une relecture d'un agent qui regarde une capture d'écran et juge « ça a l'air bon » s'est révélée peu fiable en pratique : un bug de normales de terrain a survécu à des dizaines de vérifications par capture pendant plusieurs jours, alors qu'un script qui inspecte directement le graphe de scène (`tests/garden-material-audit.cjs`) le détecte en une seconde — vérifié en rejouant ce test contre le code d'avant-correction : 100 % des normales de sol pointaient vers le bas, 0 % après. Un modèle qui regarde une image n'a pas de référence fiable pour juger un rendu 3D complexe, et se montre complaisant avec son propre travail. **La relecture visuelle par un modèle reste donc un filet secondaire, jamais le gate principal.**

Ordre de priorité effectif :

1. **Audit programmatique du graphe de scène (`tests/garden-material-audit.cjs`, dans `npm run test:browser`).** Inspecte directement les objets Three.js réels, pas des pixels interprétés : matériaux transparents non documentés (liste blanche explicite avec raison, dans `direction-artistique.md` et en tête du test), normales de maillages « au sol » majoritairement retournées (exactement la classe de bug qui a fait « la colline transparente »), sommets non finis (NaN/Infinity), erreurs console. Tout epic touchant au rendu doit passer ce test avant d'être marqué fait ; un échec bloque l'epic (`bloqué`), jamais un contournement. Étendre cette liste blanche/ces règles à chaque nouvelle classe de défaut découverte est la bonne réaction à un futur bug visuel — pas une inspection visuelle plus attentive.
2. **Un style de référence extrait de l'existant, pas inventé par epic.** [direction-artistique.md](direction-artistique.md) documente la palette, les matériaux et les conventions de silhouette réellement en usage dans le jardin déjà livré (valeurs extraites du code). Un epic d'Artisan rendu doit s'y référer explicitement — la cohérence vient de la contrainte du système, pas du goût individuel de chaque déclenchement.
3. **Relecture multimodale, en complément seulement.** Le déclenchement peut aussi lire sa propre capture (outil Read sur l'image) et comparer à `direction-artistique.md` — utile pour attraper ce que l'audit programmatique ne couvre pas encore (composition, proportion relative entre espèces), mais son verdict seul ne suffit jamais à marquer un epic visuel fait si l'audit programmatique n'est pas passé.
4. **Relecture adverse pour la narration.** Tout epic de Scénariste est relu, dans le même déclenchement, contre des critères concrets déjà écrits dans le design (grammaire narrative des sections 9 à 11, tableau des trois leviers d'intensification section 11).
5. **Auto-parcours scénarisés aux portes de phase.** Les scénarios des « premières 90 minutes » (section 13) et les scénarios de validation (section 16) deviennent des epics de test à part entière — un parcours Playwright qui rejoue littéralement l'ouverture du jeu.

Cette hiérarchie a une limite honnête : elle attrape les défauts qu'on sait nommer et mesurer (transparence non voulue, normales retournées, silhouette incohérente avec une règle écrite), pas le jugement esthétique global (« est-ce que c'est beau »). Pour ça, rien ne remplace un œil humain — d'où la **galerie de suivi** ci-dessous, qui ne bloque rien mais garde ce jugement accessible et peu coûteux à exercer.

### La galerie de suivi

Contrairement au reste de cette page, la galerie n'est **pas** produite par la routine cloud elle-même — celle-ci n'a accès qu'à Bash/Read/Write/Edit/Glob/Grep, volontairement, pour rester simple à auditer et ne pas lui donner la capacité de publier quelque chose de visible publiquement sans supervision. À la place : lors d'une session interactive (comme celle-ci), sur demande de l'utilisateur ou périodiquement, une page (Artifact, privée par défaut) rassemble les dernières captures citées dans `docs/campagne.md` avec leur légende (epic, date, commit). L'utilisateur peut ainsi regarder l'évolution visuelle de la campagne à son rythme, commenter, et corriger `direction-artistique.md` en conséquence — sans que cela conditionne l'avancement du backlog.

## Garde-fous anti-emballement

- **Un epic par déclenchement** (déjà motivé plus haut) borne le risque et le coût de chaque exécution.
- **Trois blocages consécutifs → pause automatique.** Si trois déclenchements d'affilée terminent un epic en `bloqué`, le déclenchement suivant désactive la routine (ou, à défaut de pouvoir se désactiver lui-même, écrit un indicateur `PAUSE` en tête de `campagne-backlog.md` que l'étape 3 respecte en refusant de choisir un nouvel epic) plutôt que de continuer à échouer en silence à un rythme d'une fois par heure. Trois blocages d'affilée signalent un problème systémique qu'une boucle non supervisée ne peut pas diagnostiquer seule.
- **Journal de suivi.** Chaque entrée de `docs/campagne.md` garde le nombre de tests, le hash du commit et un résumé exécuté-et-vérifié, comme aujourd'hui — c'est aussi le tableau de bord de dérive de coût dans la durée.

## Politique de porte de phase, révisée pour l'exécution non supervisée

`orchestration.md` réservait jusqu'ici la fusion vers `main` à une décision humaine. Sous cette politique d'exécution continue, elle est reclassée : **aucun pipeline n'est connecté à `main`** (vérifié : pas de workflow CI/CD dans ce dépôt, aucun déploiement automatique), donc fusionner une phase validée dans `main` du dépôt distant est une étape d'implémentation comme une autre, pas un acte de publication — elle peut se faire automatiquement une fois les scénarios de validation de la section 16 passés. La distinction qui reste, elle, absolument intacte : `main` de ce dépôt n'est **jamais** poussé vers un service de déploiement, et rien n'automatise une mise en ligne publique.

## Ce qui reste, malgré tout, une décision humaine

- **Créer et autoriser le dépôt git distant**, et donner à la routine cloud l'accès en écriture nécessaire. C'est un acte visible côté compte (création d'un dépôt, éventuellement facturation des exécutions cloud) : le prérequis technique de toute cette section, mais son activation reste une décision explicite, pas une extrapolation de ce qui a déjà été délégué.
- **Publier réellement le jeu** (déploiement OVH ou autre, domaine, annonce) — toujours hors du périmètre de fabrication, comme documenté dans `garden.md` depuis le début du projet.
- **Renommage commercial définitif** du jeu ou des Rainelles, et toute divergence par rapport à un choix déjà « confirmé par l'utilisateur » dans `game-design.md`.
- **Sortir la routine d'une pause anti-emballement** (trois blocages consécutifs) — cette situation signale explicitement qu'une décision humaine est redevenue nécessaire.

## État : mécanisme activé le 17 septembre 2026

Le dépôt distant relié est `github.com/EdwinDayot/edwindayot.fr` (**public** — visibilité vérifiée, à garder en tête : tout commit de campagne, y compris les epics bloqués et les anomalies, y est visible publiquement). Les branches `main` et `maison-des-possibles` y sont poussées.

Une routine cloud récurrente y est active : cron horaire (`12 * * * *` UTC), modèle `claude-sonnet-5`, environnement « Default », prompt fixe reprenant exactement l'anatomie de déclenchement décrite plus haut. Premier déclenchement prévu le 17 septembre 2026 à 14:12 UTC, puis toutes les heures.

La création a d'abord été bloquée par le classificateur de permissions du mode automatique ; débloquée en ajoutant une règle `"RemoteTrigger"` à `permissions.allow` dans `.claude/settings.json` (projet), à la demande explicite de l'utilisateur.

À surveiller sans y intervenir : le bandeau de pause en tête de `campagne-backlog.md` (trois blocages consécutifs), et les entrées de `docs/campagne.md`/`docs/campagne-anomalies.md` au fil des déclenchements.
