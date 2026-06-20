import { api } from './client';

/**
 * Upload file request body
 */
export interface UploadFileRequest {
  fileName: string;
  fileData: string;
  mimeType: string;
  taskId?: string;
  reportId?: string;
}

/**
 * Upload file response
 */
export interface UploadFileResponse {
  fileId: string;
  fileName: string;
  webViewLink: string;
  webContentLink: string;
  uploadedAt: string;
}

/**
 * Upload a file to Google Drive
 */
export async function uploadFile(data: UploadFileRequest): Promise<UploadFileResponse> {
  return api.post<UploadFileResponse>('/upload-file', data);
}
