import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTeams, getTeam, createTeam, updateTeam, deleteTeam } from '../api/teams';

/**
 * Hook to fetch all teams
 */
export function useTeams() {
  const { data: teams = [], error, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: getTeams,
  });
  return { teams, error, isLoading };
}

/**
 * Hook to fetch a single team by ID
 */
export function useTeam(id: string) {
  const { data: team, error, isLoading } = useQuery({
    queryKey: ['teams', id],
    queryFn: () => getTeam(id),
    enabled: !!id,
  });
  return { team, error, isLoading };
}

/**
 * Hook to create a new team
 */
export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

/**
 * Hook to update a team
 */
export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateTeam(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

/**
 * Hook to delete a team
 */
export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}
