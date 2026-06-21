---
title: Nodes overview
description: Catalog of the nodes (step kinds) available in CtxFirst workflows.
---

This section lists the **nodes** — the building blocks of a workflow. Each node has its own page detailing its ports, configuration, and runtime behavior.

## What is a node?

A **node** (or _step kind_) is an executable step in a workflow. Each node declares:

- **input ports** — the [artifacts](/en/type-system/artifacts/) it consumes (with accepted [`kind`s](/en/type-system/kinds/));
- **output ports** — the artifacts it produces;
- a **config** — the step-specific parameters.

Nodes are wired together through their ports: one node's output feeds the next node's input. The workflow engine validates `kind` compatibility at wiring time — see [Compatibility & wiring](/en/type-system/compatibility/) for the rules, and the [Type system](/en/type-system/artifacts/) section for the underlying model.

## Catalog

The groups below follow the node picker's categories.

### Sources / Inputs

- **[User Input](/en/nodes/user-input/)** (`user.input`) — capture the seed provided by the user.
- **[Skill Loader](/en/nodes/skill-loader/)** (`skill.loader`) — load a reusable prompt from the library.
- **[Load File](/en/nodes/file-load/)** (`file.load`) — read a single file (Markdown or JSON).
- **[Load Markdown File](/en/nodes/file-load-markdown/)** (`file.load-markdown`) — read a single Markdown file.
- **[Load Files](/en/nodes/files-load/)** (`files.load`) — read N files under a base directory.
- **[Load Files (manifest)](/en/nodes/files-load-manifest/)** (`files.load-manifest`) — read the files named in a JSONPath array.

### AI generation

- **[Claude Code Invoke](/en/nodes/claude-code-invoke/)** (`claude_code.invoke`) — delegate a task to Claude Code.
- **[Codex Invoke](/en/nodes/codex-invoke/)** (`codex.invoke`) — delegate a task to the Codex CLI.
- **[OpenRouter Invoke](/en/nodes/openrouter-invoke/)** (`openrouter.invoke`) — call a model through OpenRouter.
- **[LLM Judge](/en/nodes/llm-judge/)** (`llm.judge`) — evaluate content with an LLM, route approved/rejected/exhausted.
- **[Claude Code Judge](/en/nodes/claude-code-judge/)** (`claude_code.judge`) — agentic judge driven by a Skill.

### Transformation

- **[Concat Markdown](/en/nodes/concat-markdown/)** (`concat.markdown`) — concatenate several Markdown fragments.
- **[Markdown Template](/en/nodes/markdown-template/)** (`markdown.template`) — substitute `{{variables}}` into an inline template.
- **[Transform](/en/nodes/transform-run/)** (`transform.run`) — apply a saved parser to produce a new typed artifact.
- **[JSON Transform](/en/nodes/json-transform/)** (`json.transform`) — extract N JSONPath projections from a JSON payload.
- **[Render Markdown](/en/nodes/render-markdown/)** (`render.markdown`) — project any typed artifact into human-friendly Markdown.
- **[Sub-workflow](/en/nodes/workflow-call/)** (`workflow.call`) — inline another published template's graph.
- **[Invoke sub-template](/en/nodes/template-invoke/)** (`template.invoke`) — spawn an isolated child instance of another template.

### Flow / Control

- **[Branch](/en/nodes/branch-bool/)** (`branch.bool`) — route on a verdict value.
- **[Branch (JSON)](/en/nodes/branch-json/)** (`branch.json`) — route on a JSONPath field (deterministic, no LLM).
- **[Branch (match)](/en/nodes/branch-match/)** (`branch.match`) — route on a sum-type variant (advanced/engine kind).
- **[Select (Markdown)](/en/nodes/select-markdown/)** (`select.markdown`) — conditionally inject a Markdown fragment (passthrough, never branches).
- **[For each](/en/nodes/loop-foreach/)** (`loop.foreach`) — iterate over a list, fanning out the sub-graph.
- **[Collect](/en/nodes/loop-collect/)** (`loop.collect`) — aggregate the per-iteration outputs of a loop.
- **[Format Validate](/en/nodes/format-validate/)** (`format.validate`) — validate an artifact's format, route approved/rejected/exhausted.

### Human validation

- **[Human Gate](/en/nodes/human-gate/)** (`human.gate`) — human validation checkpoint.

### System / Execution

- **[Workspace Set](/en/nodes/workspace-set/)** (`workspace.set`) — set the working directory for subsequent native steps.
- **[Shell Exec](/en/nodes/shell-exec/)** (`shell.exec`) — run a shell command, branch on the exit code.
- **[Git Clone](/en/nodes/git-clone/)** (`git.clone`) — clone a remote repository.
- **[Git Commit & Push](/en/nodes/git-commit-push/)** (`git.commit_push`) — commit and push changes.
- **[Git Worktree Create](/en/nodes/git-worktree-create/)** (`git.worktree.create`) — create an isolated worktree and set the cwd.
- **[Git Worktree Remove](/en/nodes/git-worktree-remove/)** (`git.worktree.remove`) — remove a worktree (and optionally its branch).
- **[GitLab Files Fetch](/en/nodes/gitlab-files-fetch/)** (`gitlab.files.fetch`) — fetch N files from a GitLab repo.
- **[GitLab: create MR](/en/nodes/gitlab-mr-create/)** (`gitlab.mr.create`) — create a GitLab merge request.
- **[GitLab: merge MR](/en/nodes/gitlab-mr-merge/)** (`gitlab.mr.merge`) — merge a GitLab merge request.
- **[Webhook / HTTP call](/en/nodes/webhook-call/)** (`webhook.call`) — call a REST endpoint and store the response.
- **[Export Run](/en/nodes/export-run/)** (`export_run`) — snapshot the whole run as a self-contained JSON bundle.

> Plugin-provided nodes (e.g. Linear) ship with their plugin — see the [Plugins](/en/plugins/overview/) section.
