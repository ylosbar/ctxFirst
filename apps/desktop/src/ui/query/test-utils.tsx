/* eslint-disable react-refresh/only-export-components */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

// QueryClient configuré pour les tests : retry off, pas de cache persistant
// entre tests. Le helper est appelé dans chaque test pour garantir l'isolation.
export const makeTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

type QueryWrapperProps = PropsWithChildren<{ client?: QueryClient }>;

const QueryWrapper = ({ children, client }: QueryWrapperProps) => {
  const queryClient = client ?? makeTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

export default QueryWrapper;
export { QueryWrapper };
