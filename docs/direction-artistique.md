# Direction artistique — guide vérifiable

La section 14 de [game-design.md](game-design.md) décrit une intention (« stylisée, volumes lisibles, matériaux mats »). Ce document la transforme en règles concrètes qu'un agent peut suivre et qu'une relecture peut vérifier — la beauté d'un jeu ne se prouve pas par des tests, mais l'absence de dérive de style, elle, se vérifie. Voir [execution-continue.md](execution-continue.md) pour comment il s'articule avec la relecture multimodale et la galerie de suivi.

**Principe de fond : ce guide part de ce qui existe déjà et qui fonctionne, pas d'une intention réécrite à neuf.** Le jardin actuel (`public/game/render*.js`, `public/garden-models*.js`, `public/game/botany*.js`) a une identité visuelle mûrie sur plus de vingt epics, vérifiée en navigateur à chaque étape (voir `garden.md`). La campagne doit prolonger cette identité, pas en inventer une autre en parallèle.

## Palette existante (extraite du code réel, pas inventée)

Ces teintes sont déjà à l'écran aujourd'hui. Un nouvel élément (Rainelle, maison de Rivebrume, cultivar) doit choisir dans ces familles ou une teinte clairement dérivée (même teinte, luminosité/saturation ajustée) — jamais une couleur saturée ou non apparentée choisie au hasard par l'epic qui l'introduit.

| Famille | Teintes en usage | Où |
| --- | --- | --- |
| Feuillage / vert | `0x53825c` `0x455f3d` `0x47784a` `0x6d9365` `0x739064` `0x78a655` `0x559064` `0x56885c` `0x709773` `0x75a99a` `0x9dbbac` `0x54845a` `0xaabd8c` `0x91ab80` `0xc4c591` `0xbec0a1` `0xb8c39c` `0xb4bd72` `0x6d8a52` | plantes, herbe, zones, engrais |
| Pierre / maçonnerie | `0xc5c5b2` `0x8f8a76` `0xa9afa2` | murs, chaînages |
| Bois / écorce | `0xb99670` `0x8a7156` `0x785a3e` `0x6b5540` `0x5c4632` (toit, par défaut) `0xc99c67` `0x725d48` | charpente, meubles, troncs |
| Terre / argile / graine | `0xb99875` `0x493323` `0xa37a45` `0xc98d65` | sol, semences |
| Eau | `0x80c3c3` `0x438e9b` `0x426e62` `0xb2eff0` (émissif sur écoulement) `0x9acfd3` | citernes, rivière, goutte |
| Accents chauds (fleurs, lumière, peau) | `0xe8bd53` `0xf4efd8` `0xd7a3ac` `0xe1b153` `0xcb9f97` `0xe1b08a` (peau) `0xedc08b` (joueur) `0xf2da9b`/`0xffb85e` (lanterne) `0xeac987` | fleurs, personnages, éclairage local |
| Ciel / ambiance / fog | fond et brouillard `0xdce7d4`, lumière hémisphérique `0xfff7df` / `0x69816f`, soleil `0xffeaca`→`0xffefd8`, lune `0x9bbaff` | `render.js`, `render-items.js` |

Tons neutres additionnels déjà en service : lavande `0x9a83b5`, aster/violet non encore utilisé en jeu mais cohérent avec cette famille (à réserver pour l'Aster des vents, §4 du design). Une teinte totalement absente de ces familles (rouge vif, magenta, cyan saturé) doit rester exceptionnelle et justifiée (un signal d'erreur, `0xb5654f`/`0xb65e48`, est le seul rouge en usage — réservé aux états invalides).

## Matériaux et lumière

- **Mats, jamais métalliques.** Rugosité (`roughness`) observée entre 0,15 (eau, presque lisse) et 0,48 (feuillage) ; aucun matériau n'utilise `metalness`. Un nouvel élément suit cette plage — pas de surface brillante ou plastique.
- **Émissif réservé au signal, pas à la décoration.** Seuls l'eau en écoulement et les lanternes portent une composante émissive, toujours faible (`emissiveIntensity` 0,35 observé) — un moyen de montrer qu'un système fonctionne, pas un effet gratuit.
- **Éclairage à trois étages**, déjà en place et à réutiliser tel quel : une lumière hémisphérique ambiante (ciel chaud / rebond vert du sol), un soleil directionnel dont la teinte et l'intensité suivent l'heure (`lighting.js`), jusqu'à quatre lumières locales (lanternes) avec budget d'ombres documenté dans `garden-structure.md`. Une nouvelle source de lumière (fenêtre de maison, feu, nouvelle Rainelle bioluminescente type Clochette du soir) doit entrer dans ce budget, pas s'y ajouter sans compter.
- **Ombrage de forme cuit pour les grands reliefs.** Le terrain n'utilise pas que les shadow maps (trop faible sur un dôme convexe, voir l'entrée du 17 septembre 2026 dans `garden.md`) : il combine une ombre de relief cuite en couleurs de sommet, orientée soleil, avec l'éclairage dynamique. Toute nouvelle grande forme de terrain (les huit collines actuelles, une future terrasse) doit suivre le même principe plutôt que de compter sur les ombres portées seules.

