---
title: Shell Exec
description: Le node Shell Exec — exécute une commande shell dans le cwd du workspace et branche selon son code de sortie.
---

`shell.exec`

**Shell Exec** exécute une commande dans le `cwd` du workspace et branche selon son code de sortie. Par défaut il route vers `success` (sortie 0) ou `failure` (tout le reste) ; avec une table `exitCodes` configurée, il route vers vos propres ports nommés. Il expose aussi toujours les flux bruts `stdout` et `stderr` sur des ports dédiés.

Il s'exécute dans le `cwd` du workspace : il faut donc un [Workspace Set](/fr/nodes/workspace-set/) (ou un [Git Worktree Create](/fr/nodes/git-worktree-create/)) en amont — le runner échoue si aucun `cwd` n'est posé.

![Le node Shell Exec dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `context` | `*` | **Optionnel**, primaire. Permet d'ancrer le step dans le DAG. Son contenu **n'est pas** interpolé dans la commande (pas de substitution input → commande en V1). |
| Sortie | `success` | `Markdown` | Mode par défaut, primaire. Émis quand la commande sort en `0`. |
| Sortie | `failure` | `Markdown` | Mode par défaut. Émis sur toute sortie non nulle (timeout / signal inclus). |
| Sortie | `<nommé>` | `Markdown` | Mode configuré. Avec `exitCodes`, la paire `success`/`failure` est remplacée par vos ports nommés, dont un catch-all. |
| Sortie | `stdout` | `Markdown` | Flux stdout verbatim. **Toujours** produit. |
| Sortie | `stderr` | `Markdown` | Flux stderr verbatim. **Toujours** produit. |

Exactement un port de branche est émis par run (mutuellement exclusifs) ; les ports de branche non produits sont propagés en skip vers l'aval. `stdout` et `stderr` sont produits à chaque run, quelle que soit la branche prise.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `command` | `string` \| `string[]` | `""` | La commande à exécuter (chaîne, ou tableau argv). **Obligatoire**, non vide. `sudo`, `rm -rf /` et les octets NUL sont refusés d'emblée. |
| `useShell` | `boolean` | `false` | Exécute via un shell (`shell: true`). À `false`, la commande est lancée directement (pas de shell implicite). |
| `subdir` | `string` | — | Sous-dossier du `cwd` du workspace où s'exécuter. Ne peut pas s'évader du workspace (confinement vérifié). |
| `env` | `Record<string, string>` | — | Variables d'environnement additionnelles, fusionnées sur un env de base filtré (les secrets ne fuient pas par défaut). |
| `timeoutMs` | `number` | `60000` | Timeout en temps réel, borné à `1000..600000`. |
| `maxOutputBytes` | `number` | `262144` | Plafond de sortie par flux ; au-delà le flux est tronqué (un flag `truncated` est enregistré). Minimum `1024`. |
| `stdin` | `string` | — | Texte écrit sur le stdin de l'enfant. |
| `exitCodes` | `object` | — | Mappe des ports nommés → codes de sortie (ex. `{ "ok": [0], "rebase": [1], "other": "*" }`). Au moins 2 ports ; exactement un catch-all `"*"` ; chaque code apparaît au plus une fois. Les noms de port `stdout`/`stderr` sont réservés. |

## Comportement à l'exécution

1. Le runner parse la config (échoue sur une `command` vide/invalide, une table `exitCodes` malformée, etc.) et applique les garde-fous (`sudo`, `rm -rf /`, octet NUL).
2. Il résout le `cwd` depuis le workspace (erreur si aucun — placer un [Workspace Set](/fr/nodes/workspace-set/) ou [Git Worktree Create](/fr/nodes/git-worktree-create/) en amont) et, si `subdir` est défini, vérifie qu'il reste dans le workspace.
3. Il construit un environnement filtré (fusion de `env`) et lance la commande (avec ou sans shell selon `useShell`), bornée par `timeoutMs`.
4. Il capture `stdout`/`stderr`, tronquant chacun à `maxOutputBytes`.
5. Il sélectionne le port de branche : par défaut `success` (sortie 0) / `failure` (sinon), ou le port nommé correspondant de `exitCodes` (repli sur le catch-all ; timeout/signal passent aussi par lui).
6. Il émet exactement un port de branche, plus les `stdout` et `stderr` toujours présents (chacun un artifact `Markdown` avec métadonnées `exitCode`, `signal`, `durationMs`, `truncated`, `cwd`).

## Exemples

### Lancer une suite de tests et brancher sur le résultat

- `command` : ex. `["npm", "test"]`, avec un [Workspace Set](/fr/nodes/workspace-set/) en amont fournissant le `cwd`.
- `success` → poursuivre le flux ; `failure` → [Human Gate](/fr/nodes/human-gate/) pour inspection humaine.
- Câbler `stdout` (ou `stderr`) vers un [Claude Code Invoke](/fr/nodes/claude-code-invoke/) pour que l'agent lise les logs.

Avec `exitCodes` à `{ "ok": [0], "lint": [1], "other": "*" }`, le node expose `ok`, `lint`, `other` au lieu de `success`/`failure`.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Workspace Set](/fr/nodes/workspace-set/) — pose le `cwd` dans lequel ce node s'exécute.
- [Git Worktree Create](/fr/nodes/git-worktree-create/) — une autre source du `cwd`.
- [Git Commit & Push](/fr/nodes/git-commit-push/) — un autre node dépendant du `cwd` qui branche sur son résultat.
