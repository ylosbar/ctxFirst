---
title: Nodes overview
description: Catalog of the nodes (step kinds) available in CtxFirst workflows.
---

:::caution[Draft]
This section lists the **nodes** — the building blocks of a workflow. A page per node (or per family) will detail inputs, outputs, and configuration.
:::

## What is a node?

A **node** (or _step kind_) is an executable step in a workflow. Each node declares:

- **input ports** — the artifacts it consumes (with accepted `kind`s);
- **output ports** — the artifacts it produces;
- a **config** — the step-specific parameters.

Nodes are wired together through their ports: one node's output feeds the next node's input. The workflow engine validates `kind` compatibility at wiring time.

## Catalog

### LLM & agents

- **[Claude Code Invoke](/en/nodes/claude-code-invoke/)** (`claude_code.invoke`) — delegate a task to Claude Code.
- **Codex Invoke** (`codex.invoke`) — delegate a task to Codex.
- **OpenRouter: Invoke** (`openrouter.invoke`) — call a model through OpenRouter.
- **LLM Judge** (`llm.judge`) — evaluate content against criteria.
- **[Skill Loader](/en/nodes/skill-loader/)** (`skill.loader`) — load a reusable skill.

### Files & content

- **[Load File](/en/nodes/file-load/)** (`file.load`) — read a single file.
- **Load Files** (`files.load`) — read N files under a base directory.
- **[GitLab Files Fetch](/en/nodes/gitlab-files-fetch/)** (`gitlab.files.fetch`) — fetch N files from a GitLab repo (remote `files.load`).
- **Concat Markdown** (`concat.markdown`) — concatenate several Markdown fragments.
- **Render Markdown** (`render.markdown`) — render a Markdown template.
- **Format Validate** (`format.validate`) — validate an artifact's format.
- **JSON Transform** (`json.transform`) — transform a JSON payload.

### Git & forge

- **[Git Clone](/en/nodes/git-clone/)** (`git.clone`) — clone a repository.
- **[Git Commit & Push](/en/nodes/git-commit-push/)** (`git.commit_push`) — commit and push changes.
- **Git Worktree Create / Remove** (`git.worktree.create`, `git.worktree.remove`) — manage an isolated worktree.
- **GitLab: create MR / merge MR / wait for pipeline** (`gitlab.mr.create`, `gitlab.mr.merge`, `gitlab.pipeline.wait`) — GitLab operations.

### Control flow

- **Branch** (`branch.bool`) — branch on a boolean condition.
- **Branch (match)** (`branch.match`) — branch on a match.
- **For each** (`loop.foreach`) — iterate over a list.
- **Collect** (`loop.collect`) — aggregate the results of a loop.
- **Sub-workflow** (`workflow.call`) — call another workflow.

### Human & I/O

- **[Human Gate](/en/nodes/human-gate/)** (`human.gate`) — human validation checkpoint.
- **[User Input](/en/nodes/user-input/)** (`user.input`) — collect user input.
- **Webhook: HTTP call** (`webhook.call`) — call an HTTP endpoint.
- **Shell Exec** (`shell.exec`) — run a shell command.
- **[Workspace Set](/en/nodes/workspace-set/)** (`workspace.set`) — set the working directory.
- **Export Run** (`export_run`) — export a run's artifacts.

> To detail: for each node, create a dedicated page in `src/content/docs/en/nodes/` (it will appear automatically in the sidebar).
