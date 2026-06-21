---
title: Le canevas
description: Naviguer dans le graphe de workflow — modes déplacement vs sélection, snap à la grille, auto-layout, groupes, notes et export.
sidebar:
  order: 1
---

Le canevas est le graphe React Flow au centre de l'éditeur. Il contient le marqueur d'entrée `Start`, les [nodes](/fr/nodes/overview/), les transitions entre eux, les [pastilles de variables](/fr/template-editor/wiring-variables/) qui circulent sur les arêtes, ainsi que des groupes et des notes optionnels.

## Navigation & modes

Le canevas a deux modes d'interaction, basculés depuis la barre d'outils :

- **Déplacement / pan** _(par défaut)_ — le clic-gauche maintenu déplace la vue ; un clic sur un node ou une arête le sélectionne.
- **Sélection (boîte)** — le clic-gauche maintenu trace un rectangle de sélection pour sélectionner plusieurs nodes (l'inclusion partielle compte) ; le clic milieu ou droit continue de déplacer la vue. Appuyer sur `Échap` pour quitter ce mode.

Le zoom se fait à la molette ; la minimap et les contrôles de zoom sont dans un coin du canevas.

## Snap à la grille

Un bouton de la barre d'outils aligne les nodes sur une grille pendant leur déplacement. Le **pas de la grille** (taille en pixels) se choisit dans le menu adjacent et est mémorisé par éditeur.

## Auto-layout

Trois actions de la barre d'outils réorganisent le graphe automatiquement (en tenant compte des groupes) :

- **Empiler verticalement** — flux de haut en bas.
- **Aligner horizontalement** — flux de gauche à droite.
- **Empiler en deux colonnes** — une disposition compacte sur deux colonnes.

## Groupes & notes

- **Groupes** — tracer un cadre autour d'un ensemble de nodes pour les regrouper visuellement ; le groupe peut être nommé et supprimé (les nodes à l'intérieur sont conservés).
- **Notes** — **Ajouter une note** dépose une annotation libre sur le canevas ; un bouton de la barre d'outils affiche ou masque toutes les notes. Les notes sont de la documentation : elles ne s'exécutent jamais.

## Plein écran & export

- Le **plein écran** étend l'éditeur à toute la fenêtre (`Échap` pour sortir).
- **Exporter le workflow** propose trois formats : **Exporter en JSON** (la définition du template, ré-importable), **Exporter en SVG** et **Exporter en PNG** (une image du graphe).

## Voir aussi

- [Câblage et variables](/fr/template-editor/wiring-variables/) — ce que signifient les transitions et les pastilles de variables.
- [Ajouter et configurer des nodes](/fr/template-editor/nodes-and-inspector/) — peupler le canevas.
- [Sauvegarder, publier, lancer](/fr/template-editor/save-publish-run/) — transformer un graphe en run.
