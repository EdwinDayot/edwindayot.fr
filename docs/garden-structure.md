# Le jardin des jours tranquilles — commandes, construction, architecture

_(Extrait de [garden.md](garden.md) : sections « Commandes et interface », « Construction et réseaux » et « Architecture ».)_

## Commandes et interface

Le HUD, les boutons, la grille d’inventaire, la fabrication, la carte, le carnet, les échanges et les réglages sont dessinés dans un Canvas 2D au-dessus du monde Three.js. Les zones de clic, le glisser-déposer, la navigation clavier et le joystick sont gérés par le jeu. Le lien portfolio, le repli sans WebGL et le sélecteur de fichier du système restent en HTML.

- Flèches, ZQSD ou WASD : marcher dès l’ouverture, sans clic préalable. Maj : courir. Clic sur le terrain : chemin calculé autour des pots, installations et troncs.
- `1–5` : équiper un des cinq emplacements personnalisables (y compris les touches physiques AZERTY sans Maj). Départ : arrosoir, mains libres, hache, pioche et pelle. Les graines, plans et raccordements s’affectent depuis I.
- `I` : ouvrir ou fermer l’inventaire. Choisir un objet puis `1–5`, toucher un emplacement, ou glisser-déposer pour l’y affecter. Les emplacements de la barre peuvent aussi être échangés par glisser-déposer ; la configuration est sauvegardée.
- `E` ou clic sur un objet : agir avec l’objet équipé. Le personnage s’approche automatiquement si nécessaire. Plantation, récolte, échange disponible, remplissage et raccordement se font dans le monde. Pour travailler une ressource, maintenir E, le clic ou le bouton tactile d’action avec le bon outil.
- Construction : équiper un objet ou son plan, viser le sol puis clic ou `E` pour poser. `R` tourne, Échap ou clic droit annule. Le plan reste équipé pour les poses suivantes ; les matériaux sont consommés uniquement à la pose valide. On peut continuer à marcher.
- `V` ou Inspecter : cadrer la plante réelle et lire sa fiche (espèce, stade, humidité, croissance, productions, provenance et préférences ludiques). Les boutons −45° / +45° tournent autour de la plante ; Échap restaure la caméra. La simulation continue, le personnage reste immobile.
- `F` ou bouton Déplacer : déplacer l’objet proche. Pendant le déplacement, `G` ou En réserve range l’objet intact ; l’inventaire permet de le replacer.
- Raccordement : choisir une installation, puis la suivante avec clic ou `E`. Le sens réel est automatique, indépendamment de l’ordre des clics : pompe vers citerne, citerne vers tuyaux/goutteur, goutteur vers les goutteurs suivants et les pots. Répéter un raccord existant le retire. Échap annule le départ choisi.
- `N` : lecture du niveau et de l’état des citernes. Les tuyaux physiques restent toujours visibles, même hors de cette vue.
- `M` : carte et destinations. `J` : carnet. Molette ou boutons : zoom ; bouton de rotation : tourner la caméra.
- Sur mobile : joystick maintenu, cinq cases tactiles, inventaire et boutons d’action, déplacement, rotation, réserve et annulation. Les mêmes opérations sont accessibles sans clavier. Les commandes contextuelles de 44 px minimum restent ancrées à leur objet, avec une oscillation de 3 px suspendue au survol et à l’appui (aucune en mouvement réduit). Elles évitent les cibles voisines et les bords, puis disparaissent hors champ. Les jauges d’humidité apparaissent à moins de 5 unités, sous 20 %, ou sur la cible ; seule cette dernière porte un pourcentage. Construction et panneaux principaux masquent les jauges.
- Un seul panneau principal, Tab ou flèches pour parcourir les commandes Canvas, Entrée pour valider, Échap pour fermer et retour immédiat aux déplacements. Les réglages permettent de désactiver les indications, activer les sons et réduire les mouvements. La préférence système de mouvement réduit est toujours respectée.

Le jeu occupe toute la fenêtre et « Voir le portfolio » reste immédiatement disponible. Les quatre parcelles représentent 2 376 unités carrées, contre 462 auparavant. Le sous-bois contient 27 arbres exploitables, avec des troncs solides et un feuillage qui s’efface près du personnage. Les nouveaux sites cèdent la place aux objets des anciennes sauvegardes. Les feuillages qui masquent le personnage deviennent transparents ; les objets 3D peuvent être sélectionnés directement.

## Construction et réseaux

La grille est de 0,5 unité. Les commandes contrôlent la parcelle, le bord de rivière, les collisions, les passages, les ressources et l’accès aux installations. Le personnage contourne les obstacles avec la même grille de navigation. Un objet ne peut pas être posé sous le personnage.

Déplacer un pot conserve exactement sa plante. Les raccords encore valides sont conservés ; ceux qui dépassent leur portée sont retirés avec un message. Ranger un objet retire ses raccordements, conserve son contenu et le met en pause.

