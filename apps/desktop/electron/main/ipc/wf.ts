import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { WfEngine } from "../wf/composition-root";
import type {
  ArtifactId,
  SkillRef,
  StepExecId,
  StepId,
  WorkflowId,
} from "../wf/domain/ids";
import type { ArtifactKind } from "../wf/domain/artifact";
import type { Skill } from "../wf/domain/skill";
import type { WorkflowTemplate } from "../wf/domain/template";
import type { TemplateLayout } from "@shared/wf/layout";
import { renderArtifactMarkdown } from "@shared/wf/render-artifact-markdown";
import type {
  ArtifactSchemaRef,
  SaveUserArtifactSchema,
} from "../wf/domain/artifact-schema";
import type {
  ParserRef,
  SaveUserParser,
} from "../wf/domain/parser";
import type { RunParserInput } from "../wf/application/use-cases/run-parser";
import type { DebugStepInput } from "../wf/application/use-cases/debug-step";
import type { MoveEntityInput } from "../wf/application/use-cases/move-entity";
import type { ChannelDraft } from "../wf/domain/channel";
import type { ScheduleDraft, ScheduleId } from "../wf/domain/schedule";

type StartArgs = {
  templateRef: string;
  seeds: ReadonlyArray<{ kind: ArtifactKind; content: string }>;
  cwd?: string;
};

type DecisionArgs = { instanceId: string; stepExecId: string };
type LoopArgs = {
  instanceId: string;
  stepExecId: string;
  toStepId: string;
  reason: string;
  comments?: ReadonlyArray<{
    anchor: { startLine: number; endLine: number };
    body: string;
  }>;
};
type TimelineArgs = { instanceId: string };
type ArtifactArgs = { artifactId: string };
type TemplateArgs = { templateRef: string };

/* eslint-disable no-console */
const short = (s: string | undefined, n = 8) => (s ? s.slice(0, n) : "-");

