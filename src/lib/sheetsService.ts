// Google Sheets integration - Primary database layer
// Uses backend proxy to avoid CORS issues in browser
import { logger } from '../utils/logger';
import { api } from '../api/client';

export interface GoogleSheetsTokenResponse {
  accessToken: string;
  spreadsheetId: string | null;
  expiresIn: number;
  serviceAccountActive: boolean;
}

export const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

export const HEADERS = {
  users: ['UserID', 'FullName', 'Email', 'Role', 'ManagerEmail', 'TeamID', 'TeamName', 'Active', 'CanCreateFollowUp', 'CanCloseTask', 'CreatedAt', 'UpdatedAt', 'Password'],
  teams: ['TeamID', 'TeamName', 'StakeholderEmail', 'Active'],
  templates: ['TemplateID', 'Title', 'Description', 'Category', 'Priority', 'RecurrenceType', 'StartDate', 'NextGenerationDate', 'LastGeneratedDate', 'AssignedByEmail', 'AssignedToEmail', 'AssignedToRole', 'TeamID', 'Active', 'CreatedAt', 'UpdatedAt'],
  tasks: ['TaskID', 'TemplateID', 'ParentTaskID', 'Title', 'Description', 'Category', 'Priority', 'TaskType', 'RecurrenceType', 'CycleKey', 'StartDate', 'DueDate', 'AssignedByEmail', 'AssignedToEmail', 'AssignedToRole', 'TeamID', 'Status', 'PercentComplete', 'LastReportSummary', 'RequiresFollowUp', 'FollowUpCount', 'CompletionDate', 'CloseRemark', 'AttachmentLink', 'CreatedAt', 'UpdatedAt', 'Active'],
  reports: ['ReportID', 'TaskID', 'SubmittedByEmail', 'ReportDate', 'StatusUpdate', 'WorkSummary', 'PercentComplete', 'Blockers', 'NextAction', 'AttachmentLink', 'CreatedAt'],
  followups: ['FollowUpID', 'ParentTaskID', 'NewTaskID', 'FollowUpNumber', 'CreatedByEmail', 'Reason', 'CreatedAt', 'Status'],
  auditlogs: ['LogID', 'EntityType', 'EntityID', 'Action', 'OldValueJSON', 'NewValueJSON', 'ActionByEmail', 'ActionDateTime'],
  settings: ['Key', 'Value'],
  subtasks: ['SubtaskID', 'TaskID', 'Title', 'IsDone', 'CreatedAt', 'CreatedBy', 'UpdatedAt'],
  comments: ['CommentID', 'TaskID', 'Comment', 'CreatedAt', 'CreatedBy']
};

let cachedSpreadsheetId: string | null = null;

// Request queue to prevent rate limiting
let requestQueue: Promise<unknown> = Promise.resolve();

// Queue a request to prevent rate limiting
async function queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
  requestQueue = requestQueue.then(requestFn, requestFn);
  return requestQueue as Promise<T>;
}

// Initialize auth state and check service account API
export const initAuth = (
  onAuthSuccess?: (token: string) => void,
  onAuthFailure?: (error: Error) => void
) => {
  let active = true;

  // Check for service account token from backend
  api.get<GoogleSheetsTokenResponse>('/token', { skipAuth: true })
    .then(data => {
      if (!active) return;
      if (data && data.accessToken) {
        if (data.spreadsheetId) {
          cachedSpreadsheetId = data.spreadsheetId;
        }
        
        if (onAuthSuccess) {
          onAuthSuccess(data.accessToken);
        }
      } else {
        const error = new Error('Service account token not available. Google Sheets integration is required.');
        if (onAuthFailure) onAuthFailure(error);
      }
    })
    .catch(err => {
      console.error("Service Account API check failed:", err);
      if (active && onAuthFailure) {
        onAuthFailure(err instanceof Error ? err : new Error('Failed to initialize Google Sheets authentication'));
      }
    });

  return () => {
    active = false;
  };
};

export const getSpreadsheetId = (): string | null => {
  return cachedSpreadsheetId;
};

export const logout = async () => {
  cachedSpreadsheetId = null;
  // Clear the db_initialized flag on logout to force fresh check on next login
  localStorage.removeItem('db_initialized');
};

