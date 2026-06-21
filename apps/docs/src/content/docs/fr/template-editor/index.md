---
title: Vue d'ensemble de l'éditeur
description: L'éditeur de template — le studio visuel où l'on construit un template (un workflow) à partir de nodes, où on les câble, puis où on lance un run.
sidebar:
  order: 0
---

L'**éditeur de template** est le studio visuel où l'on construit un **template** — un graphe de workflow fait de [nodes](/fr/nodes/overview/) câblés entre eux. On y ajoute des nodes, on les configure, on connecte leurs ports, puis on sauvegarde, publie et lance un run, le tout depuis le même écran.

![L'éditeur de template (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Disposition

L'éditeur s'organise en quatre régions :

| Région | Rôle |
| --- | --- |
| **Barre de titre** | L'identité du template — nom, référence (ID), version et description. Voir [Sauvegarder, publier, lancer](/fr/template-editor/save-publish-run/). |
| **Barre d'outils** | Actions et modes du canevas — ajouter des nodes, gérer les variables, auto-layout, groupes, notes, export, sauvegarde, publication, lancement d'un run. |
| **Canevas** | Le graphe React Flow — le marqueur d'entrée `Start`, les nodes, les transitions, les pastilles de variables, les groupes et les notes. Voir [Le canevas](/fr/template-editor/canvas/). |
| **Inspecteur** | Un panneau latéral droit redimensionnable qui configure le node ou la transition sélectionné. Voir [Ajouter et configurer des nodes](/fr/template-editor/nodes-and-inspector/). |

## Dans cette section

- **[Le canevas](/fr/template-editor/canvas/)** — navigation, modes déplacement vs sélection, snap à la grille, auto-layout, groupes, notes et export.
- **[Ajouter et configurer des nodes](/fr/template-editor/nodes-and-inspector/)** — la palette de nodes, l'inspecteur de step, la configuration par kind et le test d'un node dans le Studio.
- **[Câblage et variables](/fr/template-editor/wiring-variables/)** — connecter les ports via les transitions et les variables de workflow (`readsFrom` / `writesTo`).
- **[Sauvegarder, publier, lancer](/fr/template-editor/save-publish-run/)** — brouillons, publication et immuabilité, dépendances, et lancement d'un run.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/) — les briques que l'on assemble dans l'éditeur.
- [Tutoriel](/fr/tutorials/) — des workflows complets construits pas à pas dans l'éditeur.
- [Variables de template](/fr/features/variables/) — le mécanisme des placeholders `{{variable}}` (distinct des variables de workflow).
