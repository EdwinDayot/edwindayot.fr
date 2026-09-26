# Anomalies de campagne

Journal des écarts constatés entre ce que `campagne-backlog.md`/`campagne.md` affirment et l'état
réel du dépôt, tel qu'exigé par `orchestration.md`/`execution-continue.md` (« vérifié veut dire
exécuté, pas plausible » ; anti-hallucination obligatoire en tête de chaque déclenchement).

## 2026-09-26 — Fusion de la phase 6 dans `main` jamais poussée vers `origin`

**Constat, vérifié par commande, pas supposé.** Au tout début de ce déclenchement (avant tout
nouveau travail), l'état du dépôt était : `HEAD` détaché sur le commit `ffdbe2c` (« Fusion de la
phase 6 (Campagne complète, actes IV à VI) dans main »), lui-même absent de tout ref — ni `main`
local, ni `origin/main`, ni `origin/maison-des-possibles` ne le contiennent (`git branch
--contains ffdbe2c` : vide ; `git merge-base --is-ancestor ffdbe2c origin/main` : faux). `main`
local et `origin/main` sont tous deux figés à `95ac4d9` (« Fusion de la phase 5... »).

Or l'entrée « fait » de l'epic **C6.29** dans `campagne-backlog.md` affirme explicitement :
« **Ferme la porte de sortie de la phase 6**... `maison-des-possibles` fusionnée dans `main`, les
deux poussées vers `github.com/EdwinDayot/edwindayot.fr`. » Cette dernière affirmation (les deux
poussées) est fausse à l'instant de ce déclenchement : `main` n'a jamais reçu la fusion de la
phase 6 sur `origin`. Un `git push` de `main` a manifestement été omis ou a échoué sans être
détecté par le déclenchement qui a créé ce commit.

**Pourquoi ceci n'a pas été traité comme l'anomalie de l'étape 3 de ce prompt.** L'étape 3 porte
spécifiquement sur *le dernier epic marqué « fait »* — au moment de ce déclenchement, **C7.3**
(bien après C6.29), dont le commit (`9c00aee`) et `npm ci && npm test` (909/909) ont été
re-vérifiés indépendamment et sont corroborés. Le contenu réel de C6.29 (le merge commit lui-même,
son message, les fichiers qu'il porte) n'est pas mis en doute : seule sa **poussée vers `origin`**
manque. Rétrograder C6.29 à `todo` serait disproportionné et casserait la dépendance de toute la
phase 7 (C7.1 à C7.4) sur une porte de phase par ailleurs correctement franchie sur
`maison-des-possibles`.

**Action prise ce déclenchement.** Aucune : conformément à `orchestration.md` (« la fusion vers
`main` se fait par jalon de phase... jamais à chaque epic pris isolément ») et à la règle absolue
de ce prompt limitant chaque déclenchement à un seul epic/lot, ce déclenchement ne pousse pas
`main` lui-même — l'epic choisi (C7.4) ne referme aucune porte de phase et ne justifie donc aucune
fusion vers `main` selon l'étape 7 du prompt. Le commit `ffdbe2c` reste préservé (objet git
existant, retrouvable par son hash, présent dans le reflog local) pour qu'un futur déclenchement
humain ou automatique puisse simplement le pousser (`git push origin main`, en repartant de
`ffdbe2c` ou en refaisant la fusion depuis l'état courant de `maison-des-possibles` si `main` a
divergé depuis) sans reperdre le travail de vérification déjà documenté dans `campagne.md` pour
cette porte de phase.

**Ce qu'un futur déclenchement doit faire.** Avant toute fusion de `main` pour une porte de phase
ultérieure (phase 7), vérifier explicitement que `main`/`origin/main` portent bien la fusion de la
phase 6 (`git merge-base --is-ancestor <hash de C6.29's merge> origin/main`) ; si ce n'est
toujours pas le cas, pousser d'abord ce rattrapage (fusion déjà faite localement, ou à refaire
depuis l'état courant si `ffdbe2c` a fini par être élagué) avant d'empiler une nouvelle fusion de
phase par-dessus un `main` qui n'a jamais reçu la précédente.
