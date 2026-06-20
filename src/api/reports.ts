import { api } from './client';

/**
 * Report interface
 */
export interface Report {
  id: string;
  title: string;
  description: string;
  taskId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create report request
 */
export interface CreateReportRequest {
  title: string;
  description: string;
  taskId: string;
}

/**
 * Update report request
 */
export interface UpdateReportRequest {
  id: string;
  title?: string;
  description?: string;
  taskId?: string;
  status?: string;
}

/**
 * Get all reports
 */
export async function getReports(): Promise<Report[]> {
  return api.get<Report[]>('/reports');
}

/**
 * Get a single report by ID
 */
export async function getReport(id: string): Promise<Report> {
  return api.get<Report>(`/reports/${id}`);
}

/**
 * Create a new report
 */
export async function createReport(data: CreateReportRequest): Promise<Report> {
  return api.post<Report>('/reports', data);
}

/**
 * Update an existing report
 */
export async function updateReport(data: UpdateReportRequest): Promise<Report> {
  return api.put<Report>(`/reports/${data.id}`, data);
}

/**
 * Delete a report
 */
export async function deleteReport(id: string): Promise<void> {
  return api.delete<void>(`/reports/${id}`);
}
