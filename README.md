# edwindayot.fr

Portfolio d’Edwin Dayot : Plant Calendar, Fate, Shorts et Cove. Site statique avec un petit script de progression au défilement, sans dépendance de compilation. Contenu en français, mise en page responsive, détails de projets accessibles au clavier, métadonnées et sitemap.

## Prévisualisation

```sh
python3 -m http.server 4174 --directory public
```

Ouvrir http://localhost:4174. Les sections de projets se développent via les éléments HTML natifs `details`.

## Docker / OVH

```sh
docker compose config -q
docker compose build
docker compose up -d --wait
```

Le réseau externe `traefik-public` doit déjà exister. Ce projet conserve le nom du conteneur `edwindayot-landing` attendu par le routage Traefik du serveur. Aucun port n’est publié directement. HTTPS est géré par Traefik.

Le déploiement de production utilise `/home/debian/edwindayot-landing`. Avant tout remplacement, archiver le dossier courant et étiqueter l’image actuelle. Pour revenir en arrière, restaurer le dossier sauvegardé puis relancer son ancien Compose en pointant vers l’image sauvegardée. Ne jamais lancer `docker compose down` sur les autres projets.

## Contenu

Modifier `public/index.html` et `public/styles.css`. Les chiffres et responsabilités viennent du CV d’Edwin ; la charge testée sur Cove est explicitement distinguée d’une audience en production. Les liens API préexistants sont conservés, sans garantie de disponibilité ajoutée. Aucune donnée de rémunération ou de disponibilité privée n’est publiée.

## Direction visuelle

Narration en quatre chapitres inspirée de scroll-world (oso95/scroll-world). La progression et les transitions sont réalisées en HTML/CSS/JavaScript ; aucune vidéo IA, scène 3D ou capture produit inventée. Le contenu reste lisible sans JavaScript et avec reduced-motion.

## Déploiement reproductible

Après un commit, lancer `./deploy.sh`. Le script prépare et vérifie l’image sur OVH, sauvegarde le dossier et l’image précédents, puis remplace uniquement le conteneur du portfolio. Une erreur de démarrage déclenche le retour à l’image précédente. Vérifier ensuite https://edwindayot.fr et https://www.edwindayot.fr.

## Visuels produits

Captures et icônes récupérées le 8 septembre 2026 sur les fiches App Store fournies par Edwin. Sources exactes conservées dans `public/assets/sources.json`. Les captures sont affichées intégralement et hébergées localement. Elles illustrent les produits actuels, sans attribuer à Edwin toutes les fonctionnalités visibles. Le récit de ses contributions reste fondé sur le CV. Cove ne reçoit pas de fausse capture.
