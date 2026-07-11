import { QueryClient } from "@tanstack/react-query";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 10_000,
      },
      mutations: { retry: false },
    },
  });
}
