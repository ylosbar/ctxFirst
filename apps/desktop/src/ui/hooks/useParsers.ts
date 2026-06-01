import { useQuery } from "@tanstack/react-query";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "../channels/ChannelProvider";
import { qk } from "../query/keys";
import type {
  ArtifactSchemaRefView,
  ParserView,
} from "../../domain/workflow/types";

type UseParsers = {
  parsers: ReadonlyArray<ParserView>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

// Lists parsers, optionally filtered by target artifact type. Passing `null`
// (or omitting) returns every parser known to the engine. The `forType`
// identity is reduced to a stable string key so callers may pass a freshly
// built object each render without churning the query cache.
const useParsers = (forType?: ArtifactSchemaRefView | null): UseParsers => {
  const services = useServices();
  const { activeChannelId } = useActiveChannel();
  const forKey = forType ? `${forType.id}@${forType.version}` : "";

  const query = useQuery({
    queryKey: qk.parsers.list(activeChannelId, forKey),
    queryFn: () => services.listParsers(forType ?? undefined),
  });

  return {
    parsers: query.data ?? [],
    loading: query.isPending,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? String(query.error)
          : null,
    refresh: async () => {
      await query.refetch();
    },
  };
};

export default useParsers;
