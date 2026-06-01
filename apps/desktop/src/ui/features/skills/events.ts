// Sous-event "métier" porteur d'un payload (`ref` du skill créé) consommé par
// `TemplateEditor` pour auto-attacher un skill nouvellement créé au node
// courant. Conservé volontairement après la migration react-query — ce n'est
// pas un signal d'invalidation de cache mais un canal métier dédié.
const CREATED_EVENT = "skill:created";

export const notifySkillCreated = (ref: string): void => {
  window.dispatchEvent(new CustomEvent(CREATED_EVENT, { detail: ref }));
};

export const onSkillCreated = (
  listener: (ref: string) => void,
): (() => void) => {
  const handler = (e: Event) => {
    listener((e as CustomEvent<string>).detail);
  };
  window.addEventListener(CREATED_EVENT, handler);
  return () => window.removeEventListener(CREATED_EVENT, handler);
};
