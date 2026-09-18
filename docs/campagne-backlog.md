# Backlog de la campagne — file d'epics

Source de vérité sur l'avancement. Voir [orchestration.md](orchestration.md) pour le processus, [game-design.md](game-design.md) pour la conception. Chaque epic a la taille d'une session d'agent, sur le modèle de ceux déjà livrés dans [garden.md](garden.md).

## Gabarit d'un epic

```
### C<phase>.<n> — <titre court>
Dépend de : <epics requis, ou « rien »>
Critère de sortie : <ce qu'un test/parcours doit prouver, formulé comme un fait observable>
Fichiers probables : <pointeurs>
Statut : todo | en cours | bloqué (raison) | fait (date, lien commit)
```

Seules les deux phases immédiatement exécutables (1 et 2) sont détaillées jusqu'au dernier epic. Les phases 3 à 7 gardent un contour de plan de réalisation (repris de la section 15 du design) ; le Cartographe les détaille epic par epic seulement en approchant leur tour, pour ne pas figer des décisions que les phases précédentes doivent encore éclairer.

---

## Phase 1 — Laboratoire botanique

Porte de sortie (design §15) : *le joueur reconnaît des caractères parentaux, cible un besoin et retrouve exactement son cultivar après rechargement.*

### C1.1 — Schéma cultivar/spécimen
Dépend de : rien
Critère de sortie : le modèle de sauvegarde distingue espèce fondatrice (déjà `D.species` existant), cultivar (id stable, nom, `parentIds`, traits figés) et spécimen (référence à un cultivar + emplacement + stade) ; une sauvegarde v3 existante charge sans cultivar (liste vide) et sans erreur ; un test vérifie qu'un cultivar créé puis rechargé garde exactement les mêmes traits et le même id.
Fichiers probables : `public/garden-state.js`, `public/garden-state-migrate.js`, nouveau `public/game/data-cultivars.js`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). En pratique implémenté dans `public/game/cultivars.js` (pas `data-cultivars.js` : ce n'est pas un catalogue statique comme `data-species.js`, mais des fonctions pures sur l'état de sauvegarde, sur le modèle de `quests.js` face à `data-quests.js`) + `garden-state-lifecycle.js` + `garden-state-validate.js`.

### C1.2 — Grammaire des six premiers attributs
Dépend de : C1.1
Critère de sortie : chaque espèce fondatrice porte des valeurs sur les six axes retenus pour le premier prototype (port, feuilles, fleurs, palette, humidité préférée, fonction remarquable) ; une table de compatibilité déclare quelles paires d'espèces peuvent être croisées ; un test énumère toutes les paires déclarées compatibles et vérifie qu'aucune ne produit une combinaison invalide (ex. fonction sans support valide, cf. §4 « règles de compatibilité »).
Fichiers probables : `public/game/data-species.js`, nouveau `public/game/botany-genetics.js`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). Écart volontaire, justifié dans le changelog : n'étend pas `data-species.js` (catalogue réel du jardin libre, sans rapport avec la flore fictive de Rivebrume) — `botany-genetics.js` porte son propre catalogue des huit espèces fondatrices du design §4.

