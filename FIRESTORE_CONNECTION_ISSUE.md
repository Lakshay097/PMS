# Firestore Connection Issue - Debugging Document

## Problem Summary

**Issue:** Server-side API endpoints return 502 Bad Gateway errors when fetching data from Firestore. The client-side app cannot load data because the backend Firestore connection is timing out.

**Error Messages:**
- Client: `GET http://localhost:3000/api/sub-teams 502 (Bad Gateway)`
- Client: `[TaskFlow] Firestore failed: Error: API GET /api/sub-teams failed: 502`
- Server logs show repeated 502 errors for `/api/users`, `/api/tasks`, `/api/teams`, `/api/settings`, `/api/sub-teams`, etc.

**Root Cause:** The server-side Firebase Admin SDK uses Application Default Credentials (ADC) for authentication, which requires proper IAM setup. The connection to Firestore (`pms-taskflow-aa254`) is failing, likely due to:
- Network connectivity issues to Firebase
- Missing IAM permissions for the service account
- Firebase project configuration issues
- ADC not properly configured in the local environment

**Current State:**
- Server stays running (error handlers added successfully)
- Client-side timeout increased to 60s (doesn't help - server times out first)
- All API requests to Firestore-based endpoints return 502
- Rate limiter disabled (`RATE_LIMIT_ENABLED=FALSE`)

---

## Relevant Files

### 1. Server-Side Firebase Initialization

**File:** `server/services/firebaseAdmin.ts`

```typescript
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';

let _firestoreAdmin: Firestore | null = null;

function getFirestoreAdmin(): Firestore {
  if (_firestoreAdmin) {
    return _firestoreAdmin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    const msg =
      `Missing required Firebase Admin environment variable: FIREBASE_PROJECT_ID. ` +
      `This must be set in your .env file or Cloud Run secrets configuration.`;
    logger.error(msg);
    throw new Error(msg);
  }

  // Use Application Default Credentials (ADC) for authentication
  // This allows Cloud Run to authenticate using its service account
  // with cross-project access granted via IAM roles
  if (!getApps().length) {
    initializeApp({
      projectId: projectId,
      // No explicit credential - will use ADC automatically
    });
  }

  _firestoreAdmin = getFirestore();
  return _firestoreAdmin;
}

// Proxy that initialises lazily on first property access so that a missing
// env var is a runtime error on the call-site rather than a fatal startup
// crash that takes down the entire server.
export const firestoreAdmin = new Proxy({} as Firestore, {
  get(_target, prop) {
    const db = getFirestoreAdmin();
    const value = (db as any)[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});
```

**Issue:** Lines 26-29 use ADC without explicit credentials. This works in Cloud Run but may fail in local development unless ADC is properly configured.

---

### 2. Server Firebase Export

**File:** `server/firebase.ts`

```typescript
import { firestoreAdmin } from './services/firebaseAdmin';

/**
 * Firebase Admin SDK database instance.
 * This bypasses Firestore security rules, allowing the backend to perform
 * authorized reads/writes on behalf of authenticated users.
 */
export const db = firestoreAdmin;
```

---

### 3. Server-Side API Routes (Returning 502)

**File:** `server/routes/firestore.ts` (excerpt)

```typescript
import { Router } from 'express';
import { db } from '../firebase';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/authz';
import { sanitizeForFirestore } from '../lib/firestoreUtils';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================================
// USERS
// ============================================================================

/**
 * GET /api/users
 * List all users (admin/lead only)
 */
router.get('/api/users', authenticateToken, requireRole('admin', 'lead'), async (_req, res) => {
  try {
    const snapshot = await db.collection('users').get();  // <-- THIS TIMES OUT
    res.json(snapshot.docs.map(d => d.data()));
  } catch (err) {
    logger.error('getUsers failed:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

/**
 * GET /api/teams
 * List all teams (authenticated users)
 */
router.get('/api/teams', authenticateToken, async (_req, res) => {
  try {
    const snapshot = await db.collection('teams').get();  // <-- THIS TIMES OUT
    res.json(snapshot.docs.map(d => d.data()));
  } catch (err) {
    logger.error('getTeams failed:', err);
    res.status(500).json({ error: 'Failed to load teams' });
  }
});

// Similar pattern for all other endpoints...
```

**Issue:** All `db.collection().get()` calls are timing out because Firestore connection fails.

---

### 4. Server Main Entry Point

**File:** `server/index.ts` (relevant sections)

```typescript
// Lines 61-66: Rate limiter configuration
app.use('/api/', rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  skip: () => process.env.RATE_LIMIT_ENABLED !== 'true', 
  message: { error: 'Too many requests from this IP, please try again later.' }
}));

// Lines 141-150: Global error handlers (ADDED TO FIX SILENT CRASHES)
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Lines 152-155: Error handling for server startup
startServer().catch(err => {
  logger.error('Server failed to start:', err);
  process.exit(1);
});
```

**Status:** Error handlers successfully added. Server no longer crashes silently.

---

### 5. Client-Side Database Initialization

**File:** `src/lib/dbService.ts` (relevant sections)

```typescript
// Lines 254-296: Database initialization with race logic
export async function initializeDatabaseWithRace(): Promise<{
  data: Awaited<ReturnType<typeof dbService.batchLoadAll>>;
  primary: DatabaseType;
}> {
  const FIRESTORE_TIMEOUT_MS = 60000;  // INCREASED FROM 15000
  const SHEETS_TIMEOUT_MS = 20000; // 20 second timeout for Sheets (slower fallback)

  // Create timeout promise
  const timeoutPromise = (ms: number, dbType: DatabaseType) =>
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${dbType} timeout after ${ms}ms`)), ms)
    );

  // Try Firestore first (primary, faster)
  try {
    logger.log("Loading from Firestore (primary)...");
    const data = await Promise.race([
      dbService.batchLoadAll(),
      timeoutPromise(FIRESTORE_TIMEOUT_MS, 'firestore')
    ]);
    logger.log("Firestore loaded successfully");
    localStorage.setItem('primary_database', 'firestore');
    return { data, primary: 'firestore' };
  } catch (firestoreError) {
    logger.error("Firestore failed:", firestoreError);
  }

  // Fallback to Sheets
  try {
    logger.log("Firestore failed, trying Sheets as fallback...");
    await initializeDatabase();
    const data = await Promise.race([
      dbService.batchLoadAll(),
      timeoutPromise(SHEETS_TIMEOUT_MS, 'sheets')
    ]);
    logger.log("Sheets loaded successfully");
    localStorage.setItem('primary_database', 'sheets');
    return { data, primary: 'sheets' };
  } catch (sheetsError) {
    logger.error("Sheets failed:", sheetsError);
    throw new Error("Unable to connect to any database. Please check your connection and refresh.");
  }
}
```

**Issue:** Client-side timeout increased to 60s, but server-side still times out first (502 errors).

---

### 6. Client-Side Batch API Calls

**File:** `src/lib/dbService.ts` (lines 1430-1444)

```typescript
    ] = await Promise.all([
      api.get<any[]>('/api/users'),           // <-- 502 ERROR
      api.get<any[]>('/api/tasks'),           // <-- 502 ERROR
      api.get<Team[]>('/api/teams'),         // <-- 502 ERROR
      api.get<SubTeam[]>('/api/sub-teams'),  // <-- 502 ERROR
      api.get<TaskTemplate[]>('/api/templates'), // <-- 502 ERROR
      api.get<AppSetting[]>('/api/settings'), // <-- 502 ERROR
      api.get<EmailTemplate[]>('/api/email-templates'),
      api.get<TaskReport[]>('/api/reports'),
      api.get<FollowUp[]>('/api/followups'),
      api.get<Subtask[]>('/api/subtasks'),
      api.get<Comment[]>('/api/comments'),
      api.get<TeamSubmission[]>('/api/team-submissions'),
      api.get<AuditLog[]>('/api/auditlogs')
    ]);
