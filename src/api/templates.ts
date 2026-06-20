import { api } from './client';

/**
 * Template interface
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create template request
 */
export interface CreateTemplateRequest {
  name: string;
  description: string;
  content: string;
}

/**
 * Update template request
 */
export interface UpdateTemplateRequest {
  id: string;
  name?: string;
  description?: string;
  content?: string;
}

/**
 * Get all templates
 */
export async function getTemplates(): Promise<Template[]> {
  return api.get<Template[]>('/templates');
}

/**
 * Get a single template by ID
 */
export async function getTemplate(id: string): Promise<Template> {
  return api.get<Template>(`/templates/${id}`);
}

/**
 * Create a new template
 */
export async function createTemplate(data: CreateTemplateRequest): Promise<Template> {
  return api.post<Template>('/templates', data);
}

/**
 * Update an existing template
 */
export async function updateTemplate(data: UpdateTemplateRequest): Promise<Template> {
  return api.put<Template>(`/templates/${data.id}`, data);
}

/**
 * Delete a template
 */
export async function deleteTemplate(id: string): Promise<void> {
  return api.delete<void>(`/templates/${id}`);
}
