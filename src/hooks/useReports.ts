import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReports, getReport, createReport, updateReport, deleteReport } from '../api/reports';

/**
 * Hook to fetch all reports
 */
export function useReports() {
  return useQuery({
    queryKey: ['reports'],
    queryFn: getReports,
  });
}

/**
 * Hook to fetch a single report by ID
 */
export function useReport(id: string) {
  return useQuery({
    queryKey: ['reports', id],
    queryFn: () => getReport(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new report
 */
export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

/**
 * Hook to update a report
 */
export function useUpdateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

/**
 * Hook to delete a report
 */
export function useDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}
