import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, getUser, updateUser, deleteUser } from '../api/users';

/**
 * Hook to fetch all users
 */
export function useUsers() {
  const { data: users = [], error, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });
  return { users, error, isLoading };
}

/**
 * Hook to fetch a single user by ID
 */
export function useUser(id: string) {
  const { data: user, error, isLoading } = useQuery({
    queryKey: ['users', id],
    queryFn: () => getUser(id),
    enabled: !!id,
  });
  return { user, error, isLoading };
}

/**
 * Hook to update a user
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/**
 * Hook to delete a user
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
