export const TEMPLATES_LIST_URI = "templates://";
export const TEMPLATE_URI_PREFIX = "template://";
export const NEW_TEMPLATE_URI = "template://new";

export const templateUriFor = (ref: string): string =>
  `${TEMPLATE_URI_PREFIX}${ref}`;

// Returns the template ref for an "edit" URI (`template://my-flow@v1`), or
// null for the "new" URI variants (`template://new`, `template://new?from=…`).
export const refFromTemplateUri = (uri: string): string | null => {
  if (!uri.startsWith(TEMPLATE_URI_PREFIX)) return null;
  const rest = uri.slice(TEMPLATE_URI_PREFIX.length);
  const ref = rest.split("?")[0];
  if (!ref || ref === "new") return null;
  return ref;
};

// Returns the `from` query parameter when the URI is a "new from" URI
// (`template://new?from=ref`). Otherwise null.
export const fromRefFromTemplateUri = (uri: string): string | null => {
  if (!uri.startsWith(TEMPLATE_URI_PREFIX)) return null;
  const rest = uri.slice(TEMPLATE_URI_PREFIX.length);
  const queryIdx = rest.indexOf("?");
  if (queryIdx < 0) return null;
  const params = new URLSearchParams(rest.slice(queryIdx + 1));
  const from = params.get("from");
  return from ?? null;
};

export const isTemplateEditorUri = (uri: string): boolean =>
  uri.startsWith(TEMPLATE_URI_PREFIX);
