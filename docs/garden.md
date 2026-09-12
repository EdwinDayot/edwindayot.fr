# Le jardin des jours tranquilles

Accueil jouable en Three.js, entièrement statique, sans compte ni serveur de jeu. Le portfolio factuel est conservé sur `/portfolio/`. Les anciennes ancres (`/#projets`, `/#plant-calendar`, `/#parcours`, etc.) redirigent vers cette page. Sans JavaScript ou WebGL, l’identité d’Edwin et un lien vers le portfolio restent visibles. Le portfolio reste lisible sans JavaScript.

## Table des matières

- [Boucle de jeu](#boucle-de-jeu)
- [Commandes et interface](garden-structure.md#commandes-et-interface)
- [Visiteurs et progression](#visiteurs-et-progression)
- [Construction et réseaux](garden-structure.md#construction-et-réseaux)
- [Architecture](garden-structure.md#architecture)
- [Lumière et horloge](#lumière-et-horloge)
- [Sauvegardes et absence](#sauvegardes-et-absence)
- [Vérifications reproductibles](#vérifications-reproductibles)
- [Résultats locaux du 10 septembre 2026](#résultats-locaux-du-10-septembre-2026)
- [Vérification locale du 11 septembre 2026 — jardin vivant](#vérification-locale-du-11-septembre-2026-—-jardin-vivant)

## Boucle de jeu

Explorer, couper du bois, piocher la pierre, creuser l’argile et découvrir des graines, planter, récolter sans arracher, échanger, aménager puis automatiser. Aucun soin ne crée de monnaie. Les espèces ne meurent pas et les productions attendent sans expiration (trois objets par plante).

Départ : un Pilea adulte avec une bouture prête, deux pots vides, deux graines de chacune des trois premières espèces, un arrosoir plein, une hache, une pioche, une pelle et les matériaux d’un pot. L’inventaire empile les objets sans limite de cases.

Les quatre zones ouvrent progressivement douze espèces. Chaque zone apporte douze places de pots, jusqu’à 48 pots et 192 autres éléments. Les objets rangés comptent dans ces limites et conservent leur contenu. Une plante ou un travail de multiplication rangé est en pause.

Les rythmes et préférences sont des simplifications ludiques. La première germination arrive après environ 26 secondes d’humidité favorable. Le Pilea devient adulte en environ trois minutes ; les espèces suivantes demandent environ quatre à douze minutes. Soleil, ombre et humidité influencent la vitesse, sans dégâts irréversibles.

## Visiteurs et progression

Léa propose trois demandes sans expiration portant sur des productions découvertes. Remplacement gratuit. Un échange donne 18 feuilles, une graine de la même espèce et un point de réputation. Le premier ajoute les plans de citerne, tuyau et goutteur ainsi que des matériaux et une lanterne.

Noé propose un pot à acheter et l’accès à l’atelier. Les équipements restent aussi fabricables. Iris accompagne le carnet et récompense les collections de 3, 6, 9 et 12 espèces. Les caches d’exploration se découvrent une fois ; les espèces obtenues deviennent ensuite reproductibles.

Les ressources sont réparties sur 85 sites permanents : 53 arbres, 16 veines de pierre et 16 bancs d’argile, avec chaque type présent dans les quatre zones. Tous les arbres, y compris ceux du sous-bois, peuvent être coupés.

| Ressource | Outil  | Gestes | Renouvellement |
| --------- | ------ | ------ | -------------- |
| Bois      | Hache  | 3      | 120 secondes   |
| Pierre    | Pioche | 4      | 100 secondes   |
| Argile    | Pelle  | 3      | 90 secondes    |

Chaque site donne trois unités uniquement au dernier geste. Le travail partiel est sauvegardé. Les gestes sont espacés d’au moins 0,65 seconde ; une mauvaise cible, un outil incorrect ou un geste trop rapide ne donne rien. Souches, éclats et excavations restent visibles pendant le renouvellement. Les souches et les veines gardent leur empreinte au sol pour que la repousse ne puisse pas bloquer le personnage. Le renouvellement avance aussi pendant l’absence. L’eau est gratuite au ponton. Le paquet de secours est gratuit lorsqu’il ne reste aucune plante ni graine/jeune plant utilisable.

## Lumière et horloge

Le cycle dure 1 200 secondes de simulation : `θ = 2π × temps / 1200 + π/4`, avec la direction normalisée `(cos θ, sin θ, 0.35 × cos θ)`. Une nouvelle partie commence le matin. Jour et nuit durent chacun dix minutes. La fraction de seconde, la pause, les sauvegardes et le rattrapage pilotent cette même horloge. Ce cycle est visuel : croissance et irrigation conservent leurs règles de parcelle.

Le soleil et la lune opposée modifient continuellement l’intensité, la teinte, l’ambiance, le ciel et le brouillard. Le soleil ne fournit aucune lumière sous l’horizon. Les cartes d’ombres suivent la vue avec une marge de neuf unités pour les objets hors champ et une projection calée sur les texels ; construction et inspection adaptent leur étendue. Le feuillage qui s’efface conserve une silhouette dédiée aux ombres. Les aperçus de construction ne projettent pas d’ombres et les propriétés de projection/réception sont séparées dans les lots instanciés.

À la tombée du jour, les lanternes deviennent lumineuses et leurs halos apparaissent. Quatre lumières locales au maximum éclairent la zone observée, dont les deux plus proches projettent des ombres sur ordinateur, une sur mobile. Le choix conserve une marge d’hystérésis. Leurs cartes font 512 px, puis 256 au niveau bas. La variation d’intensité partage les matériaux sans reconstruire les lots. Un indicateur soleil/lune accompagne le compteur, dont la monnaie, les coûts et récompenses sont dessinés avec une feuille et le montant ; les libellés accessibles conservent le mot « feuilles ».

## Sauvegardes et absence

La clé `edwin-garden-v3` contient inventaire, entités identifiées, plantes, parcelles, raccords, demandes, découvertes, réputation, réglages, position du personnage, barre rapide et date de simulation. La dernière copie valide est conservée sous `edwin-garden-v3-backup`.

La migration lit `edwin-garden-v2` et en conserve une copie brute sous `edwin-garden-v2-backup` avant écriture. Elle conserve les six pots, espèces, croissance, humidité, eau et monnaie ; les pots améliorés deviennent des pots à réserve et gardent leur niveau d’origine dans les données de migration. Les données brutes des anciens pots restent dans la sauvegarde.

Les parties v3 antérieures sont adaptées au terrain élargi et aux nouveaux sites via le marqueur de paysage 4 : délai de renouvellement et travail partiel conservés, nouveaux sites ajoutés sans crédit de matériaux, objets et plantes conservés, barre rapide initialisée si absente.

Sauvegarde après chaque commande réussie, toutes les cinq secondes et à la sortie. Export JSON, import après validation et confirmation, restauration de la copie précédente. Une erreur de stockage laisse le jeu utilisable en mémoire avec un message invitant à exporter.

Le rattrapage réutilise exactement les pas de simulation actifs, avec les stocks et capacités existants, dans une limite de huit heures. Une date future ne donne aucune avance. Le rattrapage est sauvegardé immédiatement pour ne pas être crédité à nouveau au rechargement. Un import restaure un instantané sans lui ajouter de rattrapage. La reprise présente les nouvelles productions et les installations en attente.

## Vérifications reproductibles

```sh
npm ci
npx playwright install chromium
npm test
python3 -m http.server 4174 --directory public
# Dans un autre terminal :
npm run test:browser
npm run test:visual
```

`GARDEN_URL` cible une autre instance locale. Sur macOS, les tests utilisent ANGLE Metal ; `GARDEN_ANGLE=swiftshader` permet le diagnostic en rendu logiciel. Les captures et rapports vont dans `/tmp/garden-*.png`, `/tmp/garden-browser-result.json` et `/tmp/garden-performance.json`.

`npm test` vérifie les transactions, les sauvegardes, la migration, les accès, la conservation lors des déplacements, les découvertes, les réseaux, la saturation, la multiplication, le rattrapage et les géométries botaniques. Le scénario de vingt minutes utilise une nouvelle sauvegarde et uniquement les commandes du jeu, sans crédit de ressources de test : échange à 3 min, pot à 4 min, sous-bois à 7 min, irrigation à 12 min. La fin de la session vérifie la production avec irrigation.

Le parcours navigateur joue une partie réelle par les commandes clavier, souris et tactiles : déplacement sans clic initial, affectation et échange des raccourcis, plantation, récolte, coupe/pioche/creusage avec action maintenue, vérification du gain unique et de l’état épuisé, échange direct, fabrication à la pose, poses successives, rotation, marche pendant la construction, citerne remplie et raccordée dans le monde, conservation des liens lors d’un déplacement, rangement/repose et coupe d’arbre tactile, rechargement, portfolio et anciennes ancres. L’extension et son financement sont vérifiés dans le parcours de simulation de vingt minutes. Les réglages Canvas, le son, l’export, le refus d’un import invalide, la confirmation d’un import valide et la disparition d’un arbre du paysage après coupe sont également vérifiés. Les replis sans JS et sans WebGL sont vérifiés. Les quatre articles de projets sont comparés à des empreintes SHA-256 prises avant leur déplacement.

Les tests de sens d’eau couvrent les raccords inversés, les branches sans demande, les cycles, plusieurs consommations, les citernes vides/pleines et la simulation hors ligne. `garden-flow.cjs` vérifie aussi dans WebGL le mouvement des gouttes, l’orientation des flèches, l’arrêt immédiat après déconnexion et le mode de mouvement réduit.

Le test `garden-size.cjs` vérifie 252 combinaisons (12 espèces, 3 stades de croissance, 7 distances/zooms) : le modèle et ses dimensions dans le monde restent identiques lors des déplacements et changements de vue, et la croissance continue de modifier sa taille.

Le test visuel inspecte les douze silhouettes à plusieurs tailles/stades puis mesure une scène de 48 pots et 192 décorations avec le HUD Canvas actif. Cette scène de charge est un jeu de données de test distinct de la partie économique.

## Résultats locaux du 10 septembre 2026

- 26 tests de règles/géométrie, contrôles HTML/liens et préservation des contenus : passent.
- Parcours Chromium ordinateur et tactile, y compris Nginx/CSP : passent sans erreur applicative de console.
- Image Docker locale et `nginx -t` : passent. Aucun déploiement OVH effectué.
- Charge maximale, Apple M5 Max via ANGLE Metal, résolution de rendu 1440 × 900, ombres désactivées : environ 60 images/s, 67 appels de dessin et 1 142 490 triangles dans la mesure. Huit heures simulées en environ 180 ms.
- Le diagnostic antérieur en SwiftShader atteignait environ 8 images/s : c’est du rendu logiciel, pas une mesure de téléphone ; cette mesure précède l’agrandissement du terrain.
- Les commandes mobiles sont vérifiées en émulation Chromium. L’objectif de 30 images/s sur un téléphone physique de milieu de gamme reste à mesurer sur cet appareil ; il n’est pas présenté comme acquis.

La bibliothèque Three.js existante émet son avertissement de dépréciation du bundle classique r150+ dans les tests Node. Le bundle local a été conservé pour éviter une migration de moteur hors du périmètre.

## Vérification locale du 11 septembre 2026 — jardin vivant

- 33 tests de règles et géométrie passent, avec refus atomiques, durée exacte, récupération unique, travaux rangés/prêts sauvegardés, équivalence active/hors ligne et invariance des cultures/eau lors du calcul solaire.
- Parcours Chromium ordinateur et tactile : interactions existantes, choix/confirmation/récupération à l’établi, inspection des douze espèces, rotation, immobilité, retour caméra, pause et mouvement réduit. Captures des citernes à 0, 16, 80 et 160 unités sous quatre angles, de l’aube, du midi, du couchant et de la nuit dans `/tmp/garden-*.png`.
- `garden-shadows.cjs` compare les pixels avec et sans ombre locale : les objets occultent bien les lanternes. Il vérifie aussi l’absence d’ombre des aperçus, la stabilité des lots lors d’un changement d’intensité et la descente jusqu’à 512/256 px sans désactiver les ombres.
- Charge maximale : 48 pots et 192 décorations, Canvas actif, Apple M5 Max via ANGLE Metal, rendu 1440 × 900. Sur deux fenêtres de 14 secondes : environ 60,1 images/s le jour et 59,0 la nuit, ombres célestes à 2 048 px, deux ombres locales la nuit, 107 appels de dessin et 1 165 416 triangles pour la vue principale. Rattrapage de huit heures : environ 272 ms. Rapport `/tmp/garden-performance.json`.
- Les vérifications mobiles utilisent l’émulation Chromium sur ce même ordinateur. Les performances d’un téléphone physique restent à mesurer.
- Livraison exclusivement locale sur `http://127.0.0.1:4175` : image précédente `edwindayot-garden:rollback-20260911-living`, code précédent `/tmp/garden-before-living-20260911.tar` et configuration Nginx correspondante dans `/tmp`. Portfolio et sauvegardes navigateur préservés ; aucun déploiement OVH.
