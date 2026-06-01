import { useQuery } from "@tanstack/react-query";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "../channels/ChannelProvider";
import { qk } from "../query/keys";
import type { SkillView } from "../../domain/workflow/types";

type UseSkills = {
  skills: ReadonlyArray<SkillView>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const useSkills = (): UseSkills => {
  const services = useServices();
  const { activeChannelId } = useActiveChannel();

  const query = useQuery({
    queryKey: qk.skills.list(activeChannelId),
    queryFn: () => services.listSkills(),
  });

  return {
    skills: query.data ?? [],
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

export default useSkills;
