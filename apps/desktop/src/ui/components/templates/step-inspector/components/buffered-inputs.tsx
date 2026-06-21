import * as React from "react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";

/**
 * Buffer local d'un champ texte de l'inspecteur de node.
 *
 * La valeur affichée par l'inspecteur fait un aller-retour par un store publié
 * dans un `useEffect` (cf. `useRegisterTemplateCanvas`) : elle revient donc un
 * tick *après* la frappe. Un `<input value={valeurDuStore}>` se ferait réécrire
 * sa valeur DOM par React pendant ce tick de décalage (la prop reste la valeur
 * d'avant la frappe), ce qui renvoie le curseur en fin de chaîne dès qu'on édite
 * au milieu du texte. On affiche donc un état local mis à jour synchroniquement
 * à la frappe, resynchronisé quand la valeur amont change *hors* de ce champ
 * (changement de node, auto-remplissage, undo).
 *
 * La resynchro fonctionne parce que `value` est une primitive : l'effet ne se
 * déclenche que quand la chaîne change réellement, donc l'écho de notre propre
 * frappe (contenu identique) ne réécrit jamais le brouillon.
 */
export const useBufferedField = (
  value: string,
): [string, (next: string) => void] => {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return [draft, setDraft];
};

const toStringValue = (
  value: React.ComponentProps<"input">["value"],
): string => (value == null ? "" : String(value));

/**
 * `<Input>` contrôlé qui préserve la position du curseur malgré l'aller-retour
 * asynchrone de l'inspecteur. Drop-in : mêmes props que le {@link Input} de base.
 */
export const BufferedInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ value, onChange, ...props }, ref) => {
  const [draft, setDraft] = useBufferedField(toStringValue(value));
  return (
    <Input
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange?.(e);
      }}
      {...props}
    />
  );
});
BufferedInput.displayName = "BufferedInput";

/**
 * `<Textarea>` contrôlé qui préserve la position du curseur. Drop-in : mêmes
 * props que le {@link Textarea} de base.
 */
export const BufferedTextarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ value, onChange, ...props }, ref) => {
  const [draft, setDraft] = useBufferedField(toStringValue(value));
  return (
    <Textarea
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange?.(e);
      }}
      {...props}
    />
  );
});
BufferedTextarea.displayName = "BufferedTextarea";