```

**Issue:** All these API calls fail with 502 because server-side Firestore connection fails.

---

### 7. Client-Side API Client

**File:** `src/api/client.ts` (relevant sections)

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const DEFAULT_TIMEOUT = 15000; // 15 seconds (was working before)
const MAX_RETRIES = 3; // Maximum number of retries

// Lines 108-124: Error handling
if (!response.ok) {
  // Don't retry on client errors (4xx) except 408 (timeout) and 429 (rate limit)
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
    throw new ApiError(
      data?.error || data || 'Request failed',
      response.status,
      data
    );
  }
  // Retry on server errors (5xx), timeout (408), and rate limit (429)
  throw new ApiError(
    data?.error || data || 'Request failed',
    response.status,
    data
  );
}
```

**Issue:** 502 is a 5xx error, so it retries 3 times with exponential backoff, but all retries fail.

---

### 8. Environment Configuration

**File:** `.env` (relevant sections)

```bash
# Application Configuration
NODE_ENV=development
PORT=3000
APP_URL=https://pms-taskflow-556944241861.us-central1.run.app
RATE_LIMIT_ENABLED=FALSE

# Firebase Admin SDK (pms-taskflow-aa254)
FIREBASE_PROJECT_ID=pms-taskflow-aa254
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@pms-taskflow-aa254.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDb6txSkbCgUAV0\n7LYFjbpfsQ1eLHxsIf/t6dPo8kI8q1EGtScrJxYJuXnXOxsSwBMIi9cuyXv2ELOF\nWWvN7A6N1b5g5+y81xQZvQAt6IZewIDtTTsYqDFsj8kHJkEMf13UMN9Bh7Sl8Pua\nvxKnN1BXkHi6yxEsTDZgETS1BzRMnvkjz0BY3TDlN0hkRPShrkM3Q1u7rvuOsEpl\nAmL1QAA1a7Ll9/6Pcq03P9gpO+tdvJdBuRVnRfuWaMLoC/yFWQ2y1pHR5Jc3kYVN\nDnXlAJJXgq7peeI5abION3QO+xLHntIH2j74DSohSHZUVteupljAOxL3Tm0FtLWL\ntWDEkdJnAgMBAAECggEAVahEebq6b67LeU/r0/zwn24QdWJhciLKEyp0+jJGH2hh\nDnpHz9SRDmeab/1bHbIHl9gUD+q1qFG4AtQiG9p6jr82wHsFaEZj02Sc6cS8dbKI\nZSWkQ4XbflwA4pKBWrNPYiNJCjan48yZy5vp0YzHc9vXUnZe8YCb205IV8x/D+pQ\nzdPq568hx4EaoVgJzvFcwh4MpI9KX72XyC1LbSdpBkFgHmiTzByqD8b2P/EMKkPx\nHyDDHIo2m04CBWknd+R0mFCQh8/zDsqfNxkb1qQ0eseRRNlDU0tNcWhKVn4JWSrM\niCSW8j+1Uq2BheajzDP18Xdgv8X5SnY0wbZQDcLT0QKBgQD1/ZYJo6rJeN6VBbrc\nFhEaCDqKO/FO3s5bTdPiM2DqQmkkC8SMiVGrYlxjeST4XQB+2zLC+naGLViU8X12\ntyzsjG1ucXsQgljLPWx4yf9Cd0KTF3z2QrqhwTvKBlFn9iPQHi+kUZ8MV1UDCazp\nX6vSIQe/hW0kwOchjeu3vRhVMQKBgQDk3a2QwBPoJDSdn1QqHbJVq/Hrhcn4dEqz\nE1cA0gyswrZbAXJZVMZuLFlwdOgg9Ojj2pqocGCb4XPkf3z1XX1XwQ2XhrzJW1oN\naw6YnU3FM/ceXlDH39odapDPWSACNQejpc91gpXvWggHBZBTTM9PcbYwhJ8gcKdq\nlVJ120YbFwKBgD4CzDTn3mDlqG62wBFFOtBuLJu2WrGAN1MK/pPyUcccMLcWhFjN\nMRpcNGAbJPe7MinIhjZiv0g53C/H5NHtgVSsXdXOo7BYu5uYg2S7vy55M/4ymJzX\n24Z1WOYny5PCl+qaAXaR4N9SkKqwYLeAF6dkDjj4oLf4LQvnY/mwoJaxAoGAbPgv\nf9A0qj8y3inShQsGskvgL+fPtoCIYKNAtZ9NcaRz9vjFXUtD/4kWPLktHSP/Dx4y\nrSh0l0PNTmp1MM6Gs5WzxwXcNXNNeT4UAQ5EzTRk4Qy/IauvynnG4TLqTqK5NG3q\nTWUTxpbzY4R+p2rW+liGCqvaqDN7QwA99uekhZkCgYEA2hWZ+knCVhMq4jKX06Zw\nc5zUUSbqA4QCFjteybOvgtWWsgb0RNRIzWBlXjvViFoXs648rmU0PkeLz3VLry0W\nttM+rqCamfngdxweLcOVZvdBziUl73QyHFbDQ1U9nqG5HWtvt49dbYPh89bUNvW4\n/Rw8OY2CgKPlWkUmyGZ26zE=\n-----END PRIVATE KEY-----\n"

# Frontend Firebase Config
VITE_FIREBASE_API_KEY=AIzaSyA8WTF6H0jyVtJFumtBdH_pOKfF6f8ocsE
VITE_FIREBASE_AUTH_DOMAIN=pms-taskflow-aa254.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=pms-taskflow-aa254
VITE_FIREBASE_APP_ID=1:1086239964586:web:239a15d2885b99d8c87fd3
VITE_API_BASE=http://localhost:3000
```

