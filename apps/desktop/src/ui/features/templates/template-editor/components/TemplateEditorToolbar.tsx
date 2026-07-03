import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

import {
  AlertTriangle,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  BadgeCheck,
  Boxes,
  Check,
  ChevronDown,
  Columns2,
  Download,
  FileImage,
  FileJson,
  Frame,
  Grid3x3,
  Hand,
  Maximize2,
  Minimize2,
  Network,
  NotebookPen,
  Play,
  RefreshCw,
  Rocket,
  Save,
  SquareDashedMousePointer,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { menuItemClass, menuPopupClass } from "../../../explorer/menus/menu-styles";
import ToolbarButton from "../../../../components/ToolbarButton";
import { useT } from "../../../../i18n";
import type { TemplateVariableDraft } from "../../../../../domain/workflow/types";
import NodesPickerMenu from "../../NodesPickerMenu";
import VariablesPickerMenu from "../../VariablesPickerMenu";
import { setTemplateEditorGridSnap } from "../../../../workbench/store";
import {
  totalMissing as totalMissingDeps,
  totalTemplateDeps,
  type MissingDeps,
  type TemplateDeps,
} from "../../../../../application/use-cases/collect-missing-template-deps";
import type { StepKindMeta } from "../../../../components/templates/step-kinds";
import type { LaunchRunControls } from "../hooks/useLaunchRun";
import type { CanvasMode } from "../hooks/useCanvasMode";
import type { AutoLayoutMode } from "../graph/auto-layout";
import type { VariableModalState } from "./variable-modal";

type Props = {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
  readonly editingRef: string | null;
  readonly status: "draft" | "published";
  readonly busy: boolean;
  readonly launch: LaunchRunControls["launch"];
  readonly canLaunch: boolean;
  readonly hasMissingDeps: boolean;
  readonly missingDeps: MissingDeps;
  readonly deps: TemplateDeps;
  readonly notesVisible: boolean;
  readonly setNotesVisible: Dispatch<SetStateAction<boolean>>;
  readonly canvasMode: CanvasMode;
  readonly setCanvasMode: (mode: CanvasMode) => void;
  readonly groupDrawingMode: boolean;
  readonly setGroupDrawingMode: Dispatch<SetStateAction<boolean>>;
  readonly gridSnap: { readonly enabled: boolean; readonly size: number };
  readonly isMaximized: boolean;
  readonly setIsMaximized: Dispatch<SetStateAction<boolean>>;
  readonly variables: readonly TemplateVariableDraft[];
  readonly setVariableModal: Dispatch<SetStateAction<VariableModalState>>;
  readonly setMissingDepsModalOpen: Dispatch<SetStateAction<boolean>>;
  readonly setDepsModalOpen: Dispatch<SetStateAction<boolean>>;
  readonly handleLaunchOpen: () => void;
  readonly handleLaunchClose: () => void;
  readonly handleAutoLayout: (mode: AutoLayoutMode) => void;
  readonly addStickyNote: () => void;
  readonly addStep: (kind: StepKindMeta) => void;
  readonly handleExportJson: () => Promise<void>;
  readonly handleExportSvg: () => Promise<void>;
  readonly handleExportPng: () => Promise<void>;
  readonly handleSave: () => Promise<void>;
  readonly handlePublish: () => void;
  readonly handleClearAll: () => void;
  readonly handleReload: () => void;
};

const TemplateEditorToolbar = ({
  nodes,
  edges,
  editingRef,
  status,
  busy,
  launch,
  canLaunch,
  hasMissingDeps,
  missingDeps,
  deps,
  notesVisible,
  setNotesVisible,
  canvasMode,
  setCanvasMode,
  groupDrawingMode,
  setGroupDrawingMode,
  gridSnap,
  isMaximized,
  setIsMaximized,
  variables,
  setVariableModal,
  setMissingDepsModalOpen,
  setDepsModalOpen,
  handleLaunchOpen,
  handleLaunchClose,
  handleAutoLayout,
  addStickyNote,
  addStep,
  handleExportJson,
  handleExportSvg,
  handleExportPng,
  handleSave,
  handlePublish,
  handleClearAll,
  handleReload,
}: Props) => {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-b from-muted/60 to-transparent px-3 py-1.5">
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          icon={launch ? X : Play}
          variant={launch ? "outline" : "default"}
          label={
            !canLaunch
              ? editingRef === null
                ? "Sauvegarder le template avant de pouvoir le lancer"
                : hasMissingDeps
                  ? "Dépendances manquantes — résous-les avant de lancer un run"
                  : "Définir une étape d'entrée avant de pouvoir lancer"
              : launch
                ? "Annuler le lancement"
                : "Lancer un run depuis ce template"
          }
          onClick={launch ? handleLaunchClose : handleLaunchOpen}
          disabled={!canLaunch}
        />
      </div>
      <div className="flex items-center gap-0.5 border-l pl-2">
        <ToolbarButton
          icon={Hand}
          label="Déplacer / panoramique"
          onClick={() => setCanvasMode("drag")}
          className={
            canvasMode === "drag"
              ? "bg-accent text-accent-foreground"
              : undefined
          }
        />
        <ToolbarButton
          icon={SquareDashedMousePointer}
          label="Sélection au rectangle — supprimer avec Suppr (Échap pour quitter)"
          onClick={() => setCanvasMode("select")}
          className={
            canvasMode === "select"
              ? "bg-accent text-accent-foreground"
              : undefined
          }
        />
      </div>
      <div className="flex items-center gap-0.5 border-l pl-2">
        <Menu.Root>
          <Tooltip>
            <TooltipTrigger
              render={
                <Menu.Trigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t(
                        "template.editor.toolbar.autoLayout.trigger",
                      )}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Network />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent>
              {t("template.editor.toolbar.autoLayout.trigger")}
            </TooltipContent>
          </Tooltip>
          <Menu.Portal>
            <Menu.Positioner align="start" sideOffset={4} className="z-50">
              <Menu.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ transformOrigin: "top left" }}
                  />
                }
                className={menuPopupClass}
              >
                <Menu.Item
                  className={cn(menuItemClass)}
                  onClick={() => handleAutoLayout("vertical")}
                >
                  <AlignVerticalSpaceAround className="size-4 text-muted-foreground" />
                  {t("template.editor.toolbar.autoLayout.vertical")}
                </Menu.Item>
                <Menu.Item
                  className={cn(menuItemClass)}
                  onClick={() => handleAutoLayout("horizontal")}
                >
                  <AlignHorizontalSpaceAround className="size-4 text-muted-foreground" />
                  {t("template.editor.toolbar.autoLayout.horizontal")}
                </Menu.Item>
                <Menu.Item
                  className={cn(menuItemClass)}
                  onClick={() => handleAutoLayout("two-columns")}
                >
                  <Columns2 className="size-4 text-muted-foreground" />
                  {t("template.editor.toolbar.autoLayout.twoColumns")}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div className="ml-2 flex items-center gap-0.5 border-l pl-2">
        <ToolbarButton
          icon={StickyNote}
          label={
            notesVisible
              ? "Masquer les notes des étapes"
              : "Afficher les notes des étapes"
          }
          onClick={() => setNotesVisible((v) => !v)}
          className={
            notesVisible ? "bg-accent text-accent-foreground" : undefined
          }
        />
        <ToolbarButton
          icon={Frame}
          label={
            groupDrawingMode
              ? "Annuler — Échap pour quitter"
              : "Créer un groupe (drag un rectangle sur le canvas)"
          }
          onClick={() => setGroupDrawingMode((v) => !v)}
          className={
            groupDrawingMode
              ? "bg-accent text-accent-foreground"
              : undefined
          }
        />
        <ToolbarButton
          icon={NotebookPen}
          label={t("template.editor.stickyNote.add")}
          onClick={addStickyNote}
        />
        <ToolbarButton
          icon={Grid3x3}
          label={
            gridSnap.enabled
              ? `Snap activé (pas : ${gridSnap.size} px) — cliquer pour désactiver`
              : "Activer le snap à la grille"
          }
          onClick={() =>
            setTemplateEditorGridSnap({ enabled: !gridSnap.enabled })
          }
          className={
            gridSnap.enabled ? "bg-accent text-accent-foreground" : undefined
          }
        />
        <ToolbarButton
          icon={isMaximized ? Minimize2 : Maximize2}
          label={
            isMaximized
              ? "Quitter le plein écran (Échap)"
              : "Afficher le graph en plein écran"
          }
          onClick={() => setIsMaximized((v) => !v)}
          className={
            isMaximized ? "bg-accent text-accent-foreground" : undefined
          }
        />
        <Menu.Root>
          <Tooltip>
            <TooltipTrigger
              render={
                <Menu.Trigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t(
                        "template.editor.toolbar.grid.chooseStepAriaLabel",
                      )}
                    >
                      <ChevronDown />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent>
              {t("template.editor.toolbar.grid.stepTooltip")}
            </TooltipContent>
          </Tooltip>
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={4} className="z-50">
              <Menu.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ transformOrigin: "top right" }}
                  />
                }
                className={menuPopupClass}
              >
                {[10, 20, 40, 80].map((size) => (
                  <Menu.Item
                    key={size}
                    className={cn(menuItemClass)}
                    onClick={() => setTemplateEditorGridSnap({ size })}
                  >
                    <Check
                      className={cn(
                        "size-4 text-muted-foreground",
                        gridSnap.size === size ? "visible" : "invisible",
                      )}
                    />
                    {size === 20 ? `${size} px (défaut)` : `${size} px`}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div className="ml-2 flex items-center gap-0.5 border-l pl-2">
        <NodesPickerMenu disabled={false} onPick={addStep} />
        <VariablesPickerMenu
          disabled={false}
          variables={variables}
          onPick={(v) =>
            setVariableModal({ open: true, mode: "edit", variable: v })
          }
          onRequestCreate={() =>
            setVariableModal({ open: true, mode: "create" })
          }
        />
        <Menu.Root>
          <Tooltip>
            <TooltipTrigger
              render={
                <Menu.Trigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t(
                        "template.editor.toolbar.export.trigger",
                      )}
                      disabled={nodes.length === 0 && !editingRef}
                    >
                      <Download />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent>
              {t("template.editor.toolbar.export.trigger")}
            </TooltipContent>
          </Tooltip>
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={4} className="z-50">
              <Menu.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ transformOrigin: "top right" }}
                  />
                }
                className={menuPopupClass}
              >
                <Menu.Item
                  className={cn(
                    menuItemClass,
                    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                  )}
                  onClick={handleExportJson}
                  disabled={!editingRef}
                >
                  <FileJson className="size-4 text-muted-foreground" />
                  {t("template.editor.toolbar.export.json")}
                </Menu.Item>
                <Menu.Item
                  className={cn(
                    menuItemClass,
                    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                  )}
                  onClick={handleExportSvg}
                  disabled={nodes.length === 0}
                >
                  <Download className="size-4 text-muted-foreground" />
                  {t("template.editor.toolbar.export.svg")}
                </Menu.Item>
                <Menu.Item
                  className={cn(
                    menuItemClass,
                    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                  )}
                  onClick={handleExportPng}
                  disabled={nodes.length === 0}
                >
                  <FileImage className="size-4 text-muted-foreground" />
                  {t("template.editor.toolbar.export.png")}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <ToolbarButton
          icon={Boxes}
          label={t("templates.deps.toolbarButton")}
          onClick={() => setDepsModalOpen(true)}
          disabled={totalTemplateDeps(deps) === 0}
        />
        {hasMissingDeps ? (
          <ToolbarButton
            icon={AlertTriangle}
            label={`${totalMissingDeps(missingDeps)} dépendance(s) manquante(s) — cliquer pour voir`}
            onClick={() => setMissingDepsModalOpen(true)}
            className="text-destructive hover:text-destructive"
          />
        ) : null}
        <ToolbarButton
          icon={RefreshCw}
          label={t("template.editor.toolbar.reload")}
          onClick={handleReload}
          disabled={busy || editingRef === null}
        />
        <ToolbarButton
          icon={Save}
          label={t(
            busy
              ? "template.editor.toolbar.saving"
              : status === "published"
                ? "template.editor.toolbar.saveLocked"
                : "template.editor.toolbar.saveDraft",
          )}
          onClick={handleSave}
          disabled={busy || status === "published"}
        />
        <ToolbarButton
          icon={status === "published" ? BadgeCheck : Rocket}
          variant={status === "published" ? "ghost" : "secondary"}
          label={t(
            status === "published"
              ? "template.editor.toolbar.published"
              : "template.editor.toolbar.publish",
          )}
          onClick={handlePublish}
          disabled={busy || status === "published"}
          className={
            status === "published"
              ? "text-emerald-600 dark:text-emerald-400"
              : undefined
          }
        />
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarButton
          icon={Trash2}
          label={t("template.editor.toolbar.clearAll")}
          onClick={handleClearAll}
          disabled={nodes.length === 0 && edges.length === 0}
        />
      </div>
    </div>
  );
};

export default TemplateEditorToolbar;
