import { useEffect, useState } from "react";

import { FormField } from "@/components/ui/form-field";
import { Section } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "../../../../i18n";
import { closingTagFor } from "./derive-closing-tag";

type Props = {
  /** Nom du port d'entrée dont on configure le wrapper (`main`, `markdown1`, …). */
  port: string;
  config: Readonly<Record<string, unknown>>;
  setConfig: (patch: Record<string, unknown>) => void;
};

/**
 * Buffer local d'un champ texte de l'inspecteur.
 *
 * La valeur affichée par l'inspecteur fait un aller-retour par un store publié
 * dans un `useEffect` (cf. `useRegisterTemplateCanvas`) : elle revient donc un
 * tick *après* la frappe. Un `<Textarea value={valeurDuStore}>` se ferait
 * réécrire sa valeur DOM par React pendant ce tick de décalage (la prop reste
 * la valeur d'avant la frappe), ce qui renvoie le curseur en fin de chaîne dès
 * qu'on édite au milieu. On affiche donc un état local mis à jour
 * synchroniquement à la frappe, et on le resynchronise quand la valeur amont
 * change *hors* de ce champ (changement de node, auto-remplissage, undo).
 */
const useBufferedField = (
  value: string,
): [string, (next: string) => void] => {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return [draft, setDraft];
};

/**
 * Disclosure repliable « Préfixe / suffixe » pour une entrée de `concat.markdown`,
 * colocalisé sous le select de câblage du port par le slot `renderInputExtra` de
 * {@link PortsWiring}. Écrit dans `config.entries[port].{header,footer}` — forme
 * inchangée, lue telle quelle par le runner.
 */
const ConcatEntryWrapperFields = ({ port, config, setConfig }: Props) => {
  const t = useT();
  const entriesCfg = config["entries"] as
    | Record<string, { header?: string; footer?: string } | undefined>
    | undefined;
  const entry = entriesCfg?.[port];

  const [header, setHeader] = useBufferedField(entry?.header ?? "");
  const [footer, setFooter] = useBufferedField(entry?.footer ?? "");

  const setEntry = (patch: { header?: string; footer?: string }) => {
    const prev =
      (config["entries"] as Record<string, unknown> | undefined) ?? {};
    const prevPort =
      (prev[port] as Record<string, unknown> | undefined) ?? {};
    setConfig({ entries: { ...prev, [port]: { ...prevPort, ...patch } } });
  };

  // Quand le footer est encore vide et que le header est une balise ouvrante
  // (`<nom>`), pré-remplit le footer avec la balise fermante (`</nom>`). Dès
  // que le footer porte une valeur, on n'écrase plus rien.
  const onHeaderChange = (next: string) => {
    setHeader(next);
    if (!footer) {
      const closing = closingTagFor(next);
      if (closing) {
        setFooter(closing);
        setEntry({ header: next, footer: closing });
        return;
      }
    }
    setEntry({ header: next });
  };

  const onFooterChange = (next: string) => {
    setFooter(next);
    setEntry({ footer: next });
  };

  const hasValue = Boolean(header || footer);

  return (
    <Section
      title={t("template.stepInspector.concat.perEntry.toggle")}
      variant="card"
      density="compact"
      collapsible
      defaultOpen={hasValue}
      persistKey={`app.step-inspector.concat.entry.${port}`}
      trailing={
        hasValue ? (
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-primary"
            title={t("template.stepInspector.concat.perEntry.toggle")}
          />
        ) : undefined
      }
    >
      <FormField label={t("template.stepInspector.concat.perEntry.header")}>
        <Textarea
          size="sm"
          className="min-h-[40px]"
          value={header}
          onChange={(e) => onHeaderChange(e.target.value)}
        />
      </FormField>
      <FormField label={t("template.stepInspector.concat.perEntry.footer")}>
        <Textarea
          size="sm"
          className="min-h-[40px]"
          value={footer}
          onChange={(e) => onFooterChange(e.target.value)}
        />
      </FormField>
    </Section>
  );
};

export default ConcatEntryWrapperFields;