**Issue:** Firebase Admin credentials are present, but ADC is used instead of explicit credentials in `firebaseAdmin.ts`.

---

### 9. Server Configuration

**File:** `server/config/env.ts` (relevant sections)

```typescript
export function validateEnv(): void {
  const requiredVars: string[] = [
    'JWT_SECRET',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
  ];
  // Firebase variables are NOT required - this is intentional for ADC
}
```

**Issue:** Firebase Admin credentials are not validated, so missing ADC setup is not caught at startup.

---

## Solutions

### Solution 1: Disable Firestore Temporarily (QUICK FIX)

**Goal:** Get the app working immediately using Sheets-only mode while fixing Firebase.

**Steps:**

1. Add environment variable to `.env`:
   ```bash
   DISABLE_FIRESTORE=true
   ```

2. Modify `server/services/firebaseAdmin.ts` to check this flag:
   ```typescript
   function getFirestoreAdmin(): Firestore {
     if (_firestoreAdmin) {
       return _firestoreAdmin;
     }

     // Check if Firestore is disabled
     if (process.env.DISABLE_FIRESTORE === 'true') {
       const msg = 'Firestore is disabled via DISABLE_FIRESTORE=true. Using Sheets-only mode.';
       logger.info(msg);
       throw new Error(msg);
     }

     const projectId = process.env.FIREBASE_PROJECT_ID;
     // ... rest of the function
   }
   ```

