import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate } from '../api/templates';

/**
 * Hook to fetch all templates
 */
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  });
}

/**
 * Hook to fetch a single template by ID
 */
export function useTemplate(id: string) {
  return useQuery({
    queryKey: ['templates', id],
    queryFn: () => getTemplate(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new template
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

/**
 * Hook to update a template
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

/**
 * Hook to delete a template
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}
