import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTasks, getTask, createTask, updateTask, deleteTask } from '../api/tasks';

/**
 * Hook to fetch all tasks
 */
export function useTasks() {
  const { data: tasks = [], error, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: getTasks,
  });
  return { tasks, error, isLoading };
}

/**
 * Hook to fetch a single task by ID
 */
export function useTask(id: string) {
  const { data: task, error, isLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => getTask(id),
    enabled: !!id,
  });
  return { task, error, isLoading };
}

/**
 * Hook to create a new task
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to update an existing task
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Hook to delete a task
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
