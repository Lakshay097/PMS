import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate } from '../api/templates';

/**
 * Hook to fetch all templates
 */
export function useTemplates() {
  const { data: templates = [], error, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  });
  return { templates, error, isLoading };
}

/**
 * Hook to fetch a single template by ID
 */
export function useTemplate(id: string) {
  const { data: template, error, isLoading } = useQuery({
    queryKey: ['templates', id],
    queryFn: () => getTemplate(id),
    enabled: !!id,
  });
  return { template, error, isLoading };
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
