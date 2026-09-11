# edwindayot.fr

Portfolio d’Edwin Dayot : Plant Calendar, Fate, Shorts et Cove. Site statique sans compilation, avec un jardin Three.js jouable. Contenu en français, détails de projets accessibles au clavier, métadonnées et sitemap.

## Prévisualisation

```sh
python3 -m http.server 4174 --directory public
```

Ouvrir http://localhost:4174 pour le jeu ou http://localhost:4174/portfolio/ pour les projets. Les sections de projets se développent via les éléments HTML natifs `details`.

## Docker / OVH

```sh
docker compose config -q
docker compose build
docker compose up -d --wait
```

Le réseau externe `traefik-public` doit déjà exister. Ce projet conserve le nom du conteneur `edwindayot-landing` attendu par le routage Traefik du serveur. Aucun port n’est publié directement. HTTPS est géré par Traefik.

Le déploiement de production utilise `/home/debian/edwindayot-landing`. Avant tout remplacement, archiver le dossier courant et étiqueter l’image actuelle. Pour revenir en arrière, restaurer le dossier sauvegardé puis relancer son ancien Compose en pointant vers l’image sauvegardée. Ne jamais lancer `docker compose down` sur les autres projets.

## Contenu

Le jeu occupe `public/index.html`. Modifier le contenu du portfolio dans `public/portfolio/index.html` et sa présentation dans `public/styles.css`. Les chiffres et responsabilités viennent du CV d’Edwin ; la charge testée sur Cove est explicitement distinguée d’une audience en production. La section des anciens services API a été supprimée.

## Direction visuelle

Les quatre projets restent dans le flux normal de la page. Le jardin utilise Three.js hébergé localement, des modèles botaniques originaux et des textures créées dans le code. Aucun modèle ne représente une capture produit. Le mouvement décoratif respecte la préférence de réduction des animations.

## Jardin et tests

Voir [le fonctionnement du jardin, les modèles et les tests](docs/garden.md). Les modules de `public/game/` séparent économie, progression, construction, irrigation, sauvegarde et rendu. La simulation reste exécutable sans WebGL. Le jeu propose douze espèces, quatre grandes parcelles dont un sous-bois arboré, des échanges et des équipements automatisés. Son interface est dessinée en Canvas : inventaire, fabrication, carte, carnet et commandes. Les 85 sites de ressources se travaillent à la hache, à la pioche ou à la pelle en maintenant E, le clic ou l’action tactile ; ils se renouvellent après 90 à 120 secondes. Déplacement immédiat avec ZQSD/flèches, barre rapide personnalisable `1–5`, inventaire `I`, action `E`, déplacement d’objet `F`. Les plans se construisent directement dans le monde ; les conduites et le niveau des citernes rendent l’irrigation visible.

`npm test` vérifie les règles. `npm run test:browser` joue un parcours desktop et mobile contre le serveur local. `npm run test:visual` produit des captures des douze espèces et mesure une scène de 48 pots et 192 décorations. La dépendance Playwright est réservée aux tests, et n’est pas copiée dans l’image Nginx.

## Déploiement reproductible

Après un commit, lancer `./deploy.sh`. Le script prépare et vérifie l’image sur OVH, sauvegarde le dossier et l’image précédents, puis remplace uniquement le conteneur du portfolio. Une erreur de démarrage déclenche le retour à l’image précédente. Vérifier ensuite https://edwindayot.fr et https://www.edwindayot.fr.

## Visuels produits

Captures et icônes récupérées le 8 septembre 2026 sur les fiches App Store fournies par Edwin. Sources exactes conservées dans `public/assets/sources.json`. Les captures sont affichées intégralement et hébergées localement. Elles illustrent les produits actuels, sans attribuer à Edwin toutes les fonctionnalités visibles. Le récit de ses contributions reste fondé sur le CV. Cove ne reçoit pas de fausse capture.
