---
title: Câblage et variables
description: Comment les données circulent entre les nodes — transitions, variables de workflow, et le modèle readsFrom / writesTo.
sidebar:
  order: 3
---

Les données circulent entre les nodes de deux façons, toutes deux éditées dans la section **Câblage** de l'inspecteur (« Brancher les entrées et sorties à des variables du workflow. ») :

- **Transitions** — les arêtes du canevas. Un port d'entrée peut lire directement la **transition amont** (l'artifact produit par le step précédent).
- **Variables de workflow** — des slots d'état nommés qu'un step peut lire (`readsFrom`) ou écrire (`writesTo`), ce qui découple un producteur de ses consommateurs.

:::note[Deux sens du mot « variable »]
Cette page traite des **variables de workflow** — les slots d'état nommés gérés via le bouton **Variables**. Elles sont distinctes des **variables de template**, les placeholders `{{variable}}` à l'intérieur d'un [Markdown Template](/fr/nodes/markdown-template/) ou d'un body de skill — ceux-là sont couverts dans [Variables de template](/fr/features/variables/). Un `{{placeholder}}` devient un *port* d'entrée, que l'on peut ensuite câbler à une variable de workflow ici.
:::

## La section Câblage

Pour le node sélectionné, l'inspecteur liste :

- **Entrées** — une ligne par port d'entrée. Chacune offre un menu réglé sur **— transition amont —** (prendre la sortie du step précédent) ou sur une **variable de workflow** compatible. Les ports sont filtrés par le `kind` d'artifact qu'ils acceptent.
- **Sorties** — une ligne par port de sortie. Chacune écrit dans une variable de workflow choisie, ou **— aucune —**.

Un step passthrough (sans artifact produit) affiche _« Passthrough — aucun artifact produit. »_ ; un step sans entrée ni sortie affiche _« Cette étape n'a ni entrée ni sortie. »_

Sur le canevas, une **pastille de variable** est dessinée le long de l'arête pour montrer quelle variable circule dans une connexion.

## Gérer les variables

Le bouton **Variables** de la barre d'outils (avec le compte des variables déclarées) ouvre le gestionnaire — on recherche les variables existantes ou on **Crée une variable**. Chaque variable a :

| Champ | Rôle |
| --- | --- |
| **Nom** | L'identifiant (ex. `ticketDescription`). |
| **Kind** | Le kind d'artifact qu'elle porte — contraint les ports câblables. |
| **Description** | Note libre optionnelle. |
| **Valeur par défaut** | Optionnelle ; matérialisée au lancement avant tout step (un step producteur l'écrase ensuite ; pas de reset par tour de boucle). |
| **Rôle** | L'interface sous-workflow : **Interne** (privée), **Entrée** (fournie par l'appelant) ou **Sortie** (exposée à l'appelant). Les rôles Entrée/Sortie rendent le template invocable comme sous-workflow via [`workflow.call`](/fr/nodes/workflow-call/). |
| **Demander au lancement** | Demander la valeur au lancement d'un run. Une variable écrite par un step ne peut pas être une variable de lancement ; une entrée requise (sans valeur par défaut) rend le template non invocable comme sous-workflow et non planifiable tant qu'elle n'a pas de défaut. |

## Voir aussi

- [Variables de template](/fr/features/variables/) — le mécanisme des placeholders `{{variable}}` (un concept différent).
- [Ajouter et configurer des nodes](/fr/template-editor/nodes-and-inspector/) — où vit la section Câblage.
- [Sous-workflow](/fr/nodes/workflow-call/) — consomme les variables Entrée/Sortie d'un template comme interface.