- Pot à réserve : évaporation divisée par 2,5.
- Citerne : 160 unités, débit maximal de 1 unité/s. Remplissage manuel depuis l’arrosoir.
- Tuyau/goutteur : raccordement explicite jusqu’à 4 unités entre équipements. Les goutteurs peuvent être reliés en série ; chacun transmet l’eau aux suivants même si son pot est humide ou absent. Les pots doivent être à 1,8 unité maximum de leur goutteur ; un pot reçoit un seul goutteur.
- Pompe : au bord de rivière (`x ≥ 2,5`), remplit les citernes du circuit à 2 unités/s sans carburant.
- Établi : ouvrir le choix des boutures présentes dans le sac, choisir une espèce puis confirmer. Une bouture est consommée à cette seule validation. L’établi montre cette espèce pendant 180 secondes puis conserve le jeune plant prêt ; « Récupérer » transfère exactement un jeune plant au sac et libère l’établi. Aucun redémarrage automatique. Le travail sauvegardé conserve `job: {species, remaining}` ; `remaining: 0` signifie prêt. La production est comptée une fois à maturité. Ranger suspend le travail et préserve le contenu, même prêt.
- Collecteur : portée de 4 unités et réserve de 24 productions. Le joueur vide la réserve. Il ne vend ni ne replante automatiquement.

Les goutteurs servent les plantes en dessous de 65 % d’humidité, avec une rotation des consommateurs si le débit est insuffisant. Un circuit vide s’arrête sans pénalité. Les raccords sont des conduites physiques permanentes. Des gouttes animées et des flèches signalent le débit réel de chaque raccord, avec le bon sens même si la liaison a été créée dans l’ordre inverse. Une branche inutilisée ne montre aucun écoulement. En mouvement réduit, les flèches restent visibles sans gouttes animées. La citerne ouverte possède une paroi intérieure opaque et un rebord épais ; sa surface d’eau reste à l’intérieur, du fond au plein. Elle montre son eau et une jauge extérieure ; la vue « Eau » explique un circuit vide, déconnecté, sans goutteur/pot, en attente d’humidité ou en train d’arroser. Les pompes ont une animation. Le réseau calcule les chemins réels et le débit signé de chaque conduite ; une pompe ne traverse pas un goutteur pour remplir une citerne, et ni un pot ni un goutteur ne servent de passage vers un autre tuyau. Chaque citerne garde son stock et sa limite de débit propres. Les cycles n’ajoutent pas d’eau et les flux opposés sur un même tuyau sont compensés. Les diagnostics distinguent remplissage, arrosage et attente ; une citerne alimentée pendant qu’elle arrose affiche séparément son entrée et sa sortie.

## Architecture

Aucune compilation n’est nécessaire. Les scripts sont hébergés localement ; Three.js reste la version déjà présente dans le projet.

| Fichier                                            | Responsabilité                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `public/game/data.js`                              | Espèces, zones, ressources, recettes, prix et récompenses d’équilibrage                   |
| `public/game/economy.js`                           | Inventaire, crédits et débits atomiques                                                   |
| `public/game/progression.js`                       | Demandes accessibles, découvertes, plans et récompenses permanentes                       |
| `public/game/construction.js`                      | Placement, collisions, accessibilité et recherche de chemin                               |
| `public/game/irrigation.js`                        | Graphe des raccordements, stocks, débit, répartition                                      |
| `public/garden-state.js`                           | Commandes validées, simulation à pas fixe, validation des sauvegardes et migration        |
| `public/game/save.js`                              | Stockage, sauvegarde de secours, export/import et rattrapage                              |
| `public/garden-models.js`, `public/game/botany.js` | Douze silhouettes originales et modèles de détail                                         |
| `public/game/lighting.js`                          | Calcul pur du cycle solaire depuis le temps sauvegardé                                    |
| `public/game/render.js`                            | Monde, caméra, personnage, animation et instanciation                                     |
| `public/game/hud.js`                               | Interface Canvas, icônes des objets, zones de clic, inventaire et navigation des panneaux |
| `public/garden.js`                                 | Commandes clavier/souris/tactiles, action maintenue, sons et cycle de vie de la page      |

Les règles s’exécutent dans Node sans WebGL. Les commandes refusées ne consomment rien. La pose consomme d’abord l’objet en réserve, ou fabrique directement depuis un plan connu après validation de l’emplacement et du coût. Les événements de commande déclenchent les sons et animations.

La simulation utilise un pas d’une seconde et conserve la fraction restante. Le rendu ne décide pas de la croissance. Les géométries et matériaux sont partagés et les maillages répétés instanciés. Chaque espèce conserve le même modèle détaillé quelle que soit la distance du personnage ou le zoom : seule sa croissance change ses dimensions. Les ombres restent activées sur ordinateur et mobile. Elles commencent à 2 048 px sur ordinateur et 1 024 px sur appareil tactile. Après au moins 12 secondes et 4 secondes de ralentissement cumulé, le rendu descend d’un niveau (2 048 → 1 024 → 512 px), avec réduction de la résolution au dernier niveau. Les seuils visent 60 images/s sur ordinateur et 30 sur mobile ; la temporisation évite les bascules incessantes.
