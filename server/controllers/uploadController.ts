import { Response } from 'express';
import { generateGoogleSheetsToken } from '../services/googleSheetsService';
import { config } from '../config';
import { BadRequestError, InternalServerError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth';

/**
 * Upload file request body
 */
interface UploadFileRequestBody {
  fileName: string;
  fileData: string;
  mimeType: string;
  taskId?: string;
  reportId?: string;
}

/**
 * Validates file upload parameters
 */
function validateFileUpload(fileName: string, fileData: string, mimeType: string): { valid: boolean; error?: string } {
  if (!fileName || !fileData || !mimeType) {
    return { valid: false, error: "File name, data, and MIME type are required" };
  }

  const fileSize = Buffer.from(fileData, 'base64').length;
  if (fileSize > config.MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File size exceeds 10MB limit" };
  }

  if (!config.ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return { valid: false, error: "File type not allowed" };
  }

  return { valid: true };
}

/**
 * POST /api/upload-file
 * Protected endpoint to upload files to Google Drive
 */
export async function uploadFileHandler(req: AuthRequest, res: Response): Promise<void> {
  const { fileName, fileData, mimeType, taskId, reportId } = req.body as UploadFileRequestBody;

  const validation = validateFileUpload(fileName, fileData, mimeType);
  if (!validation.valid) {
    throw new BadRequestError(validation.error || "Invalid file upload");
  }

  // Get Google Sheets access token directly instead of making HTTP request to self
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    throw new InternalServerError("Failed to authenticate with Google");
  }

  // Create folder structure in Google Drive
  const folderPath = `/BE/TaskReports/${taskId}/${reportId}`;
  
  // For simplicity, we'll upload directly to Drive with the folder structure in the name
  const driveFileName = `${folderPath}/${fileName}`;

  // Upload file to Google Drive
  const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokenData.accessToken}`,
    },
    body: JSON.stringify({
      name: driveFileName,
      mimeType: mimeType,
    }),
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    console.error("Google Drive upload failed:", errorText);
    throw new InternalServerError("Failed to upload file to Google Drive");
  }

  const uploadData = await uploadRes.json();

  // Get file URL (webViewLink)
  const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}?fields=webViewLink,webContentLink`, {
    headers: {
      'Authorization': `Bearer ${tokenData.accessToken}`,
    },
  });

  const fileDataResult = await fileRes.json();

  // Set file permissions to "anyone with the link can view"
  const permissionRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokenData.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  });

  if (!permissionRes.ok) {
    console.error("Failed to set file permissions:", await permissionRes.text());
    // Continue anyway - file is uploaded, just not publicly accessible
  }

  res.json({
    fileId: uploadData.id,
    fileName: fileName,
    webViewLink: fileDataResult.webViewLink,
    webContentLink: fileDataResult.webContentLink,
    uploadedAt: new Date().toISOString()
  });
}
