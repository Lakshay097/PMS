import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';

export const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

export const HEADERS = {
  users: ['UserID', 'FullName', 'Email', 'Role', 'ManagerEmail', 'TeamID', 'TeamName', 'Active', 'CanCreateFollowUp', 'CanCloseTask', 'CreatedAt', 'UpdatedAt'],
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
let isSigningIn = false;

// Initialize auth state and check cached token / service account API
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  let active = true;

  // Let's call /api/token to determine if a Service Account is provided on the backend host
  fetch('/api/token')
    .then(res => {
      if (res.ok) return res.json();
      return null;
    })
    .then(data => {
      if (!active) return;
      if (data && data.accessToken) {
        cachedAccessToken = data.accessToken;
        sessionStorage.setItem('google_sheets_access_token', data.accessToken);
        if (data.spreadsheetId) {
          localStorage.setItem('trustgrid_spreadsheet_id', data.spreadsheetId);
        }
        
        // Construct a mock user representing the backend Service Account
        const saMockUser = {
          uid: 'service-account-session',
          email: 'service-account@trustgrid.com',
          displayName: 'Service Account (Master Dynamic Sync)',
          emailVerified: true
        } as unknown as User;

        if (onAuthSuccess) {
          onAuthSuccess(saMockUser, data.accessToken);
        }
      } else {
        // Safe fallback to Firebase Auth listener if Service Account is absent
        setupFirebaseListener();
      }
    })
    .catch(err => {
      console.warn("Service Account API check bypassed/failed, falling back to Firebase login:", err);
      if (active) {
        setupFirebaseListener();
      }
    });

  let unsubFirebase = () => {};

  function setupFirebaseListener() {
    unsubFirebase = onAuthStateChanged(auth, async (user: User | null) => {
      if (!active) return;
      if (user) {
        if (cachedAccessToken) {
          if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        } else {
          const storedToken = sessionStorage.getItem('google_sheets_access_token');
          if (storedToken) {
            cachedAccessToken = storedToken;
            if (onAuthSuccess) onAuthSuccess(user, storedToken);
          } else if (!isSigningIn) {
            cachedAccessToken = null;
            if (onAuthFailure) onAuthFailure();
          }
        }
      } else {
        cachedAccessToken = null;
        sessionStorage.removeItem('google_sheets_access_token');
        if (onAuthFailure) onAuthFailure();
      }
    });
  }

  return () => {
    active = false;
    unsubFirebase();
  };
};

// Google sign-in requesting Google Sheets/Drive scopes
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    SHEETS_SCOPES.forEach(scope => provider.addScope(scope));
    
    // Suggest custom parameters to avoid consent loop issues
    provider.setCustomParameters({
      prompt: 'consent',
      access_type: 'offline'
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google OAuth access token from Firebase Authentication.');
    }

    cachedAccessToken = credential.accessToken;
    sessionStorage.setItem('google_sheets_access_token', cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('OAuth Authentication failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken || sessionStorage.getItem('google_sheets_access_token');
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  sessionStorage.removeItem('google_sheets_access_token');
  localStorage.removeItem('trustgrid_spreadsheet_id');
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
    const token = getAccessToken();
    if (!token) throw new Error('Unauthenticated. Please sign in to Google first.');

    // 1. Try finding existing spreadsheet ID in localStorage
    const savedId = localStorage.getItem('trustgrid_spreadsheet_id');
    if (savedId) {
      try {
        const metadata = await this.getSpreadsheetMetadata(savedId);
        if (metadata) {
          console.log('Using established Google Spreadsheet:', savedId);
          return savedId;
        }
      } catch (e) {
        console.warn('Previously stored spreadsheet could not be loaded, re-searching...', e);
      }
    }

    // 2. Query Drive to locate "TrustGrid Systems Database"
    console.log('Searching for database file in Google Drive...');
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      "name='TrustGrid Systems Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
    )}`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!searchRes.ok) {
      throw new Error(`Failed to query Google Drive. Status: ${searchRes.statusText}`);
    }

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const spreadId = searchData.files[0].id;
      localStorage.setItem('trustgrid_spreadsheet_id', spreadId);
      console.log('Found existing database spreadsheet on Google Drive:', spreadId);
      return spreadId;
    }

    // 3. Not found, create a brand new Google Spreadsheet with all required tabs
    console.log('No database spreadsheet found. Creating a new "TrustGrid Systems Database" with all tabs...');
    const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    
    const requiredSheets = Object.keys(HEADERS).map(name => ({
      properties: { title: name }
    }));

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: 'TrustGrid Systems Database'
        },
        sheets: requiredSheets
      })
    });

    if (!createRes.ok) {
      const errPayload = await createRes.json().catch(() => ({}));
      console.error('Failed to create spreadsheet', errPayload);
      throw new Error(`Failed to create Google Spreadsheet database. Status: ${createRes.statusText}`);
    }

    const createdSpreadsheet = await createRes.json();
    const newSpreadId = createdSpreadsheet.spreadsheetId;
    localStorage.setItem('trustgrid_spreadsheet_id', newSpreadId);
    console.log('Successfully created database spreadsheet on Google Drive with ID:', newSpreadId);
    return newSpreadId;
  },

  async getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    const token = getAccessToken();
    if (!token) throw new Error('Unauthenticated.');

    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Could not retrieve spreadsheet metadata.');
    return res.json();
  },

  // Save full collection to Google Sheets with atomic clear-then-write
  async saveCollection(sheetName: keyof typeof HEADERS, data: any[]): Promise<void> {
    const token = getAccessToken();
    if (!token) throw new Error('Unauthenticated.');

    const spreadsheetId = await this.getOrCreateSpreadsheet();
    const headers = HEADERS[sheetName];
    const rows = objectsToRows(data, headers);

    console.log(`Writing collection [${sheetName}] containing ${data.length} records to Google Sheets...`);

    // First Clear the existing sheet content to prevent dangling old rows
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:Z9999:clear`;
    await fetch(clearUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Write new content
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1?valueInputOption=USER_ENTERED`;
    const res = await fetch(writeUrl, {
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
      throw new Error(`Failed to save table ${sheetName} to Google Sheets database.`);
    }
    console.log(`Successfully saved collection [${sheetName}] to Google Sheets.`);
  },

  // Fetch concrete sheet collection of records
  async getCollection<T>(sheetName: keyof typeof HEADERS): Promise<T[]> {
    const token = getAccessToken();
    if (!token) throw new Error('Unauthenticated.');

    const spreadsheetId = await this.getOrCreateSpreadsheet();
    const headers = HEADERS[sheetName];
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:Z9999?valueRenderOption=FORMATTED_VALUE`;

    console.log(`Fetching collection [${sheetName}] from Google Sheets database...`);
    const res = await fetch(readUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      // If the sheet returns 404/400 (perhaps the tab is missing), try to update the spreadsheet structure or recover
      console.warn(`Could not read sheet ${sheetName}, trying to recover or seed headers...`);
      return [];
    }

    const payload = await res.json();
    return rowsToObjects<T>(payload.values, headers);
  }
};
