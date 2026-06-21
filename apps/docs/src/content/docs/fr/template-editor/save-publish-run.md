---
title: Sauvegarder, publier, lancer
description: Identité du template, brouillon vs publié (immuable), dépendances, et lancement d'un run.
sidebar:
  order: 4
---

Une fois le graphe câblé, la barre de titre et la barre d'outils transforment le template en quelque chose de sauvegardé, publiable et exécutable.

## Identité du template

La **barre de titre** édite l'identité du template en place : son **nom**, sa **référence (ID)**, sa **version** et une **description** (ouverte depuis la popover d'info). La référence et la version identifient ensemble le template à travers les runs et les appels de sous-workflow.

## Brouillons & publication

- **Sauvegarder le brouillon** persiste le template sur le disque ; son statut reste `draft` et il demeure éditable.
- **Publier** fige le template : _« Une ref publiée est immuable : pour itérer ensuite, bumpe la version (ex. v2), ce qui repart d'un brouillon. »_ Un template publié devient invocable comme sous-workflow via [`workflow.call`](/fr/nodes/workflow-call/). Une fois publié, le bouton de sauvegarde est verrouillé — _« Template publié (immuable) — change la version pour éditer. »_

Autres actions de la barre d'outils : **Recharger les données du template depuis le disque** (abandonne les modifications non sauvegardées) et **Tout effacer et repartir de zéro**.

## Dépendances

Un template peut référencer des ressources qui doivent exister dans votre environnement — des **skills** et des **artifact types**. La barre d'outils les expose :

- **Dépendances du template** — parcourir toutes les dépendances résolues.
- **Dépendances manquantes** — si une ressource référencée est absente (ex. après l'import d'un template depuis du JSON), une modale liste les skills et artifact types manquants et les steps qui les utilisent. Recréez les ressources ou remplacez les refs dans les steps concernés **avant publication**.

## Lancer un run

Le bouton **Lancer un run** ouvre une boîte de dialogue qui collecte les entrées nécessaires avant le démarrage :

- **Variables de lancement** — les [variables de workflow](/fr/template-editor/wiring-variables/) marquées **Demander au lancement** apparaissent comme des champs de formulaire (les requises sont badgées). Pré-remplies par leur valeur par défaut si présente.
- **Contenu d'entrée** — si le step d'entrée attend un artifact seed, on le fournit ici ; la boîte de dialogue indique le kind attendu. Un template qui ne nécessite aucune entrée le signale et démarre directement.

Cliquer sur **Démarrer** crée le run et bascule vers la vue des runs. Le lancement requiert un step d'**entrée** désigné (voir [Ajouter et configurer des nodes](/fr/template-editor/nodes-and-inspector/)).

## Voir aussi

- [Sous-workflow](/fr/nodes/workflow-call/) — comment un template publié est invoqué depuis un autre.
- [Invoquer un template](/fr/nodes/template-invoke/) — lancer une instance enfant isolée d'un template.
- [Câblage et variables](/fr/template-editor/wiring-variables/) — les variables de lancement viennent d'ici.
