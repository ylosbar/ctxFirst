import { useQuery } from "@tanstack/react-query";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "../channels/ChannelProvider";
import { qk } from "../query/keys";
import type { AwaitingHumanItemView } from "../../domain/workflow/types";

type UseAwaitingHumanInbox = {
  items: ReadonlyArray<AwaitingHumanItemView>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const useAwaitingHumanInbox = (): UseAwaitingHumanInbox => {
  const services = useServices();
  const { activeChannelId } = useActiveChannel();

  const query = useQuery({
    queryKey: qk.awaitingHuman.list(activeChannelId),
    queryFn: () => services.listAwaitingHuman(),
  });

  return {
    items: query.data ?? [],
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

export default useAwaitingHumanInbox;
