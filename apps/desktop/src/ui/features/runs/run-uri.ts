export const RUN_SCHEME = "run";
export const RUN_URI_PREFIX = "run://";

export type ParsedRunUri = {
  readonly instanceId: string;
  readonly step: string | null;
};

export const runUriFor = (
  instanceId: string,
  opts?: { readonly step?: string },
): string => {
  const base = `${RUN_URI_PREFIX}${instanceId}`;
  return opts?.step ? `${base}?step=${encodeURIComponent(opts.step)}` : base;
};

export const parseRunUri = (uri: string): ParsedRunUri | null => {
  if (!uri.startsWith(RUN_URI_PREFIX)) return null;
  const rest = uri.slice(RUN_URI_PREFIX.length);
  const qIdx = rest.indexOf("?");
  if (qIdx === -1) return rest ? { instanceId: rest, step: null } : null;
  const instanceId = rest.slice(0, qIdx);
  if (!instanceId) return null;
  const params = new URLSearchParams(rest.slice(qIdx + 1));
  return { instanceId, step: params.get("step") };
};

export const instanceIdFromRunUri = (uri: string): string | null =>
  parseRunUri(uri)?.instanceId ?? null;
