import { QueryClient } from "@tanstack/react-query";

// Données servies par une base SQLite locale via IPC : pas de latence réseau,
// pas de coût d'API, et toute mutation côté main process re-émet un WfEvent
// que le `WorkflowEventsBridge` traduit en `invalidateQueries`. Les défauts
// sont donc « invalidation event-driven, jamais time-driven ».
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
