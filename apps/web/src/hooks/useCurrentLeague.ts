import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

export type CurrentLeague = { id: number; name: string; seasonName?: string };

export function useCurrentLeague() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['league-current'],
    queryFn: async () => {
      try {
        return await apiGet<{ league: CurrentLeague }>('/leagues/current');
      } catch (e) {
        if (e instanceof Error && (e.message === 'No league' || e.message.includes('No league')))
          return { league: null } as { league: CurrentLeague | null };
        throw e;
      }
    },
    retry: false,
  });
  return {
    league: data?.league ?? null,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
