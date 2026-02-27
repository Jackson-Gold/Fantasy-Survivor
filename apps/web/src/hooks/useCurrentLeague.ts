import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

export type CurrentLeague = { id: number; name: string; seasonName?: string };

export function useCurrentLeague() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['league-current'],
    queryFn: () => apiGet<{ league: CurrentLeague }>('/leagues/current'),
    retry: false,
  });
  return {
    league: data?.league ?? null,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