3. The client-side will automatically fall back to Sheets when Firestore fails.

**Pros:**
- Immediate fix
- App will work with Sheets
- No Firebase configuration needed

**Cons:**
- Firestore features disabled
- Slower performance (Sheets is slower)
- Not a long-term solution

---

### Solution 2: Use Explicit Firebase Credentials (PROPER FIX)

**Goal:** Fix Firebase connection by using explicit credentials instead of ADC.

**Steps:**

1. Modify `server/services/firebaseAdmin.ts` to use explicit credentials:
   ```typescript
   import { initializeApp, getApps, App, credential } from 'firebase-admin/app';
   import { getFirestore, Firestore } from 'firebase-admin/firestore';
   import { logger } from '../utils/logger';

   let _firestoreAdmin: Firestore | null = null;

   function getFirestoreAdmin(): Firestore {
     if (_firestoreAdmin) {
       return _firestoreAdmin;
     }

     const projectId = process.env.FIREBASE_PROJECT_ID;
     const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
     const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

     if (!projectId || !clientEmail || !privateKey) {
       const msg = 'Missing required Firebase Admin environment variables: FIREBASE_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, or FIREBASE_ADMIN_PRIVATE_KEY';
       logger.error(msg);
       throw new Error(msg);
     }

     if (!getApps().length) {
       initializeApp({
         credential: credential.cert({
           projectId,
           clientEmail,
           privateKey,
         }),
       });
     }

     _firestoreAdmin = getFirestore();
     return _firestoreAdmin;
   }

   export const firestoreAdmin = new Proxy({} as Firestore, {
     get(_target, prop) {
       const db = getFirestoreAdmin();
       const value = (db as any)[prop];
       return typeof value === 'function' ? value.bind(db) : value;
     },
   });
   ```

