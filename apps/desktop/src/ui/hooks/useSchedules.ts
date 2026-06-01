import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type {
  ScheduleDraftView,
  ScheduleView,
} from "../../domain/workflow/types";
import { useActiveChannel } from "../channels/ChannelProvider";
import { useServices } from "../di/services-provider";
import { qk } from "../query/keys";

type UseSchedules = {
  schedules: ReadonlyArray<ScheduleView>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (draft: ScheduleDraftView) => Promise<ScheduleView>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  busy: boolean;
  mutationError: string | null;
};

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const useSchedules = (): UseSchedules => {
  const services = useServices();
  const { activeChannelId } = useActiveChannel();
  const qc = useQueryClient();
  const key = qk.schedules.list(activeChannelId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => services.listSchedules(),
  });

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: key }),
    [qc, key],
  );

  const saveMutation = useMutation({
    mutationFn: (draft: ScheduleDraftView) => services.saveSchedule(draft),
    onSuccess: () => invalidate(),
  });
  const setEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      services.setScheduleEnabled(id, enabled),
    onSuccess: () => invalidate(),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => services.deleteSchedule(id),
    onSuccess: () => invalidate(),
  });

  const busy =
    saveMutation.isPending ||
    setEnabledMutation.isPending ||
    removeMutation.isPending;
  const mutationError = useMemo(() => {
    const first =
      saveMutation.error ?? setEnabledMutation.error ?? removeMutation.error;
    return first ? errorMessage(first) : null;
  }, [saveMutation.error, setEnabledMutation.error, removeMutation.error]);

  return {
    schedules: query.data ?? [],
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
    save: (draft) => saveMutation.mutateAsync(draft),
    setEnabled: (id, enabled) => setEnabledMutation.mutateAsync({ id, enabled }),
    remove: (id) => removeMutation.mutateAsync(id),
    busy,
    mutationError,
  };
};

export default useSchedules;
