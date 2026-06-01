// Spec template-title-bar.md — barre de titre inline du TemplateEditor.
// Le popover de description utilise `Menu.Root` (base-ui) en mode `modal={false}`
// pour héberger un Textarea (cf. §1.A) : c'est le seul primitive de positionnement
// "ancré" déjà utilisé dans ce module ; un Dialog modale serait trop lourd pour
// un champ secondaire et le pattern absolu ad-hoc d'EdgeDropSuggestions n'offre
// pas la gestion d'Escape / focus-trap dont on a besoin.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Menu } from "@base-ui/react/menu";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useActiveTemplateCanvas } from "../../stores/template-canvas-store";
import { i18n } from "../../i18n";

type InlineFieldProps = {
  readonly value: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly onCommit: (next: string) => void;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly displayClassName?: string;
  readonly placeholderClassName?: string;
  readonly minChars?: number;
  readonly ariaLabel: string;
  readonly allowEmpty?: boolean;
};

// Affiche un span jusqu'au clic, puis un input jusqu'à blur/Enter/Escape.
// Largeur dérivée de la longueur du draft via l'attribut HTML `size` (cf. spec §1).
const InlineField = ({
  value,
  placeholder,
  disabled,
  onCommit,
  className,
  inputClassName,
  displayClassName,
  placeholderClassName,
  minChars = 4,
  ariaLabel,
  allowEmpty = true,
}: InlineFieldProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quand le champ source change pendant qu'on n'édite pas (sync depuis le
  // store), on garde `draft` aligné.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (!allowEmpty && next === "") {
      setDraft(value);
    } else {
      onCommit(next);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  if (editing && !disabled) {
    return (
      <Input
        ref={inputRef}
        aria-label={ariaLabel}
        value={draft}
        size={Math.max(minChars, draft.length || minChars)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-auto rounded-sm border-transparent bg-transparent px-1 py-0 leading-none focus:border-primary",
          inputClassName,
          className,
        )}
      />
    );
  }

  const isEmpty = value === "";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) setEditing(true);
      }}
      className={cn(
        "inline-flex cursor-text items-center rounded-sm border border-transparent px-1 py-0 text-left leading-none outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default disabled:hover:bg-transparent",
        displayClassName,
        className,
      )}
    >
      <span
        className={cn(
          isEmpty ? cn("text-muted-foreground/60", placeholderClassName) : null,
        )}
      >
        {isEmpty ? placeholder : value}
      </span>
    </button>
  );
};

const TemplateTitleBar = () => {
  const canvas = useActiveTemplateCanvas();
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const initialDescriptionRef = useRef<string>("");
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Quand on ouvre le popover : snapshot la valeur courante pour pouvoir
  // l'annuler avec Escape, puis autofocus.
  useEffect(() => {
    if (!descriptionOpen) return;
    initialDescriptionRef.current = canvas?.description ?? "";
    setDescriptionDraft(canvas?.description ?? "");
    const id = requestAnimationFrame(() => {
      const el = descriptionTextareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [descriptionOpen, canvas?.description]);

  if (!canvas) return null;

  const disabled = !canvas.mutationEnabled;
  const hasDescription = (canvas.description ?? "").trim() !== "";

  const handleDescriptionKeyDown = (
    e: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === "Escape") {
      e.preventDefault();
      // Annule la saisie : restaure la valeur d'avant ouverture.
      canvas.setDescription(initialDescriptionRef.current);
      setDescriptionOpen(false);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setDescriptionOpen(false);
    }
  };

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-2 border-b bg-gradient-to-b from-muted/60 to-transparent px-3"
      data-template-title-bar
    >
      <InlineField
        value={canvas.name}
        placeholder={i18n.t("template.untitled")}
        disabled={disabled}
        onCommit={(next) => canvas.setName(next)}
        ariaLabel="Nom du template"
        minChars={8}
        allowEmpty={false}
        displayClassName="text-sm font-medium text-foreground"
        inputClassName="h-5 text-sm font-medium"
      />
      {/* eslint-disable-next-line i18next/no-literal-string -- séparateur visuel */}
      <span className="text-xs text-muted-foreground/40">·</span>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <InlineField
          value={canvas.templateId}
          placeholder="my-flow"
          disabled={disabled}
          onCommit={(next) => canvas.setTemplateId(next)}
          ariaLabel="ID du template"
          minChars={4}
          displayClassName="text-xs text-muted-foreground"
          inputClassName="h-5 text-xs text-muted-foreground"
        />
        {/* eslint-disable-next-line i18next/no-literal-string -- séparateur visuel */}
        <span className="text-muted-foreground/40">·</span>
        <InlineField
          value={canvas.version}
          placeholder="v1"
          disabled={disabled}
          onCommit={(next) => canvas.setVersion(next)}
          ariaLabel="Version du template"
          minChars={4}
          displayClassName="text-xs text-muted-foreground"
          inputClassName="h-5 text-xs text-muted-foreground"
        />
      </div>
      <Menu.Root
        open={descriptionOpen}
        onOpenChange={setDescriptionOpen}
        modal={false}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Menu.Trigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Description"
                    className={cn(
                      hasDescription
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Info />
                  </Button>
                }
              />
            }
          />
          {/* eslint-disable-next-line i18next/no-literal-string -- migration i18n templates en cours, cf. spec template-title-bar.md */}
          <TooltipContent>Description</TooltipContent>
        </Tooltip>
        <Menu.Portal>
          <Menu.Positioner align="start" side="bottom" sideOffset={4} className="z-50">
            <Menu.Popup className="z-50 w-80 overflow-hidden rounded-md border border-border bg-popover p-2 text-sm text-popover-foreground shadow-md outline-none">
              <Textarea
                ref={descriptionTextareaRef}
                size="sm"
                placeholder="À quoi sert ce template ?"
                value={descriptionDraft}
                readOnly={disabled}
                onChange={(e) => {
                  if (disabled) return;
                  setDescriptionDraft(e.target.value);
                  canvas.setDescription(e.target.value);
                }}
                onKeyDown={handleDescriptionKeyDown}
                className="min-h-[80px] resize-y"
                rows={4}
              />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
};

export default TemplateTitleBar;
