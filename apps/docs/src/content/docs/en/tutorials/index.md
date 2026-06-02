---
title: Tutorial
description: Learn CtxFirst by example — one complete workflow explained per page.
sidebar:
  order: 0
---

This section is a tutorial **by example**: each page rebuilds a complete workflow, from the first node to the run, explaining the wiring and config choices along the way.

Start with the simplest one, then ramp up.

## Examples

- **[Prompt → answer](/en/tutorials/user-input-claude-invoke/)** — the minimal workflow: a user input sent to a model. Two nodes, [User Input](/en/nodes/user-input/) and [Claude Code Invoke](/en/nodes/claude-code-invoke/).
- **[Generation with a validation loop](/en/tutorials/human-validation-loop/)** — the same flow, with human validation checked on the generation node and a loop that re-invokes it until a human approves.
- **[Merge two files for Claude](/en/tutorials/concat-files-claude/)** — load two files into variables, merge them with [Concat Markdown](/en/nodes/concat-markdown/), then send the result to the model.

> More examples will be added here, each in its own page under `src/content/docs/en/tutorials/`.
