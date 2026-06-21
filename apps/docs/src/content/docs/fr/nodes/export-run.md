---
title: Export Run
description: Le node Export Run — capture l'intégralité du run en un seul artifact JSON autocontenu.
---

`export_run`

**Export Run** sérialise l'état complet du run dans lequel il s'exécute — events, executions, artifacts inline, sessions LLM, runs et boucles de feedback — et le stocke comme un unique artifact JSON `RunExport` autocontenu sur le port `bundle`. Le bundle se lit et se partage via le viewer d'artifacts existant.

Le snapshot est pris juste avant l'event de production de ce step, donc le bundle décrit tout l'historique « sauf la production de lui-même » (une self-reference documentée).

![Le node Export Run dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `trigger` | `*` | **Optionnel**, primaire. Permet d'ancrer le step n'importe où dans le DAG. Son contenu **n'est pas** consommé. |
| Sortie | `bundle` | `RunExport` | Primaire. Un bundle JSON autocontenu décrivant l'instance entière. |

## Configuration

Ce node ne prend aucune configuration.

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| — | — | — | Aucune clé configurable. |

## Comportement à l'exécution

1. Le runner exporte l'instance courante (`ctx.instanceId`) dans un objet bundle.
2. Il sérialise le bundle en JSON indenté.
3. Il le stocke comme artifact `RunExport` (`format: "json"`, `schemaVersion: 1`) sur le port `bundle`, avec les métadonnées `source` et `sizeBytes`.

## Exemple

Capturer un run complet pour partage ou débogage :

- Câbler l'input `trigger` depuis le dernier step significatif (n'importe où dans le DAG) pour que l'export tourne à la fin.
- Sortie `bundle` (`RunExport`) → l'ouvrir dans le viewer d'artifacts pour inspecter ou partager le run complet.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Shell Exec](/fr/nodes/shell-exec/) — un node dont les `stdout`/`stderr` apparaissent dans le run exporté.
- [Human Gate](/fr/nodes/human-gate/) — source amont fréquente du `trigger` en fin de flux.