// Clear cached spreadsheet ID to force re-search
export const clearCachedSpreadsheetId = () => {
  cachedSpreadsheetId = null;
  logger.log('Cached spreadsheet ID cleared. Will re-search on next access.');
};

// HELPER: Convert array of objects to sheet rows
export function objectsToRows(data: any[], headers: string[]): any[][] {
  const rows = [headers];
  data.forEach(item => {
    const row = headers.map(header => {
      const val = item[header];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
    rows.push(row);
  });
  return rows;
}

// HELPER: Convert 2D sheet rows to objects
export function rowsToObjects<T>(rows: any[][], headers: string[]): T[] {
  if (!rows || rows.length <= 1) return [];
  const sheetHeaders = rows[0];
  const items: T[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const item: any = {};
    headers.forEach((header, hIdx) => {
      const colIdx = sheetHeaders.indexOf(header);
      let val = colIdx >= 0 && row[colIdx] !== undefined ? row[colIdx] : '';
      
      // Parse values back to correct native types
      if (val === 'true') {
        val = true;
      } else if (val === 'false') {
        val = false;
      } else if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          val = JSON.parse(val);
        } catch {
          // Fallback to string if not parseable JSON
        }
      } else if (val !== '' && !isNaN(Number(val)) && header !== 'UserID' && header !== 'TeamID' && header !== 'TemplateID' && header !== 'TaskID' && header !== 'ReportID' && header !== 'FollowUpID' && header !== 'LogID') {
        val = Number(val);
      }
      item[header] = val;
    });
    items.push(item as T);
  }

  return items;
}

