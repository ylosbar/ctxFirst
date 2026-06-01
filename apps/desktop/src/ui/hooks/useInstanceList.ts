import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "../channels/ChannelProvider";
import { qk } from "../query/keys";
import type { InstanceSummaryView } from "../../domain/workflow/types";

type UseInstanceList = {
  instances: ReadonlyArray<InstanceSummaryView>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
};

const useInstanceList = (query = ""): UseInstanceList => {
  const services = useServices();
  const queryClient = useQueryClient();
  const { activeChannelId } = useActiveChannel();
  const trimmed = query.trim();

  const listQuery = useQuery({
    queryKey: qk.instances.list(activeChannelId, trimmed),
    queryFn: () =>
      trimmed ? services.searchInstances(trimmed) : services.listInstances(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => services.deleteInstance(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["instances"] });
      void queryClient.invalidateQueries({ queryKey: ["awaiting-human"] });
    },
  });

  const error =
    listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.error
        ? String(listQuery.error)
        : deleteMutation.error instanceof Error
          ? deleteMutation.error.message
          : null;

  return {
    instances: listQuery.data ?? [],
    loading: listQuery.isPending,
    error,
    refresh: async () => {
      await listQuery.refetch();
    },
    deleteInstance: async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
  };
};

export default useInstanceList;