## Silhouette et géométrie

- **La silhouette porte l'identité, pas la texture.** Chaque espèce/cultivar doit être identifiable en ombre chinoise, à distance, sans détail de surface — c'est le critère de lisibilité déjà énoncé au design §14 et le vrai test de l'epic C1.8 (« vérifier lisibilité des caractères... sans libellés »).
- **Formes composées de primitives simples**, jamais de maillage sculpté à la main : c'est déjà comment tout le jeu est construit (voir `garden-models*.js`, `render-houses.js`) et ce qui permet l'instanciation/le partage de géométrie pour la performance (`garden-structure.md#architecture`).
- **Squelette + points d'attache pour tout élément modulaire** (hybrides du pot, Rainelles) : un port/corps de base porte des points d'ancrage déclarés ; feuilles/fleurs/fruits ou éléments végétaux d'une Rainelle s'y attachent depuis une bibliothèque compatible, jamais fusionnés arbitrairement (design §14, epics C1.7 et l'apparence des Rainelles §5).
- **Un cultivar = une signature visuelle réutilisée**, jamais recalculée par spécimen : deux spécimens du même cultivar partagent géométrie et matériau (déjà la règle pour les espèces existantes, à étendre aux cultivars).

## Vérification : programmatique d'abord, jamais seulement visuelle

`tests/garden-material-audit.cjs` (dans `npm run test:browser`) inspecte directement le graphe de scène Three.js — matériaux transparents non documentés, normales de maillages « au sol » retournées, sommets non finis — plutôt que de juger une image rendue. C'est délibéré : une relecture qui ne fait que regarder une capture s'est montrée peu fiable sur ce projet (un bug de normales a survécu à des dizaines de vérifications par capture pendant plusieurs jours ; le même script l'a détecté en une seconde une fois écrit — voir `execution-continue.md`). La liste blanche des matériaux volontairement transparents (`TRANSPARENT_ALLOWLIST` dans ce test) doit rester synchronisée avec les cas légitimes ci-dessus (verre de serre, halo de lanterne, survol de portée) ; tout nouveau cas légitime s'y ajoute avec sa raison, jamais en assouplissant la règle en silence.

## Ce que ce guide ne remplace pas

Aucune règle ci-dessus, ni l'audit programmatique, ne garantit qu'un nouvel élément est *beau* — seulement qu'il ne détonne pas et ne contient pas un défaut nommable. Le jugement esthétique réel reste porté par :
1. **La relecture multimodale**, en complément seulement de l'audit programmatique (voir `execution-continue.md`) : utile pour la composition et les proportions relatives, jamais suffisante seule pour marquer un epic visuel fait.
2. **La galerie de suivi** : les captures des epics visuels sont consultables à tout moment par l'utilisateur (voir `execution-continue.md`), pour qu'un vrai regard humain reste possible sans être requis pour avancer.
3. **Ce document lui-même reste amendable.** Si l'utilisateur trouve un résultat raté en regardant la galerie, corriger ici (une règle plus précise, une teinte à bannir, une proportion à revoir, un nouveau critère programmatique à ajouter au test) prévaut sur tout epic déjà livré — comme `game-design.md` pour le fond, ce fichier fait autorité sur la forme pour tous les déclenchements suivants.

## Prototype visuel de référence

L'epic C1.8 du backlog (« Prototype visuel de validation ») est le premier vrai test de ce guide : six plantes fondatrices à trois stades, croisements affichés côte à côte avec leurs parents. Son résultat (captures archivées) devient la référence photographique de ce document — à relier ici une fois livré, plutôt que d'garder ce guide uniquement textuel.

L'epic C5.12 (« Prototype visuel de validation des Rainelles ») joue le même rôle pour les Rainelles, cette fois en mouvement réel plutôt que sur une scène statique (`tests/campaign-rainelle-visual-validation.cjs`, capture archivée `/tmp/campaign-rainelle-visual-validation.png` — voir docs/campagne.md pour la relecture multimodale correspondante) : huit Rainelles de cultivars fondateurs différents plus deux instances du même cultivar, positionnées et déplacées via le moteur réel (C5.10/C5.11) vers un habitat commun, sans jamais de pénétration de maillage grossière pendant quinze pas de simulation réels. Aucune teinte hors des familles déjà documentées ci-dessus n'a été nécessaire (palette héritée telle quelle de C5.9).
