// Returns true when a DOM event target is an editable surface — used by
// global keyboard shortcuts to skip handling when the user is actively
// typing into an input, textarea, select, or any contentEditable region.
export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
};
