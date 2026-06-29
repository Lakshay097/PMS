import { Response } from 'express';
import { config } from '../config';
import { BadRequestError, InternalServerError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Configure Cloudinary
 */
cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

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
 * Protected endpoint to upload files to Cloudinary
 */
export async function uploadFileHandler(req: AuthRequest, res: Response): Promise<void> {
  const { fileName, fileData, mimeType, taskId, reportId } = req.body as UploadFileRequestBody;

  logger.info(`Upload request received: fileName=${fileName}, mimeType=${mimeType}, taskId=${taskId}, reportId=${reportId}`);

  const validation = validateFileUpload(fileName, fileData, mimeType);
  if (!validation.valid) {
    logger.error(`File upload validation failed: ${validation.error}`);
    throw new BadRequestError(validation.error || "Invalid file upload");
  }

  // Convert base64 to buffer
  const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
  const buffer = Buffer.from(base64Data, 'base64');

  // Create folder structure in Cloudinary
  const folder = `TaskReports/${taskId}/${reportId}`;

  logger.info(`Uploading to Cloudinary: folder=${folder}, fileName=${fileName}`);

  try {
    // Upload to Cloudinary using resource_type: 'raw' for PDFs and non-image files
    const uploadResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: folder,
          public_id: fileName.replace(/[^a-zA-Z0-9._-]/g, '_'),
          resource_type: 'raw',
          use_filename: true,
          unique_filename: false,
          access_mode: 'public',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            logger.info(`Cloudinary full result: ${JSON.stringify({
            public_id: result?.public_id,
            secure_url: result?.secure_url,
            access_mode: result?.access_mode,
            type: result?.type,
            resource_type: result?.resource_type,
          }, null, 2)}`);
            resolve(result);
          }
        }
      ).end(buffer);
    });

    logger.info(`File uploaded successfully to Cloudinary: publicId=${uploadResult.public_id}`);

    res.json({
      fileId: uploadResult.public_id,
      fileName: fileName,
      webViewLink: uploadResult.secure_url,
      webContentLink: uploadResult.secure_url,
      uploadedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Cloudinary upload failed: ${JSON.stringify(error, null, 2)}`);
    throw new InternalServerError("Failed to upload file to Cloudinary");
  }
}
