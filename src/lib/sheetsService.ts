// Google Sheets integration - Primary database layer
// Uses service account token for authentication with retry logic and proper error handling

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

let cachedAccessToken: string | null = null;
let cachedSpreadsheetId: string | null = null;

// Request queue to prevent rate limiting
let requestQueue: Promise<unknown> = Promise.resolve();

// Retry configuration
const MAX_RETRIES = 5; // Increased from 3
const INITIAL_RETRY_DELAY = 2000; // Increased from 1000ms

// Exponential backoff with jitter
function getRetryDelay(attempt: number): number {
  const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * 500; // Increased jitter to 500ms
  return baseDelay + jitter;
}

// Queue a request to prevent rate limiting
async function queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
  requestQueue = requestQueue.then(requestFn, requestFn);
  return requestQueue as Promise<T>;
}

// Generic fetch with retry logic
async function fetchWithRetry(url: string, options: RequestInit, attempt: number = 0): Promise<Response> {
  try {
    const response = await fetch(url, options);
    
    // Retry on 5xx errors or 429 (rate limit)
    if (!response.ok && (response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
      const delay = getRetryDelay(attempt);
      console.warn(`Request failed with status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, attempt + 1);
    }
    
    return response;
  } catch (error) {
    // Retry on network errors
    if (attempt < MAX_RETRIES) {
      const delay = getRetryDelay(attempt);
      console.warn(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw error;
  }
}

// Initialize auth state and check service account API
export const initAuth = (
  onAuthSuccess?: (token: string) => void,
  onAuthFailure?: (error: Error) => void
) => {
  let active = true;

  // Check for service account token from backend
  fetch('/api/token')
    .then(async res => {
      if (res.ok) return res.json();
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to get service account token');
    })
    .then(data => {
      if (!active) return;
      if (data && data.accessToken) {
        cachedAccessToken = data.accessToken;
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

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getSpreadsheetId = (): string | null => {
  return cachedSpreadsheetId;
};

export const logout = async () => {
  cachedAccessToken = null;
  cachedSpreadsheetId = null;
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

// REST Google API Functions
export const sheetsApi = {
  // Check if a spreadsheet exists, create it if it doesn't
  async getOrCreateSpreadsheet(): Promise<string> {
    return queueRequest(async () => {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Google Sheets authentication failed. Service account token not available. Please configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in your environment variables.');
      }

      // 1. Try using cached spreadsheet ID
      if (cachedSpreadsheetId) {
        try {
          const metadata = await this.getSpreadsheetMetadata(cachedSpreadsheetId);
          if (metadata) {
            console.log('Using cached Google Spreadsheet:', cachedSpreadsheetId);
            return cachedSpreadsheetId;
          }
        } catch (e) {
          console.warn('Cached spreadsheet could not be accessed, re-searching...', e);
          cachedSpreadsheetId = null;
        }
      }

      // 2. Query Drive to locate "PMS Systems Database"
      console.log('Searching for database file in Google Drive...');
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        "name='PMS Systems Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
      )}`;

      const searchRes = await fetchWithRetry(searchUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!searchRes.ok) {
        // Explicitly throw rate limit and service unavailable errors to prevent fallback to create
        if (searchRes.status === 429) {
          throw new Error(`Rate limit exceeded (429) when searching Drive. Please retry later.`);
        }
        if (searchRes.status === 503) {
          throw new Error(`Service unavailable (503) when searching Drive. Please retry later.`);
        }
        throw new Error(`Failed to query Google Drive. Status: ${searchRes.statusText}. Please verify your service account has Drive API permissions.`);
      }

      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const spreadId = searchData.files[0].id;
        cachedSpreadsheetId = spreadId;
        console.log('Found existing database spreadsheet on Google Drive:', spreadId);
        return spreadId;
      }

      // 3. Not found, create a brand new Google Spreadsheet with all required tabs
      console.log('No database spreadsheet found. Creating a new "PMS Systems Database" with all tabs...');
      const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
      
      const requiredSheets = Object.keys(HEADERS).map(name => ({
        properties: { title: name }
      }));

      const createRes = await fetchWithRetry(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: 'PMS Systems Database'
          },
          sheets: requiredSheets
        })
      });

      if (!createRes.ok) {
        const errPayload = await createRes.json().catch(() => ({}));
        console.error('Failed to create spreadsheet', errPayload);
        // Explicitly throw rate limit and service unavailable errors
        if (createRes.status === 429) {
          throw new Error(`Rate limit exceeded (429) when creating spreadsheet. Please retry later.`);
        }
        if (createRes.status === 503) {
          throw new Error(`Service unavailable (503) when creating spreadsheet. Please retry later.`);
        }
        throw new Error(`Failed to create Google Spreadsheet database. Status: ${createRes.statusText}. Please verify your service account has Sheets API permissions.`);
      }

      const createdSpreadsheet = await createRes.json();
      const newSpreadId = createdSpreadsheet.spreadsheetId;
      cachedSpreadsheetId = newSpreadId;
      console.log('Successfully created database spreadsheet on Google Drive with ID:', newSpreadId);
      return newSpreadId;
    });
  },

  async getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    return queueRequest(async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Unauthenticated.');

      const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        // Explicitly throw rate limit and service unavailable errors to prevent fallback to create
        if (res.status === 429) {
          throw new Error(`Rate limit exceeded (429) when accessing spreadsheet. Please retry later.`);
        }
        if (res.status === 503) {
          throw new Error(`Service unavailable (503) when accessing spreadsheet. Please retry later.`);
        }
        throw new Error(`Could not retrieve spreadsheet metadata. Status: ${res.status}`);
      }
      return res.json();
    });
  },

  // Save full collection to Google Sheets with atomic clear-then-write
  async saveCollection(sheetName: keyof typeof HEADERS, data: any[]): Promise<void> {
    return queueRequest(async () => {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Google Sheets authentication failed. Cannot save data.');
      }

      const spreadsheetId = await this.getOrCreateSpreadsheet();
      if (!spreadsheetId) {
        throw new Error('Failed to get spreadsheet ID.');
      }

      const headers = HEADERS[sheetName];
      const rows = objectsToRows(data, headers);

      console.log(`Writing collection [${sheetName}] containing ${data.length} records to Google Sheets...`);

      // First Clear the existing sheet content to prevent dangling old rows
      const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:Z9999:clear`;
      const clearRes = await fetchWithRetry(clearUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!clearRes.ok) {
        const err = await clearRes.json().catch(() => ({}));
        console.error(`Failed to clear ${sheetName} sheet`, err);
        // Explicitly throw rate limit and service unavailable errors
        if (clearRes.status === 429) {
          throw new Error(`Rate limit exceeded (429) when clearing ${sheetName}. Please retry later.`);
        }
        if (clearRes.status === 503) {
          throw new Error(`Service unavailable (503) when clearing ${sheetName}. Please retry later.`);
        }
        throw new Error(`Failed to clear sheet ${sheetName}. Status: ${clearRes.statusText}`);
      }

      // Write new content
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1?valueInputOption=USER_ENTERED`;
      const res = await fetchWithRetry(writeUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: rows
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error(`Failed to update ${sheetName} sheet`, err);
        // Explicitly throw rate limit and service unavailable errors
        if (res.status === 429) {
          throw new Error(`Rate limit exceeded (429) when saving ${sheetName}. Please retry later.`);
        }
        if (res.status === 503) {
          throw new Error(`Service unavailable (503) when saving ${sheetName}. Please retry later.`);
        }
        throw new Error(`Failed to save table ${sheetName} to Google Sheets. Status: ${res.statusText}`);
      }
      console.log(`Successfully saved collection [${sheetName}] to Google Sheets.`);
    });
  },

  // Fetch concrete sheet collection of records
  async getCollection<T>(sheetName: keyof typeof HEADERS): Promise<T[]> {
    return queueRequest(async () => {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Google Sheets authentication failed. Cannot load data.');
      }

      const spreadsheetId = await this.getOrCreateSpreadsheet();
      if (!spreadsheetId) {
        throw new Error('Failed to get spreadsheet ID.');
      }

      const headers = HEADERS[sheetName];
      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:Z9999?valueRenderOption=FORMATTED_VALUE`;

      console.log(`Fetching collection [${sheetName}] from Google Sheets database...`);
      const res = await fetchWithRetry(readUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error(`Failed to read sheet ${sheetName}`, err);
        // Explicitly throw rate limit and service unavailable errors
        if (res.status === 429) {
          throw new Error(`Rate limit exceeded (429) when fetching ${sheetName}. Please retry later.`);
        }
        if (res.status === 503) {
          throw new Error(`Service unavailable (503) when fetching ${sheetName}. Please retry later.`);
        }
        throw new Error(`Failed to load ${sheetName} from Google Sheets. Status: ${res.statusText}`);
      }

      const payload = await res.json();
      return rowsToObjects<T>(payload.values, headers);
    });
  }
};
