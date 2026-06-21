---
title: Ajouter et configurer des nodes
description: La palette de nodes, l'inspecteur de step, la configuration par kind et le test d'un node dans le Studio.
sidebar:
  order: 2
---

Un template est fait de [nodes](/fr/nodes/overview/). On les ajoute depuis la palette et on configure celui qui est sélectionné dans l'inspecteur.

## Ajouter un node

Le bouton **Nodes** de la barre d'outils ouvre une palette avec recherche, regroupée par les mêmes catégories que le [catalogue des nodes](/fr/nodes/overview/) (Sources / Entrées, Génération IA, Transformation, Flux / Contrôle, Validation humaine, Système / Exécution). On filtre en tapant dans le champ de recherche, puis on **glisse un élément sur le canevas** pour le placer là où on le dépose, ou on clique pour l'ajouter.

Quand on lâche une transition sur une zone vide, un menu de **suggestion** (« Rechercher une étape… ») permet de créer un node compatible déjà câblé à cette arête.

## L'inspecteur

Sélectionner un node ouvre l'**inspecteur** en panneau latéral droit (tirer son bord gauche pour le redimensionner ; la largeur est mémorisée). Il s'organise en un en-tête et des sections repliables.

### En-tête

- **Sélecteur de kind** — changer le [kind](/fr/nodes/overview/) du node.
- **Définir comme entrée** / badge **Entrée** — marquer ce node comme l'entrée du workflow (là où démarre le [run](/fr/template-editor/save-publish-run/)).
- **Tester la node** — ouvre le Studio (voir plus bas).

### Sections

- **Configuration** — les paramètres propres au kind (ex. un sélecteur de modèle pour un node LLM, un chemin pour un chargeur de fichier). Les nodes sans paramètre affichent _« Aucun paramètre spécifique à configurer pour ce type d'étape. »_
- **Câblage** — connecter les ports du node aux transitions et aux variables de workflow. Voir [Câblage et variables](/fr/template-editor/wiring-variables/).
- **Comportement** — l'**Acteur**, l'interrupteur **Requiert une validation humaine** (transforme le step en point de contrôle [human gate](/fr/nodes/human-gate/)), et une **Note** libre attachée au step.
- **Avancé** — l'**Identifiant** du step (utilisé dans les transitions et par le moteur d'exécution) et son **Kind technique**.

## Éditer une transition

Sélectionner une arête affiche sa transition `source → cible`, un interrupteur **Loop** (une arête de feedback en pointillés qui relance le step — la base de la [boucle de validation](/fr/tutorials/human-validation-loop/)) et une action de suppression.

## Tester un node — le Studio

**Tester la node** ouvre le **Studio**, un panneau latéral qui exécute le node sélectionné isolément : on remplit ses entrées, on l'exécute, et on inspecte les artifacts produits et le temps écoulé — sans lancer tout le template. Certains effets ne sont pas reproduits dans le Studio (un changement de cwd via `workspace.set`, ou un step en attente de validation humaine) ; testez-les dans un vrai run.

## Voir aussi

- [Câblage et variables](/fr/template-editor/wiring-variables/) — connecter les ports vus ici.
- [Vue d'ensemble des nodes](/fr/nodes/overview/) — les ports, la config et le comportement de chaque node.
- [Le canevas](/fr/template-editor/canvas/) — disposer les nodes ajoutés.
