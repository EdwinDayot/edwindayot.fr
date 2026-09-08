# Portfolio Edwin Dayot

Site statique HTML/CSS servi par Nginx dans Docker, derrière le Traefik existant sur l’alias SSH ovh. Conserver le nom de conteneur edwindayot-landing et le réseau traefik-public : ils servent au routage existant.

Ne pas inventer de chiffres, de responsabilités ni de captures produit. Les faits initiaux ont été tirés du cv.md de career-ops et validés dans le contexte utilisateur. Le test Cove à 10 000 abonnés et 10 000 groupes est un test en mémoire, pas un usage en production. Les produits Luni ne sont pas des créations indépendantes d’Edwin.

Avant déploiement : vérifier HTML, liens internes, docker compose config, nginx -t et réponse du nouveau conteneur ; sauvegarder le code et l’image existants pour rollback. Ne pas modifier les autres applications, sous-domaines, réseaux ou certificats du serveur. Garder les secrets hors Git.