2. Update `server/config/env.ts` to validate Firebase credentials:
   ```typescript
   export function validateEnv(): void {
     const requiredVars: string[] = [
       'JWT_SECRET',
       'GOOGLE_SERVICE_ACCOUNT_EMAIL',
       'GOOGLE_PRIVATE_KEY',
       'FIREBASE_PROJECT_ID',
       'FIREBASE_ADMIN_CLIENT_EMAIL',
       'FIREBASE_ADMIN_PRIVATE_KEY',
     ];
     // ... rest of validation
   }
   ```

**Pros:**
- Proper Firebase authentication
- Works in local development
- No ADC setup required
- More reliable

**Cons:**
- Requires credentials in `.env` (already present)
- Need to verify credentials are valid

---

### Solution 3: Fix ADC Setup (ALTERNATIVE FIX)

**Goal:** Configure Application Default Credentials (ADC) for local development.

**Steps:**

1. Install Google Cloud SDK:
   ```bash
   # On Windows
   # Download from: https://cloud.google.com/sdk/docs/install
   ```

2. Authenticate with Google Cloud:
   ```bash
   gcloud auth application-default login
   ```

3. Verify ADC is configured:
   ```bash
   gcloud auth application-default print-access-token
   ```

4. Ensure the authenticated account has Firestore permissions for `pms-taskflow-aa254`.

**Pros:**
- No code changes needed
- Works with existing ADC setup
- Good for Cloud Run deployment

**Cons:**
- Requires Google Cloud SDK installation
- Requires IAM permissions setup
- More complex for local development

---

### Solution 4: Add Server-Side Timeout (DEFENSIVE FIX)

**Goal:** Add timeout to server-side Firestore calls to prevent indefinite hanging.

**Steps:**

1. Add timeout wrapper in `server/routes/firestore.ts`:
   ```typescript
   function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
     return Promise.race([
       promise,
       new Promise<never>((_, reject) =>
         setTimeout(() => reject(new Error(`Firestore timeout after ${timeoutMs}ms`)), timeoutMs)
       ),
     ]);
   }

   router.get('/api/users', authenticateToken, requireRole('admin', 'lead'), async (_req, res) => {
     try {
       const snapshot = await withTimeout(db.collection('users').get(), 30000);
       res.json(snapshot.docs.map(d => d.data()));
     } catch (err) {
       logger.error('getUsers failed:', err);
       res.status(504).json({ error: 'Firestore timeout' });
     }
   });
   ```

**Pros:**
- Prevents indefinite hanging
- Better error messages
- Defensive programming

**Cons:**
- Doesn't fix root cause
- Requires changes to all routes

---

## Recommended Approach

**Immediate (Today):** Implement Solution 1 (Disable Firestore) to get the app working with Sheets.

**Short-term (This Week):** Implement Solution 2 (Explicit Credentials) to fix Firebase connection properly.

**Long-term:** Consider Solution 3 (ADC) for Cloud Run deployment consistency.

---

## Testing Steps

After implementing any fix:

1. Restart the server:
   ```bash
   npm run dev
   ```

2. Check server logs for:
   - Firebase initialization success/failure
   - API request success/failure
   - Any error messages

3. Test in browser:
   - Open http://localhost:3000
   - Check browser console for errors
   - Verify data loads successfully

4. Verify database mode:
   - Check localStorage for "primary_database" key
   - Should be "firestore" or "sheets"

---

## Additional Notes

- The server error handlers (lines 141-150 in `server/index.ts`) are working correctly
- The rate limiter is disabled, so that's not the issue
- The client-side retry logic is working, but all retries fail
- The issue is specifically with server-side Firestore connection
- Google Sheets API is working (credentials are valid)
- Firebase project ID: `pms-taskflow-aa254`
- Firebase Admin service account: `firebase-adminsdk-fbsvc@pms-taskflow-aa254.iam.gserviceaccount.com`
