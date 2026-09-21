/* Campaign narrative layer: generic, reusable once-only text reveals (UMD: node module /
   browser GardenNarrative).

   Epic C4.1 (design §10, chapitre 1 "La clé sous le pot vide"): the first mechanism of its
   kind in the campaign layer — a catalog of short texts ({id, trigger, title, text}), each
   unlocked once when its `trigger` signal fires, recorded into s.campaignFlags (a flat set of
   already-seen text ids, same "flat unique list of strings" shape as s.campaignTools —
   see garden-state-validate.js). Built generic on purpose, not hard-coded to this one letter:
   the phase-4 backlog entry for this epic calls it out explicitly as "réutilisable par les
   chapitres suivants". A future chapter adds a TEXTS entry here and fires its `trigger` signal
   from its own command (see garden-state-cmd-n.js's chooseFurnitureTreatment for the only
   caller today) — no engine change required, same "generalise, not specialise" principle
   orchestration.md asks for.

   `trigger` is a plain signal string, not a predicate/expression language re-deriving a
   condition from state: the command that fires it already knows the condition holds (it just
   made it true), so there is nothing left for this module to re-check — deliberately not a
   scenario engine, per the epic's own critère de sortie. */
(function (root) {
  const TEXTS = {
    "alma-marques-meuble": {
      id: "alma-marques-meuble",
      trigger: "furnitureMarksChosen",
      title: "Lettre d’Alma",
      text: "Tu peux déplacer les meubles. Même ceux dont tu crois te souvenir exactement.",
    },
    // Epic C4.3 (design §10, chapitre 3) : révélée quand la serre est déverrouillée (le
    // déverrouillage de C4.2, "serre" dans reward.unlockHouseSpace, est le seul signal qui la
    // fait apparaître — voir garden-state-cmd-e.js).
    "serre-note-pot": {
      id: "serre-note-pot",
      trigger: "serreUnlocked",
      title: "Note dans la serre",
      text: "Deux graines. Une nuit. Regarder avant de décider.",
    },
    // Epic C4.3 : révélée par la commande meetIris (garden-state-cmd-n.js). Devient la condition
    // nécessaire et suffisante dont dépend C1.5 ("après le chapitre de botanique correspondant") —
    // C1.5 elle-même reste non implémentée par cet epic.
    "iris-epinglage": {
      id: "iris-epinglage",
      trigger: "irisPinningShown",
      title: "Iris et l’épinglage",
      text: "Un caractère déjà vu peut être fixé, pas seulement observé — regarde où la ressemblance ne bouge pas.",
    },
    // Epic C4.4 (design §10, chapitre 4) : révélée quand la rencontre scénarisée avec la
    // grenouille se résout réellement (garden-state-cmd-f.js, "sleep" — le même soir que le
    // croisement qui donne son feuillage à la Rainelle), jamais à l'armement (triggerFrogEncounter)
    // ni sur une nuit où l'essai n'a rien résolu. Le design décrit la scène en prose ("Au matin, le
    // joueur suit des traces mouillées jusqu'à un arrosoir déplacé.") sans la citer entre
    // guillemets comme la note de C4.3 — reformulation fidèle à la même image, même écart
    // documenté que "iris-epinglage" (C4.3) quand aucune citation exacte n'existe.
    "traces-mouillees": {
      id: "traces-mouillees",
      trigger: "frogEncounterResolved",
      title: "Traces mouillées",
      text: "Au matin, des traces mouillées mènent jusqu’à un arrosoir déplacé.",
    },
    // Epic C4.6 (design §10, chapitre 6, "On ne se fabrique pas tout seul") : révélée la toute
    // première fois qu'une tentative d'enseigner le verbe "multiplier" est refusée (teachGesture
    // ou demonstrateGesture, garden-state-cmd-j.js/-k.js — le refus déjà existant depuis C2.10,
    // Rainelles.MULTIPLY_REFUSAL), quel que soit le nombre de refus suivants. Le design est
    // explicite : "le jeu enseigne la manipulation sans certifier sa neutralité morale" — ce texte
    // constate ce que la Rainelle refuse et ce que le héros découvre pouvoir faire, sans jamais
    // dire si c'est bien ou mal.
    "on-ne-se-fabrique-pas-seul": {
      id: "on-ne-se-fabrique-pas-seul",
      trigger: "firstMultiplyRefusalSeen",
      title: "On ne se fabrique pas tout seul",
      text: "Elle refuse de se transformer elle-même, et refuse de le faire à une autre. Toi, personne ne t’a jamais refusé ce geste.",
    },
    // Epic C4.8 (design §10, chapitre 8, "La table longue") : révélée quand la quête
    // "table-longue-lea" (data-quests.js) est réellement complétée — signal générique
    // reward.narrativeFlag, garden-state-cmd-e.js. La fête, le décor et les tables eux-mêmes ne
    // sont pas construits par cet epic (voir sa propre entrée de campagne-backlog.md) : ce texte
    // ne raconte que ce qui est réellement vrai à ce stade, la réserve remplie, pas la fête.
    "table-longue-approvisionnee": {
      id: "table-longue-approvisionnee",
      trigger: "leaKitchenStocked",
      title: "La table longue",
      text: "La réserve de la cuisine ne manque plus de rien. Léa peut enfin penser à autre chose qu’au manque.",
    },
    // Epic C4.9 (design §10, chapitre 9, "Le chemin d'eau") : révélée quand la quête
    // "brume-d-ines" (data-quests.js) est réellement complétée — signal générique
    // reward.narrativeFlag, garden-state-cmd-e.js, même mécanisme que C4.8. Le texte reprend la
    // phrase du design quasiment mot pour mot et s'arrête là où elle s'arrête : "c'est un indice,
    // pas encore un discours" — aucun nom n'est ajouté ici, aucune explication du passé de Jeanne
    // au-delà de ce que le design rend déjà visible à ce stade.
    "chemin-eau-etiquette": {
      id: "chemin-eau-etiquette",
      trigger: "waterPathRestored",
      title: "Le chemin d’eau",
      text: "Une ancienne étiquette a été retournée. Dessous figure un autre nom de créatrice.",
    },
    // Epic C5.6 (design §10, chapitre 14 "La pause qui ne commence pas" ; design §11, scène de
    // référence du même nom) : révélée la toute première fois qu'une nuit résolue
    // (garden-state-cmd-f.js's "sleep") détecte au moins une Rainelle en persistance de geste
    // (campaign-scenes.js's detectPersistentGestures) — jamais à l'armement d'une veilleuse,
    // seulement au moment où le fait se produit réellement. Texte repris quasi mot pour mot de
    // l'exemple donné par le backlog lui-même pour cet epic : un constat factuel (« elle refait
    // le geste », « le panier est vide »), jamais une accusation portée sur le joueur ni un
    // diagnostic plaqué sur la Rainelle (design §11 : « le jeu ne prétend pas lire les
    // motivations ; il confronte des actions et leurs résultats »).
    "persistance-geste-vide": {
      id: "persistance-geste-vide",
      trigger: "persistentGestureDetected",
      title: "Le geste qui continue",
      text: "Elle refait le geste. Le panier est vide.",
    },
    // Epic C5.6 : révélée la première fois qu'une nuit résolue ne détecte aucune Rainelle en
    // persistance de geste alors qu'au moins une veilleuse a déjà réellement produit du travail
    // sur cette partie (campaignMemory.nightlyActivity non vide — le seul fait déjà existant
    // qui atteste qu'une veilleuse a été utilisée pour de vrai, plutôt que d'ajouter un nouveau
    // champ pour la seule occasion de ce texte). Même esprit que le texte de repli du design pour
    // le chapitre 13 : reconnaît un joueur attentif sans lui attribuer une vertu qu'aucun fait ne
    // prouve par ailleurs (design §11 : « une commande refusée ne devient jamais un dommage
    // fictif attribué au joueur », lu ici à l'identique dans l'autre sens : l'absence de dommage
    // devient un fait reconnaissable, pas supposé).
    "nuit-attentive-reconnue": {
      id: "nuit-attentive-reconnue",
      trigger: "attentiveNightRecognized",
      title: "Une communauté qui sait s’arrêter",
      text: "Aucun geste ne se répète devant un poste vide. La communauté sait déjà s’arrêter.",
    },
    // Epic C5.7 (design §11, "réparation... coût réel" ; design ch. 14, "elle interrompt une
    // première fois le geste, sans redevenir instantanément disponible") : révélée la toute
    // première fois qu'une Rainelle déjà vue en persistance de geste (C5.6) repasse à repos réel
    // après avoir cessé d'être sursollicitée — jamais au moment où le joueur coupe la veilleuse,
    // seulement quand le fait se produit réellement, une ou plusieurs nuits plus tard
    // (campaign-scenes.js's detectRepairedGestures, appelé depuis garden-state-cmd-f.js's
    // "sleep"). Texte factuel, jamais un texte de félicitations adressé au joueur (design §11 :
    // "le résultat de la réparation n'appartient pas entièrement au joueur") : il constate un
    // arrêt, pas une guérison ni un pardon accordé.
    "geste-qui-sarrete": {
      id: "geste-qui-sarrete",
      trigger: "persistentGestureRepaired",
      title: "Le geste qui s’arrête",
      text: "Elle s’assied près de l’eau. Le geste ne reprend pas.",
    },
    // Epic C6.1 (design §10, Acte IV, chapitre 10 "La bonne occasion") : révélée quand la quête
    // "occasion-de-basile" (data-quests.js) est réellement complétée — signal générique
    // reward.narrativeFlag, garden-state-cmd-e.js, même mécanisme que C4.8/C4.9. Le texte reprend
    // quasiment mot pour mot la phrase du design ("Ces solutions fonctionnent. Le joueur peut
    // refuser, étaler la production ou intensifier. La progression principale ne demande pas
    // d'exploiter pour avancer.") : il nomme les deux leviers déjà réels en moteur (C5.2/C5.4) et
    // affirme explicitement l'absence d'obligation, comme le critère de sortie de l'epic l'exige —
    // aucun jugement porté sur le joueur à ce stade (design §11 : la relecture potentiellement
    // coupable est un chantier de l'Acte V, chapitre 13, pas de ce chapitre 10).
    "la-bonne-occasion": {
      id: "la-bonne-occasion",
      trigger: "commercialSeriesProposed",
      title: "La bonne occasion",
      text: "Basile propose une série commerciale. Il montre les veilleuses de croissance et une prise d’eau à fort débit : ces solutions fonctionnent. Rien n’oblige à les activer — refuser, étaler la production ou intensifier restent trois choix ouverts.",
    },
    // Epic C6.3 (design §10, chapitre 11 "La nuit où tout continue") : révélée à la toute
    // première nuit résolue après que "la-bonne-occasion" (C6.1) a été vue — jamais avant (le
    // levier n'a pas encore été proposé), jamais une seconde fois ensuite (les cinq entrées
    // "bilan-matin-*" ci-dessous forment une seule famille mutuellement exclusive, voir
    // garden-state-cmd-f.js's own comment). Branche "sans intensification" : reprend
    // littéralement la phrase de clôture du chapitre 11 (design §10 : "le chapitre montre les
    // lieux préservés et la possibilité commerciale refusée").
    "bilan-matin-preserve": {
      id: "bilan-matin-preserve",
      trigger: "chapter11BilanPreserved",
      title: "Le bilan du matin",
      text: "Aucune veilleuse ni prise à fort débit n’a été activée cette nuit. Les lieux sont préservés ; la possibilité commerciale a été refusée.",
    },
    // Branche "intensification", sans aucun des deux signes déjà mesurables (design §11 :
    // "bassinCommunLevel... < capacité", "au moins un id dans persistentGestureIds") — le levier
    // vient d'être activé, rien ne le montre encore ailleurs dans le jardin. Jamais un texte qui
    // affirme un signe non encore vrai (design §11 : "le jeu ne prétend pas lire les motivations ;
    // il confronte des actions et leurs résultats").
    "bilan-matin-actif": {
      id: "bilan-matin-actif",
      trigger: "chapter11BilanActive",
      title: "Le bilan du matin",
      text: "Le travail a continué sous la fenêtre éteinte de la chambre. Le bilan commercial est excellent.",
    },
    // Mêmes quatre mots d'ouverture que "bilan-matin-actif" ci-dessus, avec le signe du bassin
    // commun en plus — mentionné seulement parce qu'il est vrai à cet instant précis
    // (bassinCommunLevel(s.campaignMemory) < BASSIN_COMMUN_CAPACITY, campaign-memory.js).
    "bilan-matin-actif-bassin": {
      id: "bilan-matin-actif-bassin",
      trigger: "chapter11BilanActiveBassin",
      title: "Le bilan du matin",
      text: "Le travail a continué sous la fenêtre éteinte de la chambre. Le bilan commercial est excellent. Le bassin commun est déjà plus bas qu’avant.",
    },
    // Même ouverture, avec le signe de persistance en plus — mentionné seulement parce qu'au
    // moins une Rainelle figure déjà dans campaignMemory.persistentGestureIds (C5.6/C5.7). Phrasé
    // au passé composé ("a déjà été vue reprenant"), jamais au présent continu : ce booléen ne
    // prouve que le fait s'est produit au moins une fois, jamais qu'il est encore en cours à
    // l'instant de ce bilan (une Rainelle détectée en persistance une nuit peut avoir été réparée,
    // C5.7, avant que ce texte ne se déclenche) — un présent continu affirmerait un fait non
    // garanti, contraire à design §11 ("le jeu ne prétend pas lire les motivations ; il confronte
    // des actions et leurs résultats").
    "bilan-matin-actif-persistance": {
      id: "bilan-matin-actif-persistance",
      trigger: "chapter11BilanActivePersistance",
      title: "Le bilan du matin",
      text: "Le travail a continué sous la fenêtre éteinte de la chambre. Le bilan commercial est excellent. Au moins une Rainelle a déjà été vue reprenant son geste devant un poste vide.",
    },
    // Même ouverture, les deux signes réunis. Même précaution de temps que ci-dessus pour le
    // signe de persistance.
    "bilan-matin-actif-complet": {
      id: "bilan-matin-actif-complet",
      trigger: "chapter11BilanActiveComplet",
      title: "Le bilan du matin",
      text: "Le travail a continué sous la fenêtre éteinte de la chambre. Le bilan commercial est excellent. Le bassin commun est déjà plus bas qu’avant, et au moins une Rainelle a déjà été vue reprenant son geste devant un poste vide.",
    },
    // Epic C6.5 (design §10, chapitre 12 "La variété suivante") : révélée à la même toute
    // première nuit que le bilan du chapitre 11 ci-dessus — même garde littérale du backlog,
    // "au premier sleep résolu après que le flag narratif de C6.1 a déjà été révélé" (voir
    // garden-state-cmd-f.js's own comment). Famille "variete-suivante-*" séparée et mutuellement
    // exclusive, jamais réévaluée ensuite. Branche "aucun contrat jamais signé" : reprend l'image
    // du design ("les futures demandes s'orientent vers une autre apparence... les commandes déjà
    // signées gardent leur prix") sans supposer qu'un contrat a jamais existé.
    "variete-suivante-refus": {
      id: "variete-suivante-refus",
      trigger: "chapter12NoContract",
      title: "La variété suivante",
      text: "La mode se tourne déjà vers une autre variété ; l’ancienne reste pleinement utile. Aucun contrat commercial n’a jamais été signé : les commandes ordinaires continuent, à prix inchangé.",
    },
    // Branche "un contrat a été signé, sans invendu réel mesurable pour son cultivar" — jamais un
    // texte de félicitations, un simple constat (design §11 : "il confronte des actions et leurs
    // résultats").
    "variete-suivante-sobre": {
      id: "variete-suivante-sobre",
      trigger: "chapter12SuccessSobre",
      title: "La variété suivante",
      text: "La mode se tourne déjà vers une autre variété ; l’ancienne reste pleinement utile. Les commandes déjà signées gardent leur prix. Le contrat signé n’a laissé aucun exemplaire sans preneur.",
    },
    // Branche "un contrat a été signé, avec au moins un spécimen réel encore invendu" — nomme le
    // fait factuellement, jamais une accusation portée sur le joueur (design §11, même posture
    // déjà appliquée à "bilan-matin-actif-*" pour le chapitre 11).
    "variete-suivante-invendus": {
      id: "variete-suivante-invendus",
      trigger: "chapter12SuccessInvendus",
      title: "La variété suivante",
      text: "La mode se tourne déjà vers une autre variété ; l’ancienne reste pleinement utile. Les commandes déjà signées gardent leur prix. Le contrat signé a réussi, mais des exemplaires produits pour l’occasion restent là, vivants, sans preneur.",
    },
    // Epic C6.5 : citation littérale du design (§10, chapitre 12 : « Une ancienne note d’Alma
    // apparaît : "La serre de Jeanne : après la prochaine commande." Puis une autre, à une date
    // ultérieure, avec la même phrase. »). Deux entrées séparées portant un texte identique,
    // jamais une seule révélée deux fois — pendingReveal refuse déjà par construction de révéler
    // un id déjà présent dans campaignFlags. La première se révèle au même sleep que les trois
    // branches ci-dessus ; la seconde, dans garden-state-cmd-r.js's deliverContract, au prochain
    // contrat honoré strictement après la première (voir son propre commentaire).
    "note-jeanne-serre-1": {
      id: "note-jeanne-serre-1",
      trigger: "jeanneGreenhouseNoteFirst",
      title: "Une note d’Alma",
      text: "La serre de Jeanne : après la prochaine commande.",
    },
    "note-jeanne-serre-2": {
      id: "note-jeanne-serre-2",
      trigger: "jeanneGreenhouseNoteSecond",
      title: "Une note d’Alma",
      text: "La serre de Jeanne : après la prochaine commande.",
    },
    // Epic C6.6 (design §10, chapitre 13 "Le premier non") : révélée la toute première fois
    // qu'un refus Rainelles.MULTIPLY_REFUSAL déjà existant (C2.10, teachGesture/demonstrateGesture)
    // survient sur une Rainelle qui porte alors un bourgeon (rainelle.bourgeon === true), une fois
    // qu'un des trois flags "variete-suivante-*" (C6.5) est déjà présent — jamais avant, id
    // distinct de "on-ne-se-fabrique-pas-seul" (firstMultiplyRefusalSeen, C4.6) qui a déjà pu être
    // consommé bien plus tôt et ne doit jamais se reproduire ici. Deux branches mutuellement
    // exclusives, comme "bilan-matin-*"/"variete-suivante-*" : jamais un score de vertu inventé,
    // seulement le fait déjà réel de s.campaignMemory.persistentGestureIds (C5.6). Citation
    // littérale du design pour le mouvement lui-même ("elle ramène le bourgeon près d'elle et se
    // place devant... c'est le mouvement déjà vu lors de son refus d'automultiplication") et pour
    // la garde contre l'accusation fabriquée ("sans lui attribuer des violences inexistantes").
    "premier-non-interrogation": {
      id: "premier-non-interrogation",
      trigger: "chapter13FirstNonQuestion",
      title: "Le premier non",
      text: "Elle ramène son bourgeon près d’elle et se place devant — le même mouvement que lors de son refus de se laisser multiplier. Ce n’est pas un secret qu’elle révèle ; c’est une limite qui avait peut-être un sens qu’on ne lui avait pas donné. Rien ici ne montre qu’elle ait été trop sollicitée : la question reste ouverte, sans qu’aucune violence ne lui soit attribuée.",
    },
    // Même branche que ci-dessus, avec le signe déjà réel de persistance en plus — constat
    // factuel, jamais une accusation (même posture que "bilan-matin-actif-persistance").
    "premier-non-signe": {
      id: "premier-non-signe",
      trigger: "chapter13FirstNonSign",
      title: "Le premier non",
      text: "Elle ramène son bourgeon près d’elle et se place devant — le même mouvement que lors de son refus de se laisser multiplier. Ce n’est pas un secret qu’elle révèle ; c’est une limite qui avait peut-être un sens qu’on ne lui avait pas donné. Au moins une Rainelle a déjà été vue reprenant son geste devant un poste vide : ce fait, déjà réel, ne devient pas une accusation.",
    },
    // Epic C6.7 (design §10, chapitre 15 "Alma n'a pas la réponse"): révélée au premier sleep
    // résolu une fois qu'un des deux flags "premier-non-*" (C6.6) et "note-jeanne-serre-2" (C6.5)
    // sont tous deux déjà présents et qu'au moins une Rainelle existe (garden-state-cmd-f.js).
    // Alma découvre une création du héros qu'elle ignorait ; le design est explicite qu'elle ne
    // peut ni l'expliquer ni absoudre le joueur — jamais un texte qui prétend le contraire.
    "alma-retour": {
      id: "alma-retour",
      trigger: "almaReturnDiscoversRainelles",
      title: "Alma n’a pas la réponse",
      text: "Alma revient déjeuner et découvre les Rainelles — une création du héros qu’elle ne connaissait pas. Elle ne peut pas en expliquer la volonté, ni absoudre ce qui a été fait en son absence.",
    },
    // Révélée à la même occasion que la précédente, jamais seule : les deux versants factuels
    // posés côte à côte, sans jugement moral porté par le jeu (design §11, "mémoire factuelle,
    // sans score de vertu").
    "reconstitution-jeanne": {
      id: "reconstitution-jeanne",
      trigger: "jeanneReconstitutionSeason",
      title: "Une saison, deux versions",
      text: "Avec Jeanne, on reconstitue une saison d’expansion de leur ancienne pépinière. Pour Alma, une réussite. Pour Jeanne, la disparition d’un projet qu’elles avaient porté ensemble.",
    },
    // Révélée par la commande restoreArchiveLabels (garden-state-cmd-s.js), refusée tant que
    // "alma-retour" n'a pas encore eu lieu. Citation littérale du design pour la phrase d'Alma.
    "archives-restaurees": {
      id: "archives-restaurees",
      trigger: "archiveLabelsRestored",
      title: "Les deux noms",
      text: "Les deux noms reprennent leur place sur les étiquettes. Alma reconnaît : « Au début, je ne savais pas. Ensuite, je savais surtout comment ne plus y penser. »",
    },
    // Epic C6.9 (design §10, chapitre 16 "Ce qu'on accepte de perdre" ; §11, tableau des trois
    // leviers, colonne "réparation avec coût réel"). Révélée depuis garden-state-cmd-t.js, gardée
    // sur "archives-restaurees" (C6.7, ancrage de séquencement de l'acte VI) et sur
    // Memory.contractsFed[contract.id] > 0 au moment de la réduction (une vraie production déjà en
    // cours, pas un contrat jamais entamé) — jamais une accusation rétroactive, seulement la prime
    // perdue, exactement "sans dette en cascade" lu littéralement (design §10).
    "levier-contrat-reduit": {
      id: "levier-contrat-reduit",
      trigger: "contractQuotaReducedWithCost",
      title: "Une commande réduite",
      text: "Le contrat est réduit : la prime des unités qui ne seront plus livrées est perdue, sans dette sur ce qui a déjà été livré.",
    },
    // Révélée depuis garden-state-cmd-p.js, gardée sur "archives-restaurees" et sur une vraie
    // transition true→false (jamais un appel qui ne change rien) à un moment où
    // Memory.nightlyActivity contient déjà au moins une entrée (même garde que
    // "nuit-attentive-reconnue", C5.6) — la veilleuse a réellement servi avant d'être coupée.
    "levier-veilleuse-coupee": {
      id: "levier-veilleuse-coupee",
      trigger: "veilleuseTurnedOffAfterUse",
      title: "Une veilleuse coupée",
      text: "La veilleuse s’éteint. Le repos qu’elle empêchait redevient possible, là où elle a réellement servi.",
    },
    // Révélée depuis garden-state-cmd-q.js, même discipline que "levier-veilleuse-coupee" :
    // transition true→false réelle, à un moment où Memory.waterWithdrawals[borneId] > 0 (la prise
    // a réellement prélevé de l'eau avant d'être restituée).
    "levier-prise-restituee": {
      id: "levier-prise-restituee",
      trigger: "priseFortDebitRestoredAfterUse",
      title: "Une prise restituée",
      text: "La prise à fort débit est restituée. Le bassin commun cesse de baisser, sans remonter aussitôt.",
    },
  };

  function findByTrigger(signal) {
    return Object.values(TEXTS).find((t) => t.trigger === signal) || null;
  }

  // Pure: the entry to record if `signal` fires and hasn't been seen yet, else null. Never
  // mutates campaignFlags itself — same "pure check here, caller mutates" split as
  // campaign-house.js's canRepair versus garden-state-cmd-l.js's repairHouseSpace.
  function pendingReveal(campaignFlags, signal) {
    const entry = findByTrigger(signal);
    if (!entry || campaignFlags.includes(entry.id)) return null;
    return entry;
  }

  const VARIETE_SUIVANTE_FLAGS = [
    "variete-suivante-refus",
    "variete-suivante-sobre",
    "variete-suivante-invendus",
  ];

  // Epic C6.6 (design §10, chapitre 13 "Le premier non"): pure gate + branch choice for the
  // MULTIPLY_REFUSAL reveal, shared by garden-state-cmd-j.js's teachGesture and
  // garden-state-cmd-k.js's demonstrateGesture — the two entry points that can produce that
  // refusal — so the gate ("un flag variete-suivante-* déjà présent", "la Rainelle porte un
  // bourgeon") and the branch choice (persistentGestureIds, C5.6, jamais un score de vertu
  // inventé) can never drift between them. Returns null when the gate isn't met yet, else the
  // signal to pass to pendingReveal.
  function chapter13Signal(campaignFlags, rainelle, campaignMemory) {
    if (!rainelle || rainelle.bourgeon !== true) return null;
    if (!VARIETE_SUIVANTE_FLAGS.some((f) => campaignFlags.includes(f)))
      return null;
    return campaignMemory.persistentGestureIds.length > 0
      ? "chapter13FirstNonSign"
      : "chapter13FirstNonQuestion";
  }

  const api = { TEXTS, findByTrigger, pendingReveal, chapter13Signal };
  if (typeof module !== "undefined") module.exports = api;
  else root.GardenNarrative = api;
})(globalThis);