export const registerWfHandlers = (win: BrowserWindow, engine: WfEngine) => {
  ipcMain.handle("wf:startInstance", async (_e: IpcMainInvokeEvent, args: StartArgs) => {
    console.log(
      `[wf:ipc] startInstance template=${args.templateRef} seeds=${args.seeds.length} cwd=${args.cwd ?? "-"}`,
    );
    try {
      const { instanceId } = await engine.startInstance(args);
      console.log(`[wf:ipc] startInstance → instance=${short(instanceId)}`);
      return { instanceId };
    } catch (err) {
      console.error("[wf:ipc] startInstance failed:", err);
      throw err;
    }
  });

  ipcMain.handle("wf:submitDecision", async (_e, args: DecisionArgs) => {
    console.log(`[wf:ipc] submitDecision instance=${short(args.instanceId)} exec=${short(args.stepExecId)}`);
    await engine.submitHumanDecision({
      instanceId: args.instanceId as WorkflowId,
      stepExecId: args.stepExecId as StepExecId,
    });
  });

  ipcMain.handle("wf:openLoop", async (_e, args: LoopArgs) => {
    console.log(
      `[wf:ipc] openLoop exec=${short(args.stepExecId)} to=${args.toStepId} reason="${args.reason.slice(0, 60)}" comments=${args.comments?.length ?? 0}`,
    );
    await engine.openFeedbackLoop({
      instanceId: args.instanceId as WorkflowId,
      stepExecId: args.stepExecId as StepExecId,
      toStepId: args.toStepId as StepId,
      reason: args.reason,
      comments: args.comments,
    });
  });

  ipcMain.handle("wf:getTimeline", async (_e, args: TimelineArgs) => {
    const view = await engine.getInstanceTimeline(args.instanceId as WorkflowId);
    console.log(`[wf:ipc] getTimeline instance=${short(args.instanceId)} → ${view ? `${view.executions.length} execs, status=${view.status}` : "null"}`);
    return view;
  });

  ipcMain.handle("wf:getInstanceTree", async (_e, args: TimelineArgs) => {
    const tree = await engine.getInstanceTree(args.instanceId as WorkflowId);
    const count = (n: typeof tree): number =>
      n ? 1 + n.children.reduce((acc, c) => acc + count(c), 0) : 0;
    console.log(
      `[wf:ipc] getInstanceTree instance=${short(args.instanceId)} → ${count(tree)} nodes`,
    );
    return tree;
  });

  ipcMain.handle("wf:getRunTokenUsage", async (_e, args: TimelineArgs) => {
    const usage = await engine.getRunTokenUsage(args.instanceId as WorkflowId);
    console.log(
      `[wf:ipc] getRunTokenUsage instance=${short(args.instanceId)} → ${usage.length} steps`,
    );
    return usage;
  });

  ipcMain.handle("wf:listInstances", async () => {
    const t0 = Date.now();
    const rows = await engine.listInstances();
    console.log(`[wf:ipc] listInstances → ${rows.length} rows (${Date.now() - t0}ms)`);
    return rows;
  });

  ipcMain.handle("wf:listAwaitingHuman", async () => {
    const t0 = Date.now();
    const rows = await engine.listAwaitingHuman();
    console.log(
      `[wf:ipc] listAwaitingHuman → ${rows.length} rows (${Date.now() - t0}ms)`,
    );
    return rows;
  });

  ipcMain.handle("wf:searchInstances", async (_e, args: { query: string }) => {
    const t0 = Date.now();
    const rows = await engine.searchInstances(args.query);
    console.log(
      `[wf:ipc] searchInstances q="${args.query.slice(0, 40)}" → ${rows.length} rows (${Date.now() - t0}ms)`,
    );
    return rows;
  });

  ipcMain.handle("wf:deleteInstance", async (_e, args: { instanceId: string }) => {
    console.log(`[wf:ipc] deleteInstance instance=${short(args.instanceId)}`);
    await engine.deleteInstance(args.instanceId as WorkflowId);
  });

  ipcMain.handle("wf:exportInstance", async (_e, args: { instanceId: string }) => {
    const t0 = Date.now();
    const bundle = await engine.exportInstance(args.instanceId as WorkflowId);
    console.log(
      `[wf:ipc] exportInstance instance=${short(args.instanceId)} → ${bundle.artifacts.length} artifacts, ${bundle.events.length} events (${Date.now() - t0}ms)`,
    );
    return bundle;
  });

  ipcMain.handle("wf:getTemplate", async (_e, args: TemplateArgs) => {
    const tpl = await engine.getTemplate(args.templateRef);
    console.log(`[wf:ipc] getTemplate ref=${args.templateRef} → ${tpl.steps.length} steps, ${tpl.transitions.length} transitions`);
    return tpl;
  });

  ipcMain.handle("wf:listTemplates", async () => {
    const t0 = Date.now();
    const tpls = await engine.listTemplates();
    console.log(`[wf:ipc] listTemplates → ${tpls.length} templates (${Date.now() - t0}ms)`);
    return tpls;
  });

  ipcMain.handle("wf:listNodeSpecs", async () => {
    const t0 = Date.now();
    const specs = await engine.listNodeSpecs();
    console.log(`[wf:ipc] listNodeSpecs → ${specs.length} kinds (${Date.now() - t0}ms)`);
    return specs;
  });

  ipcMain.handle("wf:saveTemplate", async (_e, tpl: WorkflowTemplate) => {
    console.log(`[wf:ipc] saveTemplate ref=${tpl.id}@${tpl.version} steps=${tpl.steps.length}`);
    try {
      await engine.saveTemplate(tpl);
    } catch (err) {
      console.error("[wf:ipc] saveTemplate failed:", err);
      throw err;
    }
  });

  ipcMain.handle(
    "wf:getTemplateLayout",
    async (_e, args: TemplateArgs) => {
      const layout = await engine.getTemplateLayout(args.templateRef);
      console.log(
        `[wf:ipc] getTemplateLayout ref=${args.templateRef} → ${layout ? `${Object.keys(layout.positions).length} positions, viewport=${layout.viewport ? "yes" : "no"}` : "null"}`,
      );
      return layout;
    },
  );

  ipcMain.handle(
    "wf:saveTemplateLayout",
    async (_e, args: { templateRef: string; layout: TemplateLayout }) => {
      try {
        await engine.saveTemplateLayout(args);
      } catch (err) {
        console.error("[wf:ipc] saveTemplateLayout failed:", err);
        throw err;
      }
    },
  );

  ipcMain.handle(
    "wf:renameTemplate",
    async (_e, args: { templateRef: string; newName: string }) => {
      console.log(`[wf:ipc] renameTemplate ref=${args.templateRef} name="${args.newName.slice(0, 40)}"`);
      try {
        await engine.renameTemplate(args);
      } catch (err) {
        console.error("[wf:ipc] renameTemplate failed:", err);
        throw err;
      }
    },
  );

  ipcMain.handle(
    "wf:deleteTemplate",
    async (_e, args: { templateRef: string }) => {
      console.log(`[wf:ipc] deleteTemplate ref=${args.templateRef}`);
      try {
        await engine.deleteTemplate(args.templateRef);
      } catch (err) {
        console.error("[wf:ipc] deleteTemplate failed:", err);
        throw err;
      }
    },
  );

  ipcMain.handle("wf:listSkills", async () => {
    const skills = await engine.listSkills();
    console.log(`[wf:ipc] listSkills → ${skills.length} skills`);
    return skills;
  });

  ipcMain.handle("wf:saveSkill", async (_e, skill: Skill) => {
    console.log(`[wf:ipc] saveSkill ref=${skill.ref} bytes=${skill.body.length}`);
    try {
      await engine.saveSkill(skill);
    } catch (err) {
      console.error("[wf:ipc] saveSkill failed:", err);
      throw err;
    }
  });

  ipcMain.handle("wf:deleteSkill", async (_e, args: { ref: string }) => {
    console.log(`[wf:ipc] deleteSkill ref=${args.ref}`);
    await engine.deleteSkill(args.ref as SkillRef);
  });

  ipcMain.handle("wf:listArtifactSchemas", async () => {
    const types = await engine.listArtifactSchemas();
    console.log(`[wf:ipc] listArtifactSchemas → ${types.length} types`);
    // Descriptors carry a Zod `schema` instance and other non-cloneable
    // fields (functions, prototypes) that Electron's structured clone can't
    // ship over IPC. Project to the renderer-facing view shape.
    return types.map((t) => ({
      id: t.id,
      version: t.version,
      name: t.name,
      description: t.description,
      rawSchema: t.rawSchema,
      simplifiedSchema: t.simplifiedSchema,
      sampleRaw: t.sampleRaw,
      sample: t.sample,
      source: t.source,
      extends: t.extends,
      structuralHash: t.structuralHash,
      markdownTemplate:
        t.markdownProjection?.kind === "template"
          ? t.markdownProjection.template
          : null,
    }));
  });

  ipcMain.handle(
    "wf:validateArtifact",
    async (_e, args: { kind: ArtifactKind; content: string }) => {
      // Authoritative content-vs-kind check, reusing the same registry path
      // `artifactStore.put` runs. Returns a serialisable result (Error
      // instances don't survive structured clone) so the editor can surface
      // the message inline before launch.
      const result = engine.artifactSchemas.validate(args.kind, args.content);
      return result.ok
        ? { ok: true as const }
        : { ok: false as const, error: result.error.message };
    },
  );

  ipcMain.handle(
    "wf:saveArtifactSchema",
    async (_e, type: SaveUserArtifactSchema) => {
      console.log(
        `[wf:ipc] saveArtifactSchema ${type?.id}@${type?.version}`,
      );
      try {
        await engine.saveArtifactSchema(type);
      } catch (err) {
        console.error("[wf:ipc] saveArtifactSchema failed:", err);
        throw err;
      }
    },
  );

  ipcMain.handle(
    "wf:deleteArtifactSchema",
    async (_e, ref: ArtifactSchemaRef) => {
      console.log(`[wf:ipc] deleteArtifactSchema ${ref?.id}@${ref?.version}`);
      await engine.deleteArtifactSchema(ref);
    },
  );

  ipcMain.handle(
    "wf:listParsers",
    async (_e, args?: { forType?: ArtifactSchemaRef }) => {
      const list = await engine.listParsers(args?.forType);
      console.log(
        `[wf:ipc] listParsers forType=${
          args?.forType ? `${args.forType.id}@${args.forType.version}` : "*"
        } → ${list.length}`,
      );
      return list;
    },
  );

  ipcMain.handle("wf:saveParser", async (_e, parser: SaveUserParser) => {
    console.log(
      `[wf:ipc] saveParser ${parser?.id}@${parser?.version} mode=${parser?.mode}`,
    );
    try {
      await engine.saveParser(parser);
    } catch (err) {
      console.error("[wf:ipc] saveParser failed:", err);
      throw err;
    }
  });

  ipcMain.handle("wf:deleteParser", async (_e, ref: ParserRef) => {
    console.log(`[wf:ipc] deleteParser ${ref?.id}@${ref?.version}`);
    await engine.deleteParser(ref);
  });

  ipcMain.handle("wf:runParser", async (_e, input: RunParserInput) => {
    try {
      return await engine.runParser(input);
    } catch (err) {
      console.error("[wf:ipc] runParser failed:", err);
      throw err;
    }
  });

  ipcMain.handle(
    "wf:listStepKindSuggestions",
    async (_e, args: { inputKind: string }) => {
      const list = await engine.listStepKindSuggestions(
        args.inputKind as never,
      );
      return list;
    },
  );

  ipcMain.handle("wf:getArtifact", async (_e, args: ArtifactArgs) => {
    const { meta, content } = await engine.artifactStore.get(args.artifactId as ArtifactId);
    console.log(`[wf:ipc] getArtifact id=${short(args.artifactId)} kind=${meta.kind} bytes=${content.length}`);
    // A function-typed Markdown projection can't cross the IPC boundary, so we
    // resolve it main-side here and ship only the produced string. We populate
    // `renderedMarkdown` solely when the kind carries an *effective* projection
    // (a `fn`/`template`, or an embedded `renderedMarkdown` field) — never for
    // `Markdown` (already rendered) nor for bare structured/JSON kinds, which
    // keep their existing "Lisible/Brut" JSON view in `ArtifactView`.
    let renderedMarkdown: string | undefined;
    if (meta.kind !== "Markdown") {
      const descriptor = engine.artifactSchemas.resolve(meta.kind);
      const projection = descriptor?.markdownProjection ?? null;
      let payload: unknown;
      try {
        payload = JSON.parse(content);
      } catch {
        payload = { body: content };
      }
      const hasEmbedded =
        payload !== null &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        typeof (payload as Record<string, unknown>).renderedMarkdown === "string";
      if (projection || hasEmbedded) {
        renderedMarkdown = renderArtifactMarkdown(projection, payload);
      }
    }
    return { meta, content, renderedMarkdown };
  });

  ipcMain.handle(
    "wf:getLlmSession",
    async (_e, args: { stepExecId: string }) => {
      const events = engine.llmSession.getReplay(args.stepExecId);
      return events;
    },
  );

  ipcMain.handle("wf:listChannels", async () => {
    const rows = await engine.listChannels();
    console.log(`[wf:ipc] listChannels → ${rows.length} rows`);
    return rows;
  });

  ipcMain.handle("wf:saveChannel", async (_e, draft: ChannelDraft) => {
    console.log(`[wf:ipc] saveChannel id=${draft?.id}`);
    try {
      await engine.saveChannel(draft);
    } catch (err) {
      console.error("[wf:ipc] saveChannel failed:", err);
      throw err;
    }
  });

  ipcMain.handle("wf:deleteChannel", async (_e, args: { id: string }) => {
    console.log(`[wf:ipc] deleteChannel id=${args.id}`);
    try {
      await engine.deleteChannel(args.id);
    } catch (err) {
      console.error("[wf:ipc] deleteChannel failed:", err);
      throw err;
    }
  });

  ipcMain.handle(
    "wf:getChannelIconImage",
    async (_e, args: { id: string }) => {
      const channel = await engine.channelRegistry.get(args.id);
      if (!channel?.iconImagePath) return null;
      const result = await engine.channelIcons.read(channel.iconImagePath);
      return result ? { bytes: result.bytes, mime: result.mime } : null;
    },
  );

  ipcMain.handle("wf:getActiveChannel", async () => engine.channels.getActive());

  ipcMain.handle("wf:setActiveChannel", async (_e, args: { id: string }) => {
    // Reject ids that don't exist in the channels table to keep the
    // UI/persistence stable. Reading the registry is cheap (single row by PK).
    const found = await engine.channelRegistry.get(args.id);
    if (!found) throw new Error(`unknown channel: ${args.id}`);
    engine.channels.setActive(args.id);
    console.log(`[wf:ipc] setActiveChannel → ${args.id}`);
  });

  ipcMain.handle("wf:debugStep", async (_e, input: DebugStepInput) => {
    const t0 = Date.now();
    try {
      const result = await engine.debugStep(input);
      console.log(
        `[wf:ipc] debugStep kind=${input.step.kind} inputs=${input.inputs.length} → ${result.kind} (${Date.now() - t0}ms)`,
      );
      return result;
    } catch (err) {
      console.error("[wf:ipc] debugStep failed:", err);
      throw err;
    }
  });

  ipcMain.handle("wf:listSchedules", async () => {
    const rows = await engine.listSchedules();
    console.log(`[wf:ipc] listSchedules → ${rows.length} rows`);
    return rows;
  });

  ipcMain.handle("wf:saveSchedule", async (_e, draft: ScheduleDraft) => {
    console.log(
      `[wf:ipc] saveSchedule id=${draft.id ?? "<new>"} name="${draft.name?.slice(0, 40)}"`,
    );
    try {
      return await engine.saveSchedule(draft);
    } catch (err) {
      console.error("[wf:ipc] saveSchedule failed:", err);
      throw err;
    }
  });

  ipcMain.handle(
    "wf:setScheduleEnabled",
    async (_e, args: { id: string; enabled: boolean }) => {
      console.log(`[wf:ipc] setScheduleEnabled id=${args.id} enabled=${args.enabled}`);
      await engine.setScheduleEnabled(args.id as ScheduleId, args.enabled);
    },
  );

  ipcMain.handle(
    "wf:deleteSchedule",
    async (_e, args: { id: string }) => {
      console.log(`[wf:ipc] deleteSchedule id=${args.id}`);
      await engine.deleteSchedule(args.id as ScheduleId);
    },
  );

  ipcMain.handle("wf:moveEntity", async (_e, input: MoveEntityInput) => {
    console.log(
      `[wf:ipc] moveEntity kind=${input.kind} → channel=${input.channelId ?? "<global>"}`,
    );
    try {
      await engine.moveEntity(input);
    } catch (err) {
      console.error("[wf:ipc] moveEntity failed:", err);
      throw err;
    }
  });

  const sendIfAlive = (channel: string, payload: unknown) => {
    if (win.isDestroyed()) return;
    win.webContents.send(channel, payload);
  };

  engine.bus.subscribe((evt) => {
    sendIfAlive("wf:event", evt);
  });
  engine.llmSession.subscribe((ev) => {
    sendIfAlive("wf:llmSession", ev);
  });
  // Push channel switches to the renderer — the ChannelProvider's onChanged
  // listener picks them up to re-bind all hooks.
  engine.channels.subscribe((id) => {
    sendIfAlive("wf:channelChanged", id);
  });
  console.log("[wf:ipc] handlers registered");
};
