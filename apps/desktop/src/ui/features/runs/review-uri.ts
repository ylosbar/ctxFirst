export const REVIEW_SCHEME = "review";
export const REVIEW_URI_PREFIX = "review://";

export type ParsedReviewUri = {
  readonly instanceId: string;
  readonly stepExecId: string;
};

export const reviewUriFor = (
  instanceId: string,
  stepExecId: string,
): string =>
  `${REVIEW_URI_PREFIX}${instanceId}?exec=${encodeURIComponent(stepExecId)}`;

export const parseReviewUri = (uri: string): ParsedReviewUri | null => {
  if (!uri.startsWith(REVIEW_URI_PREFIX)) return null;
  const rest = uri.slice(REVIEW_URI_PREFIX.length);
  const qIdx = rest.indexOf("?");
  if (qIdx === -1) return null;
  const instanceId = rest.slice(0, qIdx);
  if (!instanceId) return null;
  const params = new URLSearchParams(rest.slice(qIdx + 1));
  const stepExecId = params.get("exec");
  if (!stepExecId) return null;
  return { instanceId, stepExecId };
};