// REST Google API Functions (via backend proxy to avoid CORS)
// Internal, unqueued Sheets API operations to avoid deadlock on cross-calls
const sheetsApiInternal = {
  async getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    const res = await api.get(`/sheets/${spreadsheetId}/metadata`, { skipAuth: true });
    return res;
  },

  // Check if a spreadsheet exists, create it if it doesn't
  async getOrCreateSpreadsheet(): Promise<string> {
    // 1. Try using cached spreadsheet ID
    if (cachedSpreadsheetId) {
      try {
        const metadata = await sheetsApiInternal.getSpreadsheetMetadata(cachedSpreadsheetId);
        if (metadata) {
          logger.log('Using cached Google Spreadsheet:', cachedSpreadsheetId);
          return cachedSpreadsheetId;
        }
      } catch (e) {
        console.warn('Cached spreadsheet could not be accessed, re-searching...', e);
        cachedSpreadsheetId = null;
      }
    }

    // 2. Get or create spreadsheet via backend proxy
    logger.log('Getting or creating spreadsheet via backend proxy...');
    const data = await api.get<{ spreadsheetId: string; metadata: any }>('/sheets/spreadsheet', { skipAuth: true });
    
    cachedSpreadsheetId = data.spreadsheetId;
    logger.log('Successfully obtained spreadsheet ID:', data.spreadsheetId);
    return data.spreadsheetId;
  },

  // Save full collection to Google Sheets with atomic write-then-clear-trailing to avoid data loss
  async saveCollection(sheetName: keyof typeof HEADERS, data: any[]): Promise<void> {
    const spreadsheetId = await sheetsApiInternal.getOrCreateSpreadsheet();
    if (!spreadsheetId) {
      throw new Error('Failed to get spreadsheet ID.');
    }

    const headers = HEADERS[sheetName];
    const rows = objectsToRows(data, headers);

    logger.log(`Writing collection [${sheetName}] containing ${data.length} records to Google Sheets...`);

    // Write new content first (safeguard against data loss)
    await api.put(`/sheets/${spreadsheetId}/values/${sheetName}!A1`, { values: rows }, { skipAuth: true });

    // Clear any trailing rows from the previous dataset
    const clearStartRow = rows.length + 1;
    await api.post(`/sheets/${spreadsheetId}/values/${sheetName}!A${clearStartRow}:Z9999/clear`, {}, { skipAuth: true });
    
    logger.log(`Successfully saved collection [${sheetName}] to Google Sheets.`);
  },

  // Append a single record to Google Sheets using the append endpoint
  async appendRecord(sheetName: keyof typeof HEADERS, record: any): Promise<void> {
    const spreadsheetId = await sheetsApiInternal.getOrCreateSpreadsheet();
    if (!spreadsheetId) {
      throw new Error('Failed to get spreadsheet ID.');
    }

    const headers = HEADERS[sheetName];
    const row = headers.map(header => {
      const val = record[header];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });

    logger.log(`Appending 1 record to collection [${sheetName}] in Google Sheets...`);
    await api.post(`/sheets/${spreadsheetId}/values/${sheetName}!A1/append`, { values: [row] }, { skipAuth: true });
    logger.log(`Successfully appended record to [${sheetName}] in Google Sheets.`);
  },

  // Fetch concrete sheet collection of records
  async getCollection<T>(sheetName: keyof typeof HEADERS): Promise<T[]> {
    const spreadsheetId = await sheetsApiInternal.getOrCreateSpreadsheet();
    if (!spreadsheetId) {
      throw new Error('Failed to get spreadsheet ID.');
    }

    const headers = HEADERS[sheetName];
    
    logger.log(`Fetching collection [${sheetName}] from Google Sheets database...`);
    const payload = await api.get<{ values: any[][] }>(`/sheets/${spreadsheetId}/values/${sheetName}!A1:Z9999`, { skipAuth: true });
    
    return rowsToObjects<T>(payload.values, headers);
  },

  async batchGetCollections(
    collections: string[]
  ): Promise<Record<string, any[]>> {
    const spreadsheetId = await sheetsApiInternal.getOrCreateSpreadsheet();
    
    // Build ranges query: users!A1:Z9999, tasks!A1:Z9999, etc.
    const rangesParam = collections
      .map(c => `ranges=${encodeURIComponent(`${c}!A1:Z9999`)}`)
      .join('&');

    logger.log(`Batch fetching ${collections.length} collections from Google Sheets...`);
    const data = await api.get<{ valueRanges: any[] }>(`/sheets/${spreadsheetId}/values:batchGet?${rangesParam}`, { skipAuth: true });
    
    const result: Record<string, any[]> = {};

    // data.valueRanges is an array matching the order of collections
    (data.valueRanges || []).forEach((valueRange: any, index: number) => {
      const collectionName = collections[index];
      const rows = valueRange.values || [];
      
      if (rows.length === 0) {
        result[collectionName] = [];
        return;
      }

      // First row is headers
      const headers = rows[0] as string[];
      const items = rows.slice(1).map((row: any[]) => {
        const obj: Record<string, any> = {};
        headers.forEach((header, i) => {
          let value = row[i] ?? '';
          // Parse JSON arrays/objects stored as strings
          if (typeof value === 'string' && 
              (value.startsWith('[') || value.startsWith('{'))) {
            try { value = JSON.parse(value); } catch { /* keep as string */ }
          }
          // Parse booleans
          if (value === 'true') value = true;
          if (value === 'false') value = false;
          obj[header] = value;
        });
        return obj;
      });

      result[collectionName] = items;
    });

    return result;
  }
};

// REST Google API Functions (public queued wrappers)
export const sheetsApi = {
  getOrCreateSpreadsheet(): Promise<string> {
    return queueRequest(() => sheetsApiInternal.getOrCreateSpreadsheet());
  },
  getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    return queueRequest(() => sheetsApiInternal.getSpreadsheetMetadata(spreadsheetId));
  },
  saveCollection(sheetName: keyof typeof HEADERS, data: any[]): Promise<void> {
    return queueRequest(() => sheetsApiInternal.saveCollection(sheetName, data));
  },
  appendRecord(sheetName: keyof typeof HEADERS, record: any): Promise<void> {
    return queueRequest(() => sheetsApiInternal.appendRecord(sheetName, record));
  },
  getCollection<T>(sheetName: keyof typeof HEADERS): Promise<T[]> {
    return queueRequest(() => sheetsApiInternal.getCollection<T>(sheetName));
  },
  batchGetCollections(collections: string[]): Promise<Record<string, any[]>> {
    return queueRequest(() => sheetsApiInternal.batchGetCollections(collections));
  }
};
