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

## 2026-10-02 — C7.34 : le grep « anti-hallucination » cité dans le backlog pour cet epic était faux

**Constat, vérifié par commande, pas supposé.** L'entrée de **C7.34** dans `campagne-backlog.md`
(lot Cartographe du 2026-09-28) affirme, sous « Vérifié à l'instant par lecture directe, pas
supposé » : « `grep -rni "season" public/garden-state-cmd-*.js` → vide ». Rejoué à l'identique en
implémentant cet epic : `grep -rni "season" public/garden-state-cmd-*.js` renvoie en réalité une
occurrence réelle, `public/garden-state-cmd-f.js:395: "jeanneReconstitutionSeason",`. La commande
citée dans le backlog n'a soit jamais été exécutée telle quelle, soit mal lue — exactement le
risque que l'étape 3 de ce prompt et la discipline « vérifié veut dire exécuté, pas plausible »
existent pour attraper, ici trouvé dans l'epic `todo` lui-même plutôt que dans un epic déjà `fait`.

**Gravité réelle, vérifiée avant toute conclusion.** `jeanneReconstitutionSeason` est le nom d'un
flag de révélation narrative (chapitre 15, `Narrative.pendingReveal`), jamais une lecture de
`GardenCampaignSeasons`/`seasonForDay`/`campaignDay`. Sa condition de révélation réelle, relue
directement (`garden-state-cmd-f.js`, juste avant cette ligne), ne teste que
`campaignFlags.some/includes` et `s.rainelles.length` — aucune saison. La garantie de fond que
C7.34 cherche à verrouiller (aucune porte de chapitre ne lit la saison) reste donc vraie ; seule
l'affirmation « grep → vide » du backlog, telle quelle, était fausse.

**Action prise ce déclenchement.** Le nouveau test (`tests/campaign-season-quest-nonblocking.cjs`)
n'a pas recopié l'affirmation fausse du backlog : il effectue le même grep pour de vrai, échoue
d'abord dessus (observé réellement, pas supposé), puis adopte une liste blanche explicite et
vérifiable d'un seul nom (`jeanneReconstitutionSeason`), avec son propre test dédié qui relit la
condition de révélation réelle et casse si elle venait un jour à mentionner une saison. Rejoué en
cassant chacune des deux assertions séparément (grep nu, puis la condition elle-même) : les deux
échouent bien avant restauration à l'identique — voir l'entrée de `docs/campagne.md` pour ce même
epic, section « gate revérifié ». Aucun fichier de production modifié par cette anomalie elle-même
(seule la description de l'epic dans `campagne-backlog.md` contenait l'affirmation fausse ; elle
n'est pas réécrite rétroactivement ici pour préserver l'historique exact du lot Cartographe —
seule cette entrée d'anomalie et l'entrée `fait` de C7.34 documentent la correction).

**Ce qu'un futur déclenchement doit faire.** Ne jamais recopier une commande de vérification citée
dans un epic `todo` sans la rejouer soi-même avant de bâtir dessus, même quand elle est présentée
comme « vérifié à l'instant » par le lot Cartographe qui l'a écrite — la même règle que l'étape 3
de ce prompt impose déjà pour le dernier epic `fait`, étendue ici par prudence à toute affirmation
de commande rencontrée dans le backlog, pas seulement celles d'un epic déjà clos.
