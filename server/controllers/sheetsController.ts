import { Request, Response } from 'express';
import { generateGoogleSheetsToken } from '../services/googleSheetsService';
import { logger } from '../utils/logger';

// Rate limiting: Queue to prevent too many concurrent requests
interface QueueItem {
  fn: () => Promise<any>;
  delay: number;
}
const requestQueue: Array<QueueItem> = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const item = requestQueue.shift();
    if (item) {
      try {
        await item.fn();
      } catch (error) {
        logger.error('Error processing queued request:', error);
      }
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, item.delay));
    }
  }
  
  isProcessingQueue = false;
}

function queueRequest<T>(requestFn: () => Promise<T>, delay = 300): Promise<T> {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      fn: async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      },
      delay
    });
    
    if (!isProcessingQueue) {
      processQueue();
    }
  });
}

// Exponential backoff retry logic
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 8): Promise<globalThis.Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limit exceeded - use more aggressive exponential backoff for Google Sheets API
        // Start with 3s base and increase exponentially with jitter
        const baseDelay = 3000;
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 2000;
        logger.warn(`Rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (response.status >= 500) {
        // Server error - retry with backoff
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * GET /api/sheets/:spreadsheetId/metadata
 * Proxy for getting spreadsheet metadata
 */
export async function getSpreadsheetMetadataHandler(req: Request, res: Response) {
  try {
    const { spreadsheetId } = req.params;
    const tokenData = await generateGoogleSheetsToken();
    
    if (!tokenData) {
      return res.status(400).json({ 
        error: "Google Service Account credentials not provided" 
      });
    }

    const response = await queueRequest(() => fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      {
        headers: { Authorization: `Bearer ${tokenData.accessToken}` }
      }
    ), 300);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to get spreadsheet metadata:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to get spreadsheet metadata', details: errorText });
    }

    const data = await response.json();
    return res.json(data);

  } catch (error) {
    logger.error('Error in getSpreadsheetMetadata:', error);
    return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * GET /api/sheets/spreadsheet
 * Proxy for getting or creating spreadsheet
 */
export async function getOrCreateSpreadsheetHandler(req: Request, res: Response) {
  try {
    const tokenData = await generateGoogleSheetsToken();
    
    if (!tokenData) {
      return res.status(400).json({ 
        error: "Google Service Account credentials not provided" 
      });
    }

    const { accessToken, spreadsheetId } = tokenData;

    // If spreadsheet ID is provided, try to access it
    if (spreadsheetId) {
      const metadataRes = await queueRequest(() => fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      ), 300);

      if (metadataRes.ok) {
        const metadata = await metadataRes.json();
        return res.json({ spreadsheetId, metadata });
      }
    }

    // Search for existing spreadsheet in Drive
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      "name='PMS Systems Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
    )}`;

    const searchRes = await queueRequest(() => fetchWithRetry(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }), 300);

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const foundId = searchData.files[0].id;
        const metadataRes = await queueRequest(() => fetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${foundId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        ), 300);
        const metadata = await metadataRes.json();
        return res.json({ spreadsheetId: foundId, metadata });
      }
    }

    // Create new spreadsheet
    const createRes = await queueRequest(() => fetchWithRetry('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: 'PMS Systems Database'
        },
        sheets: [
          { properties: { title: 'users' } },
          { properties: { title: 'teams' } },
          { properties: { title: 'templates' } },
          { properties: { title: 'tasks' } },
          { properties: { title: 'reports' } },
          { properties: { title: 'followups' } },
          { properties: { title: 'auditlogs' } },
          { properties: { title: 'settings' } },
          { properties: { title: 'subtasks' } },
          { properties: { title: 'comments' } }
        ]
      })
    }), 500);

    if (!createRes.ok) {
      const errorText = await createRes.text();
      logger.error('Failed to create spreadsheet:', createRes.status, errorText);
      return res.status(500).json({ error: 'Failed to create spreadsheet', details: errorText });
    }

    const created = await createRes.json();
    return res.json({ spreadsheetId: created.spreadsheetId, metadata: created });

  } catch (error) {
    logger.error('Error in getOrCreateSpreadsheet:', error);
    return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * GET /api/sheets/:spreadsheetId/values/:range
 * Proxy for getting sheet values
 */
export async function getValuesHandler(req: Request, res: Response) {
  try {
    const { spreadsheetId, range } = req.params;
    const tokenData = await generateGoogleSheetsToken();
    
    if (!tokenData) {
      return res.status(400).json({ error: "Google Service Account credentials not provided" });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
    
    const response = await queueRequest(() => fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${tokenData.accessToken}` }
    }), 300);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to get values:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to get values', details: errorText });
    }

    const data = await response.json();
    return res.json(data);

  } catch (error) {
    logger.error('Error in getValues:', error);
    return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * PUT /api/sheets/:spreadsheetId/values/:range
 * Proxy for updating sheet values
 */
export async function updateValuesHandler(req: Request, res: Response) {
  try {
    const { spreadsheetId, range } = req.params;
    const { values, valueInputOption = 'USER_ENTERED' } = req.body;
    const tokenData = await generateGoogleSheetsToken();
    
    if (!tokenData) {
      return res.status(400).json({ error: "Google Service Account credentials not provided" });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=${valueInputOption}`;
    
    const response = await queueRequest(() => fetchWithRetry(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }), 500);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to update values:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to update values', details: errorText });
    }

    const data = await response.json();
    return res.json(data);

  } catch (error) {
    logger.error('Error in updateValues:', error);
    return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * POST /api/sheets/:spreadsheetId/values/:range/clear
 * Proxy for clearing sheet values
 */
export async function clearValuesHandler(req: Request, res: Response) {
  try {
    const { spreadsheetId, range } = req.params;
    const tokenData = await generateGoogleSheetsToken();
    
    if (!tokenData) {
      return res.status(400).json({ error: "Google Service Account credentials not provided" });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`;
    
    const response = await queueRequest(() => fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json'
      }
    }), 500);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to clear values:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to clear values', details: errorText });
    }

    const data = await response.json();
    return res.json(data);

  } catch (error) {
    logger.error('Error in clearValues:', error);
    return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * POST /api/sheets/:spreadsheetId/values/:range/append
 * Proxy for appending sheet values
 */
export async function appendValuesHandler(req: Request, res: Response) {
  try {
    const { spreadsheetId, range } = req.params;
    const { values, valueInputOption = 'RAW' } = req.body;
    const tokenData = await generateGoogleSheetsToken();
    
    if (!tokenData) {
      return res.status(400).json({ error: "Google Service Account credentials not provided" });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=${valueInputOption}`;
    
    const response = await queueRequest(() => fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }), 500);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to append values:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to append values', details: errorText });
    }

    const data = await response.json();
    return res.json(data);

  } catch (error) {
    logger.error('Error in appendValues:', error);
    return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * GET /api/sheets/:spreadsheetId/values:batchGet
 * Proxy for batch getting sheet values
 */
export async function batchGetValuesHandler(req: Request, res: Response) {
  try {
    const { spreadsheetId } = req.params;
    const { ranges } = req.query;
    const tokenData = await generateGoogleSheetsToken();
    
    if (!tokenData) {
      return res.status(400).json({ error: "Google Service Account credentials not provided" });
    }

    const rangesArray = Array.isArray(ranges) ? ranges : [ranges];
    const rangesParam = rangesArray
      .map((r: string) => `ranges=${encodeURIComponent(r)}`)
      .join('&');

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesParam}&valueRenderOption=FORMATTED_VALUE`;
    
    const response = await queueRequest(() => fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${tokenData.accessToken}` }
    }), 300);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to batch get values:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to batch get values', details: errorText });
    }

    const data = await response.json();
    return res.json(data);

  } catch (error) {
    logger.error('Error in batchGetValues:', error);
    return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}
