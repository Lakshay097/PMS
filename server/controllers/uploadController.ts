import { Response } from 'express';
import { config } from '../config';
import { BadRequestError, InternalServerError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';

/**
 * Configure Cloudinary
 */
cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

// Log config details for debugging
logger.info(`Cloudinary configured: cloud_name=${config.CLOUDINARY_CLOUD_NAME}, api_key=${config.CLOUDINARY_API_KEY}, api_secret_length=${config.CLOUDINARY_API_SECRET?.length || 0}`);
logger.info(`Cloudinary secret fingerprint: ${crypto.createHash('sha256').update(config.CLOUDINARY_API_SECRET || '').digest('hex').substring(0, 12)}`);
logger.info(`Cloudinary secret first 4 chars: ${(config.CLOUDINARY_API_SECRET || '').substring(0, 4)}`);
logger.info(`Cloudinary secret last 4 chars: ${(config.CLOUDINARY_API_SECRET || '').slice(-4)}`);
logger.info(`Cloudinary secret hex: ${Buffer.from(config.CLOUDINARY_API_SECRET || '').toString('hex')}`);

/**
 * Upload file request body
 */
interface UploadFileRequestBody {
  fileName: string;
  fileData: string;
  mimeType: string;
  taskId?: string;
  reportId?: string;
  teamId?: string;
  submissionId?: string;
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

  const fileExtension = fileName.split('.').pop()?.toLowerCase();
  
  logger.info(`File upload validation: fileName=${fileName}, mimeType=${mimeType}, fileExtension=${fileExtension}`);
  logger.info(`Allowed MIME types: ${config.ALLOWED_MIME_TYPES.join(', ')}`);

  // Check MIME type whitelist
  if (!config.ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    // Fallback: check file extension for CSV files (browsers may send inconsistent MIME types)
    if (fileExtension === 'csv') {
      // Allow CSV files regardless of MIME type
      logger.info(`CSV file allowed via extension fallback (MIME type was: ${mimeType})`);
      return { valid: true };
    }
    logger.error(`File type rejected: MIME type ${mimeType} not in whitelist, extension ${fileExtension}`);
    return { valid: false, error: `File type not allowed. Received MIME type: ${mimeType}` };
  }

  logger.info(`File type allowed: MIME type ${mimeType} in whitelist`);
  return { valid: true };
}

/**
 * Resolves the Cloudinary folder path based on the upload context.
 *
 * There are two supported contexts today:
 *  - Task report uploads:      requires taskId + reportId  -> TaskReports/{taskId}/{reportId}
 *  - Team submission uploads:  requires teamId + submissionId -> TeamSubmissions/{teamId}/{submissionId}
 *
 * FIX: Previously this always built `TaskReports/${taskId}/${reportId}` regardless of
 * which fields were actually present, so callers that only had a teamId/submissionId
 * (e.g. team weekly submissions) silently produced "TaskReports/undefined/undefined/...".
 * Now we detect the intended context and fail loudly if its required ids are missing,
 * instead of ever uploading to a path containing "undefined".
 */
function resolveUploadFolder(body: UploadFileRequestBody): string {
  const { taskId, reportId, teamId, submissionId } = body;

  const hasTeamContext = Boolean(teamId || submissionId);
  const hasTaskContext = Boolean(taskId || reportId);

  if (hasTeamContext && hasTaskContext) {
    throw new BadRequestError(
      'Upload request specified both task-report and team-submission identifiers; only one context is allowed.'
    );
  }

  if (hasTeamContext) {
    if (!teamId || !submissionId) {
      throw new BadRequestError(
        `Team submission upload requires both teamId and submissionId. Received teamId=${teamId ?? 'missing'}, submissionId=${submissionId ?? 'missing'}`
      );
    }
    return `TeamSubmissions/${teamId}/${submissionId}`;
  }

  if (hasTaskContext) {
    if (!taskId || !reportId) {
      throw new BadRequestError(
        `Task report upload requires both taskId and reportId. Received taskId=${taskId ?? 'missing'}, reportId=${reportId ?? 'missing'}`
      );
    }
    return `TaskReports/${taskId}/${reportId}`;
  }

  throw new BadRequestError(
    'Upload request is missing required context: expected (taskId + reportId) or (teamId + submissionId).'
  );
}

/**
 * POST /api/upload-file
 * Protected endpoint to upload files to Cloudinary
 */
export async function uploadFileHandler(req: AuthRequest, res: Response): Promise<void> {
  const { fileName, fileData, mimeType, taskId, reportId, teamId, submissionId } = req.body as UploadFileRequestBody;

  logger.info(`Upload request received: fileName=${fileName}, mimeType=${mimeType}, taskId=${taskId}, reportId=${reportId}, teamId=${teamId}, submissionId=${submissionId}`);

  const validation = validateFileUpload(fileName, fileData, mimeType);
  if (!validation.valid) {
    logger.error(`File upload validation failed: ${validation.error}`);
    throw new BadRequestError(validation.error || "Invalid file upload");
  }

  // Convert base64 to buffer
  const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
  const buffer = Buffer.from(base64Data, 'base64');

  // Create folder structure in Cloudinary
  // FIX: resolveUploadFolder() validates that the required ids for the detected
  // context are present and throws BadRequestError (400) instead of silently
  // uploading to a folder containing "undefined".
  const folder = resolveUploadFolder({ fileName, fileData, mimeType, taskId, reportId, teamId, submissionId });

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
  } catch (error: any) {
    logger.error(`Cloudinary upload failed: ${error?.message || JSON.stringify(error)}`);
    if (error?.http_code) logger.error(`HTTP Code: ${error.http_code}`);
    if (error?.code) logger.error(`Cloudinary Code: ${error.code}`);
    logger.error(`Cloudinary config: cloud_name=${config.CLOUDINARY_CLOUD_NAME}, api_key=${config.CLOUDINARY_API_KEY}, api_secret=${config.CLOUDINARY_API_SECRET ? 'SET' : 'NOT_SET'}`);
    logger.error(`Upload details: folder=${folder}, fileName=${fileName}, fileSize=${buffer.length}, mimeType=${mimeType}`);

    // Manual signature recomputation for debugging
    if (error?.message?.includes('Invalid Signature') && error?.message?.includes('String to sign')) {
      const match = error.message.match(/String to sign - '([^']+)'/);
      if (match) {
        const stringToSign = match[1];
        const manualSig = crypto.createHash('sha1').update(stringToSign + config.CLOUDINARY_API_SECRET).digest('hex');
        logger.error(`Manual signature recomputation: ${manualSig}`);
        logger.error(`String to sign: ${stringToSign}`);
      }
    }

    throw new InternalServerError("Failed to upload file to Cloudinary");
  }
}