import { api } from './client';

/**
 * Task interface
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create task request
 */
export interface CreateTaskRequest {
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  dueDate: string;
}

/**
 * Update task request
 */
export interface UpdateTaskRequest {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  dueDate?: string;
}

/**
 * Get all tasks
 */
export async function getTasks(): Promise<Task[]> {
  return api.get<Task[]>('/tasks');
}

/**
 * Get a single task by ID
 */
export async function getTask(id: string): Promise<Task> {
  return api.get<Task>(`/tasks/${id}`);
}

/**
 * Create a new task
 */
export async function createTask(data: CreateTaskRequest): Promise<Task> {
  return api.post<Task>('/tasks', data);
}

/**
 * Update an existing task
 */
export async function updateTask(data: UpdateTaskRequest): Promise<Task> {
  return api.put<Task>(`/tasks/${data.id}`, data);
}

/**
 * Delete a task
 */
export async function deleteTask(id: string): Promise<void> {
  return api.delete<void>(`/tasks/${id}`);
}