### C1.3 — Le pot : croisement, héritage par locus, résolution au réveil
Dépend de : C1.2, C2.1 (l'horloge quotidienne doit exister pour qu'« une nuit » ait un sens)
Critère de sortie : poser deux graines compatibles dans le pot et dormir produit un cultivar dont chaque locus discret vient bien de l'un des deux parents à probabilité égale (vérifié statistiquement sur un grand nombre de tirages, seed fixée pour la reproductibilité du test) ; le résultat est fixé et sauvegardé à la confirmation de l'essai — recharger la partie ne le tire pas une seconde fois ; une seule paire par nuit au départ.
Fichiers probables : `public/garden-state-cmd-*.js` (nouveau segment), `public/game/botany-genetics.js`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). En pratique le tirage vit dans un nouveau `public/game/botany-pot.js` (pas dans `botany-genetics.js`, laissé inchangé) ; le nouveau segment de commande est `public/garden-state-cmd-f.js` ; le champ de sauvegarde est `s.campaignPot` (pas `s.pot`, ambigu avec le type d'entité `"pot"` du jardin libre).

### C1.4 — Carnet de botanique
Dépend de : C1.3
Critère de sortie : après un réveil, l'interface montre filiation et différences par rapport aux parents ; le joueur peut nommer, conserver, mettre en réserve, donner ou composter le résultat ; la première conservation enregistre une graine mère de sécurité, récupérable gratuitement et sans valeur de revente dans la boîte de semences de la maison ; le carnet garde la découverte même si l'exemplaire est ensuite composté.
Fichiers probables : `public/game/hud-panel.js`, nouveau panneau, `public/game/data-cultivars.js`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). En pratique dans `public/game/cultivars.js` (champ `disposition` ajouté aux entrées existantes, pas un nouveau `data-cultivars.js`) + nouveau `public/garden-state-cmd-g.js` (`renameCultivar`/`keepCultivar`/`storeCultivar`/`giveCultivar`/`compostCultivar`/`retrieveSeedBoxSeed`) + nouveau champ de sauvegarde `s.campaignSeedBox`. Deux écarts volontaires, justifiés dans docs/campagne.md : (1) les quatre décisions (garder/réserver/donner/composter) plus le renommage sont réparties sur **trois** rows par cultivar en attente (deux boutons chacune) plutôt que deux, et les identifiants d'action Canvas portent un suffixe `-cultivar` (`keep-cultivar`, etc.) pour ne jamais entrer en collision avec l'action `"store"` déjà existante du jardin libre (stockage d'un objet construit) ; (2) le renommage réutilise un `<input type="text">` HTML ordinaire caché par défaut (même principe que le sélecteur de fichier système, voir garden-structure.md) plutôt qu'un nouveau widget de saisie Canvas. Complète aussi le chargement navigateur resté incomplet depuis C1.1–C1.3 (`botany-genetics.js`/`botany-pot.js`/`cultivars.js`/`garden-state-cmd-f.js` n'étaient chargés que côté Node jusqu'ici) : `public/index.html` charge désormais toute la chaîne, condition nécessaire pour que les commandes de cet epic fonctionnent réellement dans la page.

### C1.5 — Épingler un caractère
Dépend de : C1.4
Critère de sortie : après le chapitre de botanique correspondant (voir C4.3), le joueur peut épingler un trait déjà observé chez un parent ; l'essai suivant garantit ce trait, les autres loci restent variables ; un test vérifie que 100 tirages avec un trait épinglé le conservent toujours et que les autres loci varient.
Fichiers probables : `public/game/botany-genetics.js`
Statut : todo (sauté ce déclenchement au profit de C1.6 : sa dépendance réelle inclut C4.3 — « Iris montre comment épingler un caractère déjà vu », design l.383 — qui vit en phase 4, pas encore détaillée ; implémenter le déverrouillage maintenant aurait forcé à inventer un contenu narratif hors ordre, ce que `orchestration.md` interdit explicitement pour les dépendances d'implémentation, pas seulement narratives)

### C1.6 — Multiplication fidèle
Dépend de : C1.1
Critère de sortie : multiplier un cultivar (bouture ou graine issue d'un spécimen déjà obtenu) crée un nouveau spécimen du même cultivar sans relancer aucun tirage ; un test compare les traits du spécimen source et du spécimen multiplié — identiques trait à trait.
Fichiers probables : `public/garden-state-cmd-*.js`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). En pratique dans un nouveau `public/garden-state-cmd-h.js` (commandes `plantSpecimen`/`multiplySpecimen`, noms épelés en entier pour ne jamais entrer en collision avec les commandes physiques existantes `plant`/`multiply` de l'établi) ; `Cultivars.createSpecimen` (posé sans être câblé par C1.1) est maintenant câblé sur un nouveau champ de sauvegarde `s.specimens`.

### C1.7 — Représentation modulaire des hybrides (rendu)
Dépend de : C1.2 (schéma d'attributs stable), C1.3 (au moins un cultivar réel à afficher)
Critère de sortie : le port fournit un squelette à points d'attache ; feuilles/fleurs/fruits proviennent d'une bibliothèque compatible avec le port du cultivar ; une graine visuelle déterministe (dérivée de l'id du cultivar) fixe la distribution des organes et reste identique entre deux sessions ; deux spécimens du même cultivar partagent géométrie/matériau (pas de doublon coûteux en triangles). Les teintes et matériaux utilisés doivent venir de [direction-artistique.md](direction-artistique.md) (palette/matériaux déjà en usage) — pas de nouvelle couleur inventée hors de ces familles sans raison documentée. Avant de marquer l'epic fait : capturer une scène de rendu, la lire avec Read (image), et comparer explicitement au guide (voir « Relecture multimodale réelle » dans [execution-continue.md](execution-continue.md)) ; consigner le résultat de cette relecture dans l'entrée de campagne.md.
Fichiers probables : `public/game/botany.js`, `public/garden-models.js`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). En pratique dans un nouveau `public/game/botany-hybrids.js` (pas `botany.js`/`garden-models.js` : catalogue de la flore fictive de Rivebrume, séparé du rendu du jardin libre pour la même raison que `botany-genetics.js` l'est de `data-species.js`).

### C1.8 — Prototype visuel de validation
Dépend de : C1.7
Critère de sortie : six plantes fondatrices affichées à trois stades, croisements entre familles compatibles affichés côte à côte avec leurs parents ; capture Playwright vérifiant absence de pénétration de maillage grossière et cohérence d'échelle ; relecture multimodale de ces captures contre `direction-artistique.md` (silhouette distincte sans étiquette, palette cohérente, proportions). C'est la porte de sortie de la phase entière (design §15, ligne « ne pas produire les centaines de meubles avant que cette grammaire soit convaincante ») — son résultat devient la référence photographique citée en fin de `direction-artistique.md`.
Fichiers probables : nouveau `tests/campaign-botany-visual.cjs`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). **Ferme la porte de sortie de la phase 1** (voir rapport de clôture daté dans docs/campagne.md) ; C1.5 (épinglage) reste `todo`, correctement différé à C4.3 — le critère de sortie littéral de la phase ne le mentionne pas. Six fondatrices sur les huit du catalogue (`oreille-de-pluie`, `clochette-du-soir`, `menthe-de-velours`, `ronce-a-rubans`, `fraise-timide`, `aster-des-vents`), déjà annoncées par le commentaire d'en-tête de `botany-genetics.js` depuis C1.2. Ajoute aussi des stades de croissance (0/1/2) à `botany-hybrids.js`, posés mais non couverts par C1.7 (`cultivars.js` anticipait déjà ce manque explicitement).

---

## Phase 2 — Jardin d'imitation

Porte de sortie (design §15) : *un joueur enseigne un geste sans guide externe ; une chaîne fonctionne, sature proprement puis redémarre.*

### C2.1 — Horloge quotidienne
Dépend de : rien
Critère de sortie : une journée de jeu va de 7h à 23h en ~24 minutes actives (réglable) ; dialogues/inventaire/construction/carnet/apprentissage mettent le temps en pause ; masquer/fermer l'onglet suspend la partie ; un rappel discret apparaît à 22h30 ; un test vérifie qu'une session pausée puis reprise n'a pas avancé l'horloge de simulation pendant la pause.
Fichiers probables : nouveau `public/game/clock.js`, `public/game/lighting.js` (déjà porteur du cycle visuel, à distinguer explicitement de cette horloge de jeu)
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). En pratique `public/game/campaign-clock.js` (pas `clock.js` : nommé pour rendre explicite qu'il s'agit de l'horloge de campagne, distincte de toute horloge future du jardin libre).

### C2.2 — Passage de nuit atomique
Dépend de : C2.1
Critère de sortie : à 23h, l'action atomique en cours se termine, tout placement non validé est annulé sans coût, une transition ramène à la maison ; le jeu propose de confirmer le pot avant la transition ; le bilan de nuit est appliqué une seule fois, y compris après un rechargement en plein milieu de la résolution (test de non-double-crédit, dans l'esprit de `garden-living.cjs` existant) ; dormir plus tôt est autorisé et ne simule ni travail ni vente sur les heures sautées.
Fichiers probables : `public/game/save.js`, `public/garden-state.js`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). **Scope réduit à la couche moteur, écart documenté ici et dans campagne.md** : `s.campaignDay`/`s.campaignClock` (persistés, migrés) et l'extension de la commande `sleep` (déjà existante depuis C1.3) prouvent programmatiquement les deux clauses testables sans rendu — « bilan appliqué une seule fois, y compris après rechargement » et « dormir plus tôt autorisé, aucune heure sautée simulée ». Les trois clauses restantes (déclenchement automatique à 23h, annulation du placement en cours, transition caméra + écran de confirmation du pot) sont du rendu/interface pur et n'ont **aucune surface existante à habiller aujourd'hui** : aucun mode « campagne » jouable n'existe encore dans `garden.js`/`garden-frame.js` (la campagne n'est aujourd'hui pilotée que par `GardenState.command()` depuis les tests), et `campaign-clock.js` reste non câblé au navigateur exactement comme documenté par C2.1. Les construire maintenant aurait exigé d'inventer d'un bloc un mode de jeu entier, une scène « maison » et un panneau HUD sans passage par le Cartographe — précisément ce qu'`orchestration.md` (« Règles avant rendu ») et le principe « généraliser plutôt que spécialiser » déconseillent. Reportées à C2.2v (nouvel epic ci-dessous, todo, dépend de C2.2) plutôt que réduites en silence.

### C2.2v — Transition de nuit : mode campagne, caméra maison, écran de confirmation du pot
Dépend de : C2.2
Critère de sortie : les trois clauses de rendu/interface différées par C2.2 — à 23h (câblage réel de `campaign-clock.js` au navigateur, `garden-frame.js`/`garden.js`), l'action atomique en cours se termine et tout placement non validé est annulé sans coût ; une transition caméra ramène le personnage à la maison ; un écran (panneau HUD) propose de confirmer ou modifier le pot avant cette transition, puis appelle la commande `sleep`. Suppose une scène « maison » et un point d'ancrage caméra identifiables (probablement à détailler avec le Cartographe si aucun ne préexiste au moment où cet epic est pris, la maison de la campagne n'étant pas encore construite — voir phase 3).
Fichiers probables : `public/game/campaign-clock.js` (câblage), nouveau segment de `public/garden-frame.js`/`public/garden.js`, `public/game/hud-panel.js`
Statut : todo (créé le 2026-09-17, scission de C2.2 — voir sa propre entrée et docs/campagne.md)

### C2.3 — Apparition de la première Rainelle
Dépend de : C1.3 (il faut un cultivar réel dans le pot), C2.2
Critère de sortie : une nuit scénarisée où une grenouille tombe dans le pot pendant un essai produit, au matin, une Rainelle portant le feuillage du cultivar croisé cette nuit-là, sans perte du spécimen attendu (il reste aussi conservé normalement) ; la Rainelle a un prénom modifiable et un identifiant stable.
Fichiers probables : nouveau `public/game/rainelles.js`
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). Choisi plutôt que C2.2v (dépendances déclarées satisfaites — C1.3/C2.2 tous deux `fait` — mais son propre critère de sortie littéral suppose une scène « maison » de campagne qui n'existe pas encore, phase 3 : implémenter maintenant aurait exigé d'inventer d'un bloc un mode de jeu entier, comme pour C1.5/C4.3). En pratique, « nuit scénarisée » et « essai » sont traduits en une couche de règles pure, sans câbler aucun contenu narratif de chapitre 4 (Acte II, hors ordre — hors phase 4 non détaillée) : une commande générique `triggerFrogEncounter` arme une rencontre en attente, résolue par la prochaine vraie nuit de pot (`sleep`, `garden-state-cmd-f.js`) plutôt que par un événement scripté câblé à une scène. Toujours aucun rendu (pas de représentation 3D de la Rainelle), sur le même modèle « posé mais pas encore affiché » que C1.1/C1.6.

### C2.4 — Schéma du geste unique
Dépend de : C2.3
Critère de sortie : une Rainelle mémorise au plus un `{verbe, poste/zone, source, destination, condition}` à la fois ; réenseigner remplace intégralement l'ancien geste (jamais un ajout) ; un test tente d'assigner un second geste simultané et vérifie le refus/remplacement explicite.
Fichiers probables : `public/game/rainelles.js`, `public/game/automation.js` (réutiliser `job`/`buffer` plutôt que dupliquer)
Statut : fait (2026-09-17, voir docs/campagne.md et commit sur `maison-des-possibles`). En pratique aucun changement à `automation.js` (l'exécution du geste, C2.6+, n'est pas dans le périmètre de cet epic) : le champ `geste` vit sur l'entrée `rainelles.js`, et la commande vit dans un nouveau `public/garden-state-cmd-j.js` (`teachGesture`), sur le même patron que `renameCultivar`/`renameRainelle`.

### C2.5 — Enseignement en quatre moments
Dépend de : C2.4
Critère de sortie : « Regarde-moi » suspend le temps ; une démonstration réelle ou assistée au poste est capturée ; le jeu propose une phrase de geste modifiable par le joueur ; un essai montre la trajectoire prévue avant confirmation ; démontrer une fois permet d'enseigner ensuite le même geste à une autre Rainelle par une répétition courte, sans refaire tout le tutoriel.
Fichiers probables : `public/game/hud-panel.js`, `public/game/rainelles.js`
Statut : fait (2026-09-18, voir docs/campagne.md et commit sur `maison-des-possibles`). **Scope réduit à la couche moteur, écart documenté ici et dans campagne.md** : les cinq clauses sont prouvées comme état/données pures (`beginTeaching`/`demonstrateGesture`/`reviseGesturePhrase`/`confirmTeaching`/`cancelTeaching`/`teachGestureQuick` dans `public/garden-state-cmd-k.js`) — démonstration « assistée » (le critère accepte explicitement « réelle ou assistée »), phrase et trajectoire calculées et modifiables via commande. Aucune de ces cinq clauses n'est encore montrée au joueur (aucun écran `hud-panel.js`, aucune caméra « Regarde-moi », aucune ligne de trajectoire dans le monde) : reportée au nouvel epic **C2.5v** ci-dessous, même scission que C2.2/C2.2v et pour la même raison (aucune interface de campagne encore câblée à un écran réel).

### C2.5v — Interface d'enseignement : écran de leçon, phrase et trajectoire affichées
Dépend de : C2.5
Critère de sortie : les clauses d'interface différées par C2.5 — un écran (`hud-panel.js`) affiche la phrase proposée par `demonstrateGesture` et permet de la corriger (`reviseGesturePhrase`) avant `confirmTeaching`/`cancelTeaching` ; la trajectoire planifiée (`draft.trajectory`) est visible dans le monde avant confirmation ; une mise en scène caméra accompagne « Regarde-moi » (`beginTeaching`). Suppose un poste/une zone réellement placés dans le monde de campagne (probablement à détailler avec le Cartographe si aucun ne préexiste au moment où cet epic est pris — la maison/les postes de la campagne sont un chantier de la phase 3, comme déjà noté pour C2.2v).
Fichiers probables : `public/game/hud-panel.js`, nouveau segment de `public/garden-frame.js`/`public/garden.js`
Statut : todo (créé le 2026-09-18, scission de C2.5 — voir sa propre entrée et docs/campagne.md)

### C2.6 — Gestes Arroser et Récolter
Dépend de : C2.5
Critère de sortie : une Rainelle enseignée à arroser remplit son arrosoir à la borne du poste puis humidifie les plantes de la zone sans intervention ; une Rainelle enseignée à récolter dépose les productions mûres dans le panier adjacent ; les deux réutilisent les primitives génériques `job`/`buffer` déjà présentes dans `automation.js` plutôt que d'en créer de nouvelles.
Fichiers probables : `public/game/automation.js`, `public/game/rainelles.js`
Statut : todo (reformulé par le Cartographe le 2026-09-18 en trois epics plus petits, C2.6a/C2.6b/C2.6c ci-dessous, plutôt que tenté tel quel — voir le journal des décisions : son critère littéral suppose trois mécaniques encore inexistantes à la fois — bornes/paniers, humidité de zone, maturité de spécimen — ce qu'`orchestration.md` interdit pour un seul epic (« jamais une refonte simultanée de plusieurs systèmes »). Conservé ici pour mémoire ; ne plus choisir cet epic directement, choisir C2.6a/b/c à sa place.)

### C2.6a — Registre des bornes d'eau, zones de culture et paniers de campagne
Dépend de : C2.4
Critère de sortie : la sauvegarde de campagne déclare un registre de bornes d'eau, de zones de culture et de paniers de campagne, chacun avec un id stable et une position ; une fonction pure permet de résoudre les identifiants `poste`/`source`/`destination` déjà acceptés en texte libre par `teachGesture`/`demonstrateGesture` (C2.4/C2.5) contre ce registre (id connu → entrée trouvée ; id inconnu → échec explicite, jamais un `undefined` silencieux) ; une sauvegarde existante sans ce registre migre vers un registre vide sans erreur ; aucune commande de geste existante ne change de comportement (les identifiants restent acceptés tels quels, la résolution est une fonction séparée, pas encore appelée par `teachGesture`/`demonstrateGesture`).
Fichiers probables : nouveau `public/game/campaign-stations.js`, `public/garden-state-lifecycle.js`, `public/garden-state-validate.js`
Statut : todo (créé le 2026-09-18, premier tiers de la reformulation de C2.6)

### C2.6b — Humidité et maturité des spécimens de campagne
Dépend de : C1.6
Critère de sortie : un spécimen de cultivar (`s.specimens`, C1.6) porte une humidité qui décroît avec le temps de simulation (`s.elapsed`, jamais l'horloge murale — même principe que le dopage `boostUntil` du jardin libre) et un état de maturité dérivé de son stade de croissance (C1.8) ; un test vérifie la décroissance déterministe de l'humidité sur une durée simulée donnée et qu'un spécimen immature ne peut pas être marqué prêt à produire ; une sauvegarde existante sans ces champs migre vers des valeurs par défaut sans erreur.
Fichiers probables : `public/game/cultivars.js`, `public/garden-state-lifecycle.js`, `public/garden-state-validate.js`
Statut : todo (créé le 2026-09-18, deuxième tiers de la reformulation de C2.6)

### C2.6c — Gestes Arroser et Récolter, branchés sur le registre et les spécimens
Dépend de : C2.6a, C2.6b, C2.5
Critère de sortie : identique au critère littéral de C2.6 ci-dessus (une Rainelle enseignée à arroser remplit son arrosoir à la borne du poste puis humidifie les plantes de la zone sans intervention ; une Rainelle enseignée à récolter dépose les productions mûres dans le panier adjacent ; les deux réutilisent les primitives génériques `job`/`buffer` déjà présentes dans `automation.js`), désormais réalisable sans inventer de sous-système supplémentaire puisque bornes/zones/paniers (C2.6a) et humidité/maturité de spécimen (C2.6b) existent déjà.
Fichiers probables : `public/game/automation.js`, `public/game/rainelles.js`
Statut : todo (créé le 2026-09-18, troisième tiers de la reformulation de C2.6)

### C2.7 — Geste Transporter
Dépend de : C2.6c
Critère de sortie : une Rainelle transporteuse déplace les productions d'un panier A vers un panier B selon un filtre de ressource, avec un seul trajet actif à la fois ; enchaîner arrosage → récolte → transport sans intervention manuelle fait circuler une ressource de bout en bout dans un test.
Fichiers probables : `public/game/rainelles.js`
Statut : todo (dépendance mise à jour le 2026-09-18 : C2.6 → C2.6c, voir reformulation ci-dessus)

### C2.8 — Réservations et états de blocage
Dépend de : C2.6c
Critère de sortie : une ressource et un emplacement de sortie sont réservés avant le départ d'une Rainelle, empêchant deux Rainelles de prendre la même cible ; si la cible disparaît, la réservation se libère et l'objet déjà porté rejoint un bac de secours identifié ; les sept états (au travail/stock atteint/source vide/sortie pleine/passage bloqué/poste manquant/repos) sont exposés avec une phrase d'action, sur le modèle des diagnostics déjà existants dans `irrigation-status.js`.
Fichiers probables : nouveau `public/game/rainelles-status.js`
Statut : todo (dépendance mise à jour le 2026-09-18 : C2.6 → C2.6c, voir reformulation ci-dessus)

### C2.9 — Mode d'observation
Dépend de : C2.8
Critère de sortie : une vue dédiée montre chemins, transferts et cadence par journée ; elle permet de suivre un objet du plant au présentoir et de lancer un cycle pas à pas, sans modifier la simulation en cours d'observation.
Fichiers probables : `public/game/hud-world.js`
Statut : todo

### C2.10 — Refus de multiplication, réenseignement gratuit
Dépend de : C2.4
Critère de sortie : aucune commande ne permet à une Rainelle de multiplier une autre Rainelle ni elle-même ; le refus est un événement explicite (pas un silence), montré dès la première tentative ; réenseigner un geste ne coûte rien et remplace proprement l'ancien (déjà couvert en partie par C2.4, ce epic ajoute le côté narratif du refus).
Fichiers probables : `public/game/rainelles.js`
Statut : fait (2026-09-18, voir docs/campagne.md et commit sur `maison-des-possibles`). `validateGestureFields` (partagée par `teachGesture` et `demonstrateGesture`, seuls points d'entrée qui assignent un verbe à `geste`) distingue désormais `verbe === "multiplier"` avec un message narratif dédié (`Rainelles.MULTIPLY_REFUSAL`), plutôt que le "Geste inconnu." générique : événement explicite, jamais un silence, montré dès la première tentative sur l'un ou l'autre chemin. "Réenseigner ne coûte rien" était déjà vrai par construction depuis C2.4 (aucune commande de geste ne touche `s.inventory`) ; ajouté ici un test de régression explicite plutôt que de le supposer. Aucune commande ne permettait déjà de multiplier une Rainelle (espaces d'id disjoints `r<n>`/`sp<n>`/`e<n>`) ; `multiplySpecimen` et le `multiply` du monde libre le confirment par un refus explicite (jamais un no-op silencieux), vérifié par test plutôt qu'affirmé. C2.6 (gestes Arroser/Récolter, dépendance C2.5) délibérément sauté ce déclenchement : voir journal des décisions ci-dessous.

### C2.11 — Chaîne de validation « fraises de la cuisine »
Dépend de : C2.7, C2.8, C2.10
Critère de sortie : la chaîne complète décrite en §5 du design (eau → arroseuse → fraisiers → récolteuse → panier → transporteuse → réserve de cuisine) fonctionne sans intervention manuelle sur une durée de test représentant plusieurs jours simulés, sature proprement quand la réserve est pleine, puis redémarre seule quand elle se vide. C'est la porte de sortie de la phase.
Fichiers probables : nouveau `tests/campaign-rainelles-chain.cjs`
Statut : todo

---

## Phase 3 — Tranche verticale

Porte de sortie (design §15) : *habiter, croiser, organiser, rencontrer fonctionnent ensemble en une courte partie sauvegardable.*

Assemble les phases 1 et 2 avec : maison refuge minimale (réparation lit/table/réchaud), une serre, un coin de village, deux habitants, deux Rainelles, trois nuits jouées, une première quête d'outil. Ne pas détailler epic par epic avant que la phase 2 soit close — la forme exacte de la maison et des quêtes dépend de ce que les phases 1 et 2 auront réellement livré.

## Phase 4 — Première version jouable (actes I à III)

Porte de sortie : *l'arc « retour puis ouverture au village » se conclut sans dépendre de contenu annoncé mais absent.*

Chapitres 1 à 9 du design (§10). Comprend notamment l'epic **C4.3 — chapitre 3, première hybridation et épinglage montré par Iris**, dont dépend C1.5 ci-dessus : à détailler en ouvrant cette phase.

## Phase 5 — Prototype du retournement

Porte de sortie : *les joueurs comprennent les effets des veilleuses/prélèvements/repos ; le scénario distingue une partie attentive d'une partie intensive.*

Design §11 : mémoire factuelle bornée, trois leviers d'intensification, une scène de culpabilité et sa réparation. À expérimenter tôt avec peu de contenu (design §15, dernier paragraphe de la table) — ne pas attendre la phase 6 pour la tester.

## Phase 6 — Campagne complète (actes IV à VI)

Porte de sortie : *tous les parcours narratifs concluent sans imposer l'exploitation ni inventer une faute.*

Chapitres 10 à 18, autres lieux, personnages restants, enjeux de disponibilité, épilogues à trois orientations.

## Phase 7 — Profondeur et finition

Porte de sortie : *ajouts validés sur parties réelles ; confort, accès et performances tenus sur les appareils de référence.*

Saisons, extensions de maison, catalogue décoratif, chaînes avancées, tactile, optimisation, histoires secondaires (§10 fin).

---

## Journal des décisions d'orchestration

- 2026-09-17 — Démarrage. Branche `maison-des-possibles` créée depuis `main`. Choix de ne détailler que les phases 1 et 2 immédiatement, pour ne pas figer de décisions de contenu que ces deux phases doivent encore éclairer (voir principe « généraliser plutôt que spécialiser » dans `orchestration.md`).
- 2026-09-17 — C2.2v (dépendances satisfaites : C2.2 fait) sauté au profit de C2.3 : son critère de sortie littéral suppose une scène « maison » de campagne et un point d'ancrage caméra que la phase 3 seule doit construire (déjà noté dans son propre statut « probablement à détailler avec le Cartographe »). L'implémenter maintenant aurait exigé d'inventer d'un bloc, sans passage par le Cartographe, un mode de jeu entier — même raisonnement que le report de C1.5 à C4.3. C2.3, elle, ne dépend que de C1.3/C2.2 (tous deux `fait`) et se réduit à une couche de règles pure (voir sa propre entrée).
- 2026-09-17 — C2.2v sauté une nouvelle fois au profit de C2.4, pour la même raison exacte que la fois précédente (scène « maison » de campagne toujours absente, chantier de la phase 3) : ce n'est pas un nouvel arbitrage, seulement la reconfirmation que rien n'a changé depuis. C2.4 (dépendance C2.3, `fait`) est un epic de schéma pur, sans dépendance narrative ni de rendu cachée.
- 2026-09-18 — C2.2v sauté une troisième fois, toujours pour la même raison (aucune scène « maison » de campagne construite, chantier de la phase 3). C2.5 (dépendance C2.4, `fait`) était le seul autre epic `todo` de la phase disponible ; implémenté avec le même écart « scope réduit à la couche moteur » que C2.2, la scission de son volet interface devenant le nouvel epic C2.5v (todo, dépend de C2.5) plutôt qu'une réduction silencieuse du critère de sortie.
- 2026-09-18 — C2.6 (« Gestes Arroser et Récolter », dépendance C2.5, `fait`) sauté au profit de C2.10, malgré une dépendance satisfaite : son critère de sortie littéral exige qu'une Rainelle « remplisse son arrosoir à la borne du poste » et « humidifie les plantes de la zone »/« dépose dans le panier adjacent » sans intervention — or aucune de ces trois choses n'existe encore comme donnée à ce stade (`poste`/`source`/`destination` restent des identifiants de chaîne opaques depuis C2.4, sans registre de bornes/zones/paniers ; les spécimens de cultivars (`s.specimens`, C1.6) n'ont ni humidité ni production/maturité — ce sont des mécaniques entièrement nouvelles à inventer, pas une extension d'un système existant). Implémenter C2.6 tel quel aurait exigé de construire d'un bloc, sans passage par le Cartographe, au moins trois sous-systèmes de simulation à la fois (bornes d'eau, humidité de zone, maturité/production) — exactement ce qu'interdit `orchestration.md` (« un epic ajoute une capacité vérifiable en une session, jamais une refonte simultanée de plusieurs systèmes »). C2.10 (dépendance C2.4, `fait` également) est en comparaison un epic de schéma pur, borné à une seule règle déjà quasi entièrement vraie par construction (l'exclusion de `multiplier` de `VERBS` existe depuis C2.4) : le bon candidat pour ce déclenchement. C2.6 reste `todo` ; sa reformulation par un futur passage du Cartographe (probablement en deux epics — un registre minimal de bornes/zones/paniers, puis le branchement du tick automation dessus) est laissée à un déclenchement ultérieur plutôt que devinée ici.
- 2026-09-18 — Déclenchement automatisé (routine cloud horaire). Anti-hallucination : dernier epic `fait` du backlog était C2.10, commit `3cc89c9` — `git show --stat 3cc89c9` confirme le commit réel (5 fichiers, correspond exactement à l'entrée de `campagne.md`) ; `npm ci && npm test` relancés indépendamment → 266/266, identique au rapport existant. Aucun bandeau de pause en tête de ce fichier. Aucune anomalie, `docs/campagne-anomalies.md` toujours absent. **Rôle Cartographe endossé** (pas d'implémentation ce déclenchement) : les trois seuls epics `todo` de phase 1/2 à dépendances satisfaites étaient C2.2v, C2.5v (tous deux bloqués depuis plusieurs déclenchements par l'absence de scène « maison » de campagne, chantier de la phase 3 — aucun changement depuis la dernière fois) et C2.6, dont la reformulation par le Cartographe était explicitement laissée en suspens par l'entrée précédente de ce journal. Reformulé C2.6 en trois epics plus petits, chacun de la taille d'une session, au lieu de forcer un epic qui aurait mélangé trois sous-systèmes à la fois : **C2.6a** (registre de bornes d'eau/zones/paniers, pur schéma + fonction de résolution, sans brancher encore les commandes de geste dessus), **C2.6b** (humidité et maturité des spécimens, extension de `s.specimens` posée par C1.6, sur le modèle de l'horloge de simulation `s.elapsed` déjà utilisée par le dopage engrais du jardin libre), **C2.6c** (le critère littéral originel de C2.6, désormais réalisable sans invention simultanée puisque C2.6a/b lui fournissent leurs briques). Dépendances de C2.7/C2.8 mises à jour de C2.6 vers C2.6c en conséquence. C2.6 original conservé dans le fichier pour mémoire (todo, avec renvoi vers la reformulation), jamais à choisir directement désormais. Aucun code ni test modifié ce déclenchement — travail de planification seul, comme prescrit par `orchestration.md`/`execution-continue.md` pour ce cas.
