import { useQuery } from "@tanstack/react-query";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "../channels/ChannelProvider";
import { qk } from "../query/keys";
import type { TemplateView } from "../../domain/workflow/types";

type UseWorkflowTemplates = {
  templates: ReadonlyArray<TemplateView>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const useWorkflowTemplates = (): UseWorkflowTemplates => {
  const services = useServices();
  const { activeChannelId } = useActiveChannel();

  const query = useQuery({
    queryKey: qk.templates.list(activeChannelId),
    queryFn: () => services.listWorkflowTemplates(),
  });

  return {
    templates: query.data ?? [],
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

export default useWorkflowTemplates;
