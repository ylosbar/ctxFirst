import { useQuery } from "@tanstack/react-query";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "../channels/ChannelProvider";
import { qk } from "../query/keys";
import type { ArtifactSchemaView } from "../../domain/workflow/types";

type UseArtifactSchemas = {
  types: ReadonlyArray<ArtifactSchemaView>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const useArtifactSchemas = (): UseArtifactSchemas => {
  const services = useServices();
  const { activeChannelId } = useActiveChannel();

  const query = useQuery({
    queryKey: qk.artifactSchemas.list(activeChannelId),
    queryFn: () => services.listArtifactSchemas(),
  });

  return {
    types: query.data ?? [],
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

export default useArtifactSchemas;
