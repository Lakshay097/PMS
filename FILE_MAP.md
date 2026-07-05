# PMS TaskFlow — File Map

Every source file with its purpose and key responsibilities.
Read alongside `Architecture.md` for the full picture.

---

## Folder Structure

```
d:\PMS - Copy (2)\
│
├── index.html                          Vite entry HTML
├── package.json                        Dependencies and npm scripts
├── vite.config.ts                      Vite build and dev config
├── tsconfig.json                       TypeScript config (noEmit, bundler resolution)
├── eslint.config.js                    ESLint (rules-of-hooks + exhaustive-deps only)
├── Dockerfile                          Multi-stage build for Cloud Run
├── cloudbuild.yaml                     Google Cloud Build pipeline
├── server.ts                           Legacy entry (superseded by server/index.ts)
├── .env / .env.example                 Environment variables
├── Architecture.md                     Architecture source of truth
├── FILE_MAP.md                         This file
├── DEPLOYMENT.md                       Cloud Run deployment steps
├── CLOUD_DEPLOYMENT.md                 Additional deployment notes
├── firebase-blueprint.json             Firebase project config snapshot
├── firebase-service-account.json       Firebase Admin key — do NOT commit publicly
├── metadata.json                       App metadata snapshot
├── icon-audit-results.csv              Operational artifact
├── convert-icons.js                    One-off SVG→PNG conversion script
├── generate-icons.js                   One-off PWA icon size generation
│
├── public/
│   ├── sw.js                           Service worker (PWA, cache strategy)
│   ├── manifest.json                   PWA manifest
│   ├── offline.html                    Offline fallback page
│   ├── pw-logo.jpg                     Sidebar logo
│   ├── icon-192x192.png / .svg         Root icon assets
│   ├── icon-512x512.png / .svg         Root icon assets
│   └── icons/                          PWA icons: 72/96/128/144/152/192/384/512 px
│
├── scripts/
│   ├── migrate-plaintext-passwords.ts  One-time bcrypt migration (already run)
│   └── generate-icons.js               PWA icon generator
│
├── server/                             Express.js backend
│   ├── index.ts                        App entry, middleware, route mounting, SSE, Vite dev
│   ├── config/
│   │   ├── env.ts                      Env var loading + validateEnv()
│   │   └── index.ts                    Re-export
│   ├── controllers/
│   │   ├── authController.ts           login, register, approve, change-password
│   │   ├── uploadController.ts         Cloudinary file upload
│   │   ├── tokenController.ts          Google Sheets OAuth token proxy
│   │   ├── sheetsController.ts         Sheets CRUD proxy
│   │   ├── emailTriggerController.ts   Event-driven email sending
│   │   ├── emailTemplateController.ts  Email template CRUD
│   │   └── gmailAuthController.ts      Gmail OAuth flow
│   ├── middleware/
│   │   ├── auth.ts                     JWT verify, requireAdmin
│   │   ├── errorHandler.ts             AppError → HTTP response
│   │   ├── logger.ts                   Request logging
│   │   ├── rateLimiters.ts             login + OAuth rate limits
│   │   └── validate.ts                 Zod request validation
│   ├── routes/
│   │   ├── index.ts                    Mount all route modules
│   │   ├── auth.ts                     /login /account-request /approve-user /change-password
│   │   ├── teams.ts                    GET /teams/public (no auth)
│   │   ├── upload.ts                   POST /upload-file
│   │   ├── token.ts                    GET /token
│   │   ├── sheets.ts                   Sheets proxy routes
│   │   ├── gmailAuth.ts                Gmail OAuth routes
│   │   ├── emailTrigger.ts             Email event trigger routes
│   │   └── emailTemplate.ts            Email template routes
│   ├── services/
│   │   ├── authService.ts              login(), createToken(), verifyToken()
│   │   ├── googleSheetsService.ts      JWT auth + Sheets REST helpers (no googleapis)
│   │   ├── firebaseAdmin.ts            Lazy Firebase Admin SDK init
│   │   ├── sseService.ts               SSE connection pool + broadcaster
│   │   ├── emailService.ts             Gmail send + thread continuity + fallback
│   │   ├── emailTriggerService.ts      High-level email trigger functions
│   │   ├── emailTemplateStorage.ts     Template CRUD in Sheets
│   │   ├── emailLogService.ts          Email send log + thread ID storage
│   │   ├── gmailOAuthService.ts        OAuth 2.0 helpers (stateless)
│   │   ├── gmailTokenStorage.ts        Per-user Gmail token CRUD in Sheets
│   │   └── reminderScheduler.ts        Weekly scheduled-task reminder emails
│   └── utils/
│       ├── AppError.ts                 Typed HTTP error class hierarchy
│       ├── asyncWrapper.ts             async route handler error forwarding
│       └── logger.ts                   Structured server logger
│
└── src/                                React frontend
    ├── main.tsx                        React root, providers, SW registration
    ├── App.tsx                         Root component, all state, all handlers
    ├── index.css                       Tailwind + theme CSS variables
    ├── vite-env.d.ts                   import.meta.env typings
    ├── appsScriptCode.ts               Archived Apps Script (reference only)
    ├── initialData.ts                  DB seed data (admin user, T-ALL team)
    │
    ├── types/
    │   └── index.ts                    All TypeScript interfaces (single file)
    │
    ├── constants/
    │   ├── status.ts                   ROLE enum, isAdminLevel(), TASK_STATUS, PRIORITY
    │   ├── config.ts                   Client-side constants (timeouts, limits)
    │   ├── routes.ts                   Route path constants
    │   └── index.ts                    Re-exports
    │
    ├── contexts/
    │   └── AuthContext.tsx             JWT auth context (token for useRealtimeSync)
    │
    ├── lib/
    │   ├── dbService.ts                Firestore CRUD + optimistic pub/sub + Sheets queue
    │   ├── firestoreConfig.ts          Firebase client SDK init
    │   ├── sheetsService.ts            Client Sheets proxy + serialisation
    │   ├── taskEngine.ts               Recurring task generation + overdue evaluation
    │   ├── queryClient.ts              TanStack React Query singleton
    │   ├── sseClient.ts                SSEClient class (older impl, not active)
    │   ├── syncQueue.ts                Deduplicating write queue (not yet wired)
    │   ├── sheetsSyncWorker.ts         Full Firestore→Sheets sync utility
    │   └── migrationScript.ts          One-time Sheets→Firestore migration
    │
    ├── api/
    │   ├── client.ts                   HTTP client with JWT auth + retry
    │   ├── auth.ts                     login, requestAccount, approveUser, changePassword
    │   ├── upload.ts                   uploadFile()
    │   ├── token.ts                    getGoogleSheetsToken()
    │   ├── emailTrigger.ts             Email trigger wrappers
    │   ├── teams.ts                    STUB — no server route
    │   ├── tasks.ts                    STUB — no server route
    │   ├── users.ts                    STUB — no server route
    │   ├── reports.ts                  STUB — no server route
    │   ├── templates.ts                Template CRUD wrappers
    │   └── index.ts                    Re-exports all api modules
    │
    ├── hooks/
    │   ├── useDatabase.ts              Load all collections, optimistic subscriptions
    │   ├── useRealtimeSync.ts          SSE → React Query cache invalidation
    │   ├── useTaskOperations.ts        Task CRUD handlers (dbService-backed)
    │   ├── useUserOperations.ts        User CRUD handlers
    │   ├── useTeamOperations.ts        Team delete handler
    │   ├── useTemplateOperations.ts    Template CRUD handlers
    │   ├── useTaskMetrics.ts           Memoised KPI metrics
    │   ├── useAppModals.ts             All modal open/close state
    │   ├── useAppEvents.ts             Back-button + keyboard nav
    │   ├── useLoginForm.ts             Login form state + submit
    │   ├── useTaskForm.ts              Task form state + validation
    │   ├── useReports.ts               Report data fetching
    │   ├── useRowSelection.ts          Multi-row checkbox selection
    │   ├── useDebounce.ts              Debounce hook
    │   ├── useClickOutside.ts          Outside-click detection
    │   ├── useMediaQuery.ts            Reactive matchMedia
    │   ├── useOfflineStatus.ts         online/offline detection
    │   ├── useInstallPrompt.ts         PWA install prompt with cooldown
    │   ├── useLocalStorage.ts          Persisted useState
    │   ├── useSSE.ts                   Older SSE hook (superseded)
    │   ├── useTasks.ts                 React Query tasks hook
    │   ├── useTeams.ts                 React Query teams hook
    │   ├── useUsers.ts                 React Query users hook
    │   ├── useTemplates.ts             React Query templates hook
    │   └── index.ts                    Re-exports
    │
    ├── pages/
    │   ├── LoginPage.tsx               → LoginScreen
    │   ├── AccountRequestPage.tsx      → AccountRequest
    │   ├── DashboardPage.tsx           → Dashboard (MUST stay in sync with DashboardProps)
    │   ├── AdminPage.tsx               → AdminPanel
    │   └── TasksPage.tsx               Tasks-only wrapper
    │
    ├── utils/
    │   ├── subTeamUtils.ts             Sub-team visibility, leadership, assignment helpers
    │   ├── userUtils.ts                getAllSubordinates() — recursive manager chain
    │   ├── taskUtils.ts                getVisibleTasks, getOverdueAndSoon, getVisibleReports
    │   ├── pdfGenerator.ts             jsPDF report generation with attachments
    │   ├── formatDate.ts               Date formatting helpers
    │   ├── validators.ts               isValidEmail, isValidPassword, isValidUrl, isRequired
    │   ├── registerSW.ts               Service worker registration + update detection
    │   ├── logger.ts                   Client logger (silenced in prod)
    │   └── index.ts                    Re-exports formatDate, validators, subTeamUtils
    │
    └── components/
        ├── AdminPanel.tsx              Admin UI: Users, Teams+SubTeams, Templates, Emails
        ├── CreateTaskModal.tsx         Task creation modal
        ├── CreateReportModal.tsx       Progress report modal
        ├── FollowUpModal.tsx           Follow-up task modal
        ├── EditProfileModal.tsx        Profile edit modal
        ├── ChangePasswordModal.tsx     Password change modal
        ├── ConfigureNotificationsModal.tsx  Notification prefs modal
        ├── DashboardSkeleton.tsx       Loading skeleton
        ├── ErrorBoundary.tsx           React error boundary
        ├── InstallBanner.tsx           PWA install prompt banner
        ├── OfflineBanner.tsx           Offline status banner
        ├── UpdateBanner.tsx            SW update available banner
        │
        ├── features/
        │   ├── auth/
        │   │   ├── LoginScreen.tsx     Login form + JWT storage
        │   │   └── AccountRequest.tsx  Self-registration form + team dropdown
        │   ├── admin/
        │   │   ├── AdminHome.tsx       Alternative admin landing (not mounted)
        │   │   ├── AuditLog.tsx        Full audit log viewer
        │   │   ├── GlobalSettings.tsx  System settings editor
        │   │   ├── AddUserModal.tsx    Direct user creation modal
        │   │   └── EmailTemplatesEditor.tsx  Email template rich editor
        │   ├── tasks/
        │   │   ├── TaskDrawer.tsx      Task detail side-sheet (all actions)
        │   │   ├── TaskList.tsx        Scrollable task list
        │   │   ├── TaskFilters.tsx     Filter bar (status, priority, assignee)
        │   │   └── AddTeamModal.tsx    Team creation modal
        │   └── dashboard/
        │       └── Dashboard.tsx       Main shell: sidebar + all views (~2700 lines)
        │
        ├── dashboard/
        │   └── OverviewDashboard.tsx   Alternative overview (KPIs, timeline, workload)
        │
        ├── layout/
        │   ├── AppShell.tsx            Layout wrapper (not used — Dashboard has own sidebar)
        │   ├── Sidebar.tsx             Nav sidebar (used by AppShell)
        │   └── TopBar.tsx              Page header (used by AppShell)
        │
        ├── shared/
        │   ├── Modal.tsx               Animated modal wrapper
        │   ├── Drawer.tsx              Animated side-sheet
        │   ├── BulkActionBar.tsx       Bulk action sticky bar
        │   ├── MultiselectDropdown.tsx Checkbox dropdown with search
        │   ├── FilterChip.tsx          Toggle filter chip
        │   ├── FormField.tsx           Label + error slot wrapper
        │   ├── KPICard.tsx             Metric card
        │   ├── StatusBadge.tsx         Task status badge
        │   ├── PriorityBadge.tsx       Priority badge
        │   ├── TimelineItem.tsx        Timeline entry
        │   ├── Toast.tsx               Toast notification
        │   └── EmptyState.tsx          Empty state placeholder
        │
        └── ui/
            └── Spinner.tsx             Loading spinner atom
```

---

## Root

| File | Purpose |
|---|---|
| `package.json` | Dependencies, npm scripts: `dev` (tsx), `build` (vite + esbuild), `start` (prod), `lint` (tsc --noEmit) |
| `vite.config.ts` | Vite config: React plugin, Tailwind CSS plugin, `@` path alias, `/api` proxy to `:3000` in dev, manual chunk splitting (vendor-react, vendor-query, vendor-icons) |
| `tsconfig.json` | TypeScript config: ES2022 target, bundler module resolution, `allowJs`, `jsx: react-jsx`, `@/*` path alias, `noEmit` (type-check only, no output) |
| `eslint.config.js` | ESLint: react-hooks/rules-of-hooks (error) + react-hooks/exhaustive-deps (warn). All other rules silenced. Ignores `server/`, `dist/`, `scripts/` |
| `index.html` | Vite entry HTML. References `src/main.tsx` |
| `Dockerfile` | Multi-stage Docker build for Cloud Run. Installs deps, runs `npm run build`, serves `dist/server.mjs` |
| `cloudbuild.yaml` | Google Cloud Build config: Docker build + push to Artifact Registry + deploy to Cloud Run |
| `.env.example` | Template for required environment variables (see Environment Setup in Architecture.md) |
| `server.ts` | Legacy entry point — superseded by `server/index.ts`. Kept for reference only |
| `Architecture.md` | Architecture overview (this project's source of truth) |
| `FILE_MAP.md` | This file |
| `DEPLOYMENT.md` | Step-by-step Cloud Run deployment guide |
| `CLOUD_DEPLOYMENT.md` | Additional cloud deployment notes |
| `firebase-blueprint.json` | Firebase project config snapshot (reference only) |
| `firebase-service-account.json` | Firebase Admin SDK service account key — **do not commit to public repos** |
| `appsScriptCode.ts` | (src/) Legacy Google Apps Script code preserved as a TypeScript export. The app no longer uses Apps Script; this is an archived reference |
| `icon-audit-results.csv` | Icon audit output — operational artifact, not code |
| `convert-icons.js` | One-off script to convert SVG icons to PNG |
| `generate-icons.js` | One-off script to generate PWA icon sizes |
| `substitutions.txt` / `substitutions.yaml` | Cloud Build variable substitutions |
| `test-sheets-access.js` | Ad-hoc script to verify Google Sheets API connectivity |
| `verify-env.js` | Ad-hoc script to check required env vars are set |
| `metadata.json` | App metadata snapshot |

---

## server/

### server/index.ts
Express application entry point. Starts the server, registers all middleware (CORS, Helmet, rate limiter, body parser, request logger), mounts API routes, opens the SSE stream endpoint, registers the Gmail OAuth callback, starts the weekly reminder scheduler, and in dev mode creates a Vite middleware server. In production, serves `dist/` as static files.

### server/config/

| File | Purpose |
|---|---|
| `env.ts` | Loads `.env` via dotenv, exports the typed `config` object (PORT, JWT_SECRET, BCRYPT_ROUNDS, Google credentials, rate limit settings, Cloudinary config, Gmail OAuth config). Also exports `validateEnv()` which throws on startup if required vars are missing |
| `index.ts` | Re-exports `config` and `validateEnv` from `env.ts` |

### server/controllers/

Request handlers. Each receives `(req, res)`, calls a service, and sends the response. Errors are thrown as `AppError` subclasses and caught by `errorHandler` middleware.

| File | Handles |
|---|---|
| `authController.ts` | `POST /login`, `POST /account-request` (self-registration with bcrypt hash + Firestore mirror), `POST /approve-user` (sets Active=true in Sheets + Firestore), `POST /change-password` (bcrypt hash, writes to both stores) |
| `uploadController.ts` | `POST /upload-file` — validates file size/type, uploads base64-encoded file to Cloudinary, returns URL. Falls back to Google Drive upload path for legacy submissions |
| `tokenController.ts` | `GET /token` — calls `generateGoogleSheetsToken()` and returns the OAuth access token + spreadsheet ID to the client |
| `sheetsController.ts` | Sheets proxy endpoints: metadata, values read/write, batch read, append, clear. Includes a request queue to prevent rate limiting |
| `emailTriggerController.ts` | `POST /email/trigger/*` — fire-and-forget handlers for task-assignment, due-soon, overdue, report-submission, task-closure emails |
| `emailTemplateController.ts` | `GET/POST /email/templates` — read and write email templates in Sheets |
| `gmailAuthController.ts` | Gmail OAuth flow: auth URL generation, callback handler (exchanges code for tokens, saves to Sheets), status check, disconnect. Also exports `initializeEmailSheets()` called on startup |

### server/middleware/

| File | Purpose |
|---|---|
| `auth.ts` | `authenticateToken` — JWT verification middleware, attaches `req.user`. `requireAdmin` — blocks non-Admin roles with 403 |
| `errorHandler.ts` | `errorHandler` — catches `AppError` subclasses (returns their statusCode + message) and unexpected errors (returns 500). `notFoundHandler` — 404 for unmatched routes |
| `logger.ts` | `requestLogger` — logs method, path, status code, and response time for every request |
| `rateLimiters.ts` | `loginRateLimiter` (10 req/15 min per IP), `oauthRateLimiter` (20 req/15 min) using `express-rate-limit` |
| `validate.ts` | Zod-based request body validation middleware factory |

### server/routes/

| File | Purpose |
|---|---|
| `index.ts` | Mounts all route modules under `/api`. The single import point for `server/index.ts` |
| `auth.ts` | Auth routes: login, account-request, approve-user, change-password |
| `teams.ts` | `GET /teams/public` — returns active team names without auth (used by registration form) |
| `upload.ts` | File upload route |
| `token.ts` | Google Sheets token proxy route |
| `sheets.ts` | Sheets CRUD proxy routes |
| `gmailAuth.ts` | Gmail OAuth routes |
| `emailTrigger.ts` | Email trigger routes |
| `emailTemplate.ts` | Email template CRUD routes |

### server/services/

| File | Purpose |
|---|---|
| `authService.ts` | `login()` — reads users from Sheets, verifies bcrypt password, returns JWT + user data. `createToken()`, `verifyToken()`, `generateUserId()` |
| `googleSheetsService.ts` | Core Sheets API layer. `generateGoogleSheetsToken()` — builds RS256 JWT for the service account and exchanges it for an OAuth token (no googleapis package, uses native crypto + fetch). `fetchSheetValues()`, `updateSheetValues()`, `appendSheetValues()`, `createSheet()`, `fetchRowByFilter()`. Used by all server-side Sheets operations |
| `firebaseAdmin.ts` | Lazy-initialised Firebase Admin SDK. Exports `firestoreAdmin` as a Proxy that initialises on first access. Used by auth controllers to mirror user data to Firestore |
| `sseService.ts` | `SSEService` class (singleton). Manages open SSE connections, broadcasts change notifications, pings connections every 25 s to keep-alive, and runs an audit-loop fallback that polls `auditlogs` every 60 s |
| `emailService.ts` | `sendEmailAsUser()` — sends email via Gmail API using a user's OAuth tokens, with token refresh, email threading (In-Reply-To / threadId headers), template variable substitution, and fallback to system account. Also exports `sendEmail()`, `sendAccountApprovalEmail()`, `sendAccountRequestNotification()` |
| `emailTriggerService.ts` | High-level email trigger functions: `triggerTaskAssignmentEmail()`, `triggerTaskDueSoonEmail()`, `triggerTaskOverdueEmail()`, `triggerReportSubmissionEmail()`, `triggerTaskClosureEmail()`. Each loads user names from Sheets for template substitution |
| `emailTemplateStorage.ts` | CRUD for email templates stored in the `email_templates` Sheets tab. `initializeEmailTemplatesSheet()` seeds default templates on first run. `replaceTemplateVariables()` substitutes `{VarName}` tokens |
| `emailLogService.ts` | Logs email send/fail events to the `email_logs` Sheets tab. Also manages `task_email_threads` tab for Gmail thread ID continuity |
| `gmailOAuthService.ts` | `getGmailAuthUrl()`, `exchangeCodeForTokens()`, `getUserEmail()`, `refreshAccessToken()`. Pure OAuth 2.0 helpers — no state |
| `gmailTokenStorage.ts` | Reads/writes Gmail OAuth tokens (refresh token, access token, expiry) to the `user_tokens` Sheets tab. `initializeUserTokensSheet()`, `saveGmailToken()`, `getGmailToken()`, `updateGmailAccessToken()`, `deleteGmailToken()`, `isGmailConnected()` |
| `reminderScheduler.ts` | `startReminderScheduler()` — starts an hourly interval. `checkAndSendWeeklyReminders()` — on the configured reminder day (default: Thursday), reads teams from Sheets, skips teams that already submitted this week, sends reminder emails to team leaders via Gmail, persists run status in Sheets settings to prevent duplicate sends across process restarts |

### server/utils/

| File | Purpose |
|---|---|
| `AppError.ts` | Base `AppError` class + typed subclasses: `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `InternalServerError` (500) |
| `asyncWrapper.ts` | Wraps async route handlers so thrown errors propagate to Express's `next()` error handler automatically |
| `logger.ts` | Structured console logger with `[timestamp]` prefix. Methods: `log`, `info`, `warn`, `error` |

---

## src/

### src/main.tsx
React app entry point. Creates root, wraps app in `<StrictMode>`, `<QueryClientProvider>`, and `<AuthProvider>`. Registers the service worker (`registerSW()`) only when `import.meta.env.PROD` is true.

### src/App.tsx
Root component and application controller (~1200 lines). Owns all top-level state (users, tasks, teams, subTeams, templates, settings, reports, followUps, subtasks, comments, emailTemplates, teamSubmissions). Handles auth session, active user resolution (trusts JWT role from localStorage to prevent re-render downgrades), task filtering, all CRUD handlers, modal state, and renders `DashboardPage`. Uses `useDatabase`, `useTaskOperations`, `useUserOperations`, `useTeamOperations`, `useTemplateOperations`, `useTaskMetrics`, `useAppModals`, `useAppEvents`, `useRealtimeSync`.

### src/index.css
Global styles, Tailwind CSS base/components/utilities, CSS custom properties for theme tokens (`--color-accent`, `--color-border`, etc.), and auth page styles.

### src/vite-env.d.ts
Vite type declarations (`import.meta.env` typings).

### src/appsScriptCode.ts
Archived Google Apps Script code (the app no longer uses Apps Script). Kept as a reference/export for historical context.

### src/initialData.ts
Seed data used on first-time database initialisation: one admin user, one `T-ALL` team, empty arrays for everything else, and default settings (lock timeout, email templates, etc.).

---

## src/types/

### src/types/index.ts
Single source of truth for all TypeScript interfaces. Key types:
- `User` — profile, role, team assignments (`TeamIDs[]`, `TeamNames[]`), sub-team (`SubTeamID?`, `SubTeamName?`), approval status
- `SubTeam` — sub-team entity; `SubTeamLeaderEmails` is derived at read-time from settings key
- `Team` — team entity; `TeamLeaderEmails` + `StakeholderEmails` derived from settings
- `Task`, `TaskTemplate`, `TaskReport`, `FollowUp`, `Subtask`, `Comment`, `TeamSubmission`
- `AppSetting` — `{Key, Value}` pair (settings collection)
- `EmailTemplate`, `AuditLog`, `SystemAlert`

---

## src/constants/

| File | Purpose |
|---|---|
| `status.ts` | `ROLE` enum (Admin, Stakeholder, Sub-stakeholder, Team Leader), `TASK_STATUS`, `PRIORITY`. `isAdminLevel(role)` helper — returns true for Admin. **Use this helper everywhere instead of raw `role === ROLE.ADMIN`** |
| `config.ts` | Client-side constants: API timeout, React Query stale/cache times, debounce delay, max file size, allowed file types |
| `routes.ts` | Route path constants (`ROUTES.LOGIN`, `ROUTES.DASHBOARD`, etc.) |
| `index.ts` | Re-exports all constants |

---

## src/contexts/

### src/contexts/AuthContext.tsx
React Context for authentication. Stores `user`, `token`, `isAuthenticated`, `isLoading`. Loads from localStorage on mount. Provides `login()` (calls `/api/login`, stores token) and `logout()` (clears localStorage). Used by `useAuth()` hook. Note: `App.tsx` manages its own parallel auth state via `PMS_active_user_email` / `PMS_user` localStorage keys — `AuthContext` is used specifically to provide the JWT token to `useRealtimeSync`.

---

## src/lib/

### src/lib/dbService.ts
The core client-side database layer (~1500 lines). Firestore-primary with Google Sheets as a background sync target.

**Key responsibilities:**
- CRUD methods for every collection: `getUsers/saveUser`, `getTeams/saveTeam/toggleTeamStatus/deleteTeam`, `getSubTeams/saveSubTeam/deleteSubTeam`, `getTasks/saveTask/deleteTask`, `getTemplates/saveTemplate/deleteTemplate`, `getReports/saveReport`, `getFollowups/saveFollowup`, `getSettings/saveSettings`, `getSubtasks/saveSubtask`, `getComments/saveComment`, `getTeamSubmissions/saveTeamSubmission`
- **Optimistic update pub/sub:** `registerOptimisticCallback(collection, fn)` / `notifyOptimisticUpdate()` — write methods update the in-memory cache and call callbacks immediately (before Firestore write). On Firestore failure, the cache is rolled back from a fresh Firestore read.
- **In-memory cache:** `getFromCache` / `setCache` with 10-minute TTL. Prevents redundant Firestore reads within a session.
- **Sheets sync queue:** `enqueueSheetsWrite()` — batches pending writes. `startSheetsSyncInterval()` flushes every 5 minutes via `sheetsApi.saveCollection()`.
- `batchLoadAll()` — reads all collections in parallel with `Promise.all`, hydrates `TeamLeaderEmails` and `SubTeamLeaderEmails` from settings keys, populates all caches. Used on startup.
- `initializeDatabaseWithRace()` — races Firestore vs Sheets, uses whichever responds first.
- `syncCollections(collections[])` — targeted re-sync for specific collections after SSE events.
- `logAction()` — appends audit log entries to both Sheets and Firestore.

### src/lib/firestoreConfig.ts
Firebase client SDK initialisation. Reads `VITE_FIREBASE_*` env vars from `import.meta.env`. Exports the `db` Firestore instance used by `dbService`.

### src/lib/sheetsService.ts
Client-side Google Sheets API layer. All calls go through the Express backend proxy (avoids CORS). Exports `sheetsApi` (queued wrappers) and `HEADERS` (column definitions for every sheet). Contains `objectsToRows()` / `rowsToObjects()` for serialisation. `initAuth()` fetches the service account token from `/api/token`. Not called directly by components — `dbService` uses it for background Sheets sync.

### src/lib/taskEngine.ts
Recurring task generation logic. `checkAndGenerateRecurringTasks()` — iterates active templates, computes `cycleKey` (e.g. `2026-W27`), checks if a task for this cycle already exists, creates it via `dbService.saveTask()` if not. `evaluateOverdueTasks()` — marks tasks as Overdue if their due date has passed. `getCurrentCycleDetails()` / `calculateNextGenerationDate()` — date math for all recurrence types (Daily, Weekly, Monthly, Quarterly, Half-yearly). Weekly recurrence preserves the day-of-week from the template's original start date.

### src/lib/queryClient.ts
Singleton TanStack React Query `QueryClient` configured with 5-min stale time, 10-min cache time, no refetch on window focus. Used only for SSE-triggered cache invalidation in `useRealtimeSync`.

### src/lib/sseClient.ts
`SSEClient` class — manages a single `EventSource` connection to `/api/changes/stream` with exponential backoff reconnection (max 30 s). Compares server `lastModified` against local timestamp to detect missed changes. Singleton via `initSSEClient()` / `getSSEClient()`. **Not actively used** — `useRealtimeSync` uses its own `EventSource` directly. This is an older implementation kept for reference.

### src/lib/syncQueue.ts
`SyncQueue` class — deduplicating write queue with 3 retries and exponential backoff (2s, 6s, 18s). Latest write for a given `entityType:entityId` key replaces any queued write for the same key. **Not wired into `dbService`** — noted as TECH-DEBT. Available for future integration.

### src/lib/sheetsSyncWorker.ts
`syncFirestoreToSheets()` — reads all standard collections from Firestore and writes them to Sheets using `sheetsApi.saveCollection()`. Used as a utility for one-off full syncs.

### src/lib/migrationScript.ts
`migrateFromSheets()` — reads all collections from Sheets via `dbService` getters and batch-writes them to Firestore. Used for the one-time migration from Sheets-primary to Firestore-primary architecture. Batches in groups of 500 to stay within Firestore write limits.

---

## src/api/

Thin wrappers around the `api` client. All call Express endpoints. **Important:** `tasks.ts`, `users.ts`, `reports.ts`, `teams.ts` reference REST endpoints that do not exist on the server. They are unused scaffolding stubs — all actual data access goes through `dbService` directly.

### src/api/client.ts
Core HTTP client. `apiRequest()` — fetches with JWT auth header, JSON body, configurable timeout, and retry logic (up to 3 retries with exponential backoff). Exports `api.get/post/put/delete/patch` convenience methods. `skipAuth` option for public endpoints. `notifyChange()` — fires `POST /api/events/notify` to trigger SSE broadcast (fire-and-forget).

| File | Purpose |
|---|---|
| `auth.ts` | `login()`, `requestAccount()`, `approveUser()`, `changePassword()`. Interfaces: `LoginRequest/Response`, `AccountRequest`, `ApproveUserRequest`, `ChangePasswordRequest` |
| `upload.ts` | `uploadFile()` — POSTs base64 file data to `/api/upload-file` |
| `token.ts` | `getGoogleSheetsToken()` — fetches OAuth token from `/api/token` |
| `emailTrigger.ts` | Typed wrappers for all 5 email trigger endpoints |
| `teams.ts` | `getTeams/getTeam/createTeam/updateTeam/deleteTeam` — **stubs, no server route** |
| `tasks.ts` | `getTasks/getTask/createTask/updateTask/deleteTask` — **stubs, no server route** |
| `users.ts` | `getUsers/getUser/updateUser/deleteUser` — **stubs, no server route** |
| `reports.ts` | `getReports/getReport/createReport/updateReport/deleteReport` — **stubs, no server route** |
| `templates.ts` | Template CRUD wrappers |
| `index.ts` | Re-exports all api modules |

---

## src/hooks/

| File | Purpose |
|---|---|
| `useDatabase.ts` | Loads all Firestore collections via `batchLoadAll()`, manages loading/sync state, subscribes to `registerOptimisticCallback` for all collections so writes instantly update React state. Returns all data arrays + setters + `loadDatabase`/`silentSync`. Used only in `App.tsx` |
| `useRealtimeSync.ts` | Opens `EventSource` to `/api/changes/stream`, reconnects with backoff, invalidates TanStack React Query cache keys on SSE messages. Polling fallback: forces task invalidation if no SSE message for 60 s |
| `useSSE.ts` | Older SSE hook (alternative implementation). Sets individual collection state directly from SSE events. **Superseded by `useRealtimeSync` + `registerOptimisticCallback`** — kept for reference |
| `useTaskOperations.ts` | All task CRUD handlers wired to `dbService`: `handleCreateTaskOrTemplate`, `handleCloseTask`, `handleUpdateTask`, `handleCreateFollowUp`, `handleAddSubtask`, `handleToggleSubtask`, `handleDeleteSubtask`, `handleAddComment`, `handleDeleteTask`, `runSimulatedRecurrenceEngine`. Optimistic updates handle UI refresh — no `silentSync()` calls |
| `useUserOperations.ts` | User CRUD: `handleUpdateUserTeams`, `handleAddUser`, `handleToggleUserStatus`, `handleApproveUser` (calls `/api/approve-user`), `handleUpdateUserRole` |
| `useTeamOperations.ts` | `handleDeleteTeam` — removes team and clears team assignments from affected users |
| `useTemplateOperations.ts` | `handleAddTemplate`, `handleToggleTemplateStatus` |
| `useTaskMetrics.ts` | Memoised metrics derived from visible tasks: `metricActiveTasks`, `metricOverdue`, `metricDueToday`, `metricCompletedThisWeek`, `metricFollowUps`. Uses `getVisibleTasks` and `getOverdueAndSoonTasks` from `taskUtils` |
| `useAppModals.ts` | Centralises all modal open/close state: task drawer, create-task modal, report modal, follow-up modal, edit-profile, change-password, configure-notifications, add-user, add-team, plus `selectedTask`, `preSelectedAssignee`, `preSelectedTeamIDs` |
| `useAppEvents.ts` | Browser back-button and `Alt+Arrow` keyboard shortcuts that navigate between app views |
| `useLoginForm.ts` | Form state, field-level validation, and submit handler for the login form |
| `useTaskForm.ts` | Form state, field-level validation (future-date check), and submit handler for task create/edit |
| `useReports.ts` | Report data fetching hook |
| `useRowSelection.ts` | Multi-row checkbox selection state with toggle-all. Used in the reports table |
| `useDebounce.ts` | Standard debounce hook — delays value update by `ms` |
| `useClickOutside.ts` | Fires callback when a click occurs outside the referenced element |
| `useMediaQuery.ts` | Reactive `window.matchMedia` hook |
| `useOfflineStatus.ts` | Listens to `online`/`offline` browser events, returns `isOnline` boolean |
| `useInstallPrompt.ts` | Captures `beforeinstallprompt` event, provides `install()` and `dismiss()` for PWA install banner. Respects a 7-day dismissal cooldown in localStorage |
| `useLocalStorage.ts` | `useState` wrapper that persists to localStorage |
| `useTasks.ts` | TanStack React Query hook for fetching tasks |
| `useTeams.ts` | TanStack React Query hook for fetching teams |
| `useUsers.ts` | TanStack React Query hook for fetching users |
| `useTemplates.ts` | TanStack React Query hook for fetching templates |
| `index.ts` | Re-exports all hooks |

---

## src/pages/

Thin passthrough wrappers. Each page imports one feature component and spreads all props through. They exist to allow lazy-loading in `App.tsx`.

| File | Purpose |
|---|---|
| `LoginPage.tsx` | Renders `<LoginScreen>` |
| `AccountRequestPage.tsx` | Renders `<AccountRequest>` |
| `DashboardPage.tsx` | Renders `<Dashboard>`. Props interface **must be kept in sync with DashboardProps** from Dashboard.tsx when Dashboard props change — this file is a thin passthrough; any prop declared in DashboardPageProps but missing from here is silently dropped at the `{...props}` spread boundary (latent bug fixed in commit `869a829`: `reports`, `teamSubmissions`, `onAddTeamSubmission`, `triggerNotification`, `subTeams`, four sub-team callbacks, and `onNewTask` teamIds param were all previously missing) |
| `AdminPage.tsx` | Renders `<AdminPanel>` |
| `TasksPage.tsx` | Tasks-only page wrapper |

---

## src/components/

### Top-level components (src/components/)

| File | Purpose |
|---|---|
| `AdminPanel.tsx` | Full admin UI (~1700 lines). 4 sub-tabs: Users (list + pending approvals + role/team management), Teams (create/manage teams, expand modal with sub-team management — Task 4), Templates (recurring blueprint CRUD), Email Templates (editor). Receives all admin callbacks from Dashboard/App via props |
| `CreateTaskModal.tsx` | Modal to create a one-time or recurring task. Assignee dropdown filtered by role and team. Supports pre-selected assignee and team. File attachment upload via Cloudinary |
| `CreateReportModal.tsx` | Modal to submit a progress report on a task. File attachment upload |
| `FollowUpModal.tsx` | Modal to create a follow-up task chain with a reason field |
| `EditProfileModal.tsx` | Modal to edit display name, email, manager email |
| `ChangePasswordModal.tsx` | Modal for password change (calls `/api/change-password`) |
| `ConfigureNotificationsModal.tsx` | Notification preferences modal |
| `DashboardSkeleton.tsx` | Loading skeleton shown while `dbIsLoading` is true |
| `ErrorBoundary.tsx` | React class component error boundary. Catches render errors, shows fallback UI, logs to `logger`. Has a "Try again" reset button |
| `InstallBanner.tsx` | PWA install prompt banner shown at bottom of page when `useInstallPrompt.canInstall` is true |
| `OfflineBanner.tsx` | Banner shown when `useOfflineStatus.isOnline` is false |
| `UpdateBanner.tsx` | Banner shown when service worker fires `swUpdateAvailable` event (new version available) |

### src/components/features/auth/

| File | Purpose |
|---|---|
| `LoginScreen.tsx` | Login form with email/password fields, show/hide password toggle, error display. Calls `api/auth.login()`, stores JWT + user in localStorage, calls `onLoginSuccess`. Renders `<AccountRequest>` when "Request Account" is clicked |
| `AccountRequest.tsx` | Self-registration form. Fields: full name, email, password, manager email, optional team dropdown (fetches `/api/teams/public` on mount). Calls `api/auth.requestAccount()`. Shows success state after submission |

### src/components/features/admin/

| File | Purpose |
|---|---|
| `AdminHome.tsx` | Admin Console landing page (alternative design, not currently mounted in the main app flow). Shows KPI strip, module cards, recent system events from audit log, quick-action buttons |
| `AuditLog.tsx` | Full-page audit log viewer with search, date/actor/entity/severity filters, sortable table, and a side-sheet detail view for individual log entries |
| `GlobalSettings.tsx` | System settings editor with category rail (Task Rules, Scheduler, Notifications, Security, Environment). Per-setting save + "Save all" with unsaved-changes indicator. Risky settings require confirmation |
| `AddUserModal.tsx` | Modal form to create a user directly (admin use) |
| `EmailTemplatesEditor.tsx` | Rich editor for email templates with token insertion |

### src/components/features/tasks/

| File | Purpose |
|---|---|
| `TaskDrawer.tsx` | Full task detail side-sheet. Shows all task fields, status history, subtasks, comments, attachment links. Admin can reassign/close. Stakeholders can assign to sub-stakeholders, add subtasks. File upload for report attachments. Role-gated actions: close, submit report, create follow-up, edit, delete |
| `TaskList.tsx` | Scrollable task list with search and delete button for admins |
| `TaskFilters.tsx` | Filter bar: status, priority, date range, assignee multiselect. Assignee list is role-scoped (admin sees all, stakeholder sees subordinates) |
| `AddTeamModal.tsx` | Modal to create a new team |

### src/components/features/dashboard/

| File | Purpose |
|---|---|
| `Dashboard.tsx` | Main dashboard shell (~2700 lines). Owns its own view state (overview, tasks, team, reports, admin, settings, scheduled-tasks). Renders Sidebar + content area for each view. Contains `renderAdmin()` (AdminPanel), `renderTeam()` (team roster grouped by sub-team, visible to all roles), `renderScheduledTasks()` (weekly submission flow), and the full tasks board with filters, sub-views (my-tasks, team-tasks, assigned-by-me), and report list |

### src/components/dashboard/

| File | Purpose |
|---|---|
| `OverviewDashboard.tsx` | Alternative overview dashboard design. KPI strip (active tasks, overdue, due today, completed this week with click-to-filter navigation), urgent tasks list, recent-updates timeline, upcoming deadlines, my-tasks-by-status summary, team workload snapshot. Not currently mounted in the main app — available as a drop-in replacement |

### src/components/layout/

| File | Purpose |
|---|---|
| `AppShell.tsx` | Layout wrapper: fixed sidebar + main content area with top bar. Manages `isSidebarCollapsed` state. **Not used by the current app** — `Dashboard.tsx` implements its own sidebar inline |
| `Sidebar.tsx` | Navigation sidebar with collapse/expand, tooltip labels in collapsed state, nav items (Overview, Tasks, Schedules, Team, Reports, Admin), secondary items (Settings, Help), user info, and sign-out button. Used by `AppShell` |
| `TopBar.tsx` | Page header with title, breadcrumb, sync status indicator, and user menu dropdown. Used by `AppShell` |

### src/components/shared/

Generic, reusable UI primitives with no business logic.

| File | Purpose |
|---|---|
| `Modal.tsx` | Animated modal wrapper (Framer Motion). Manages `document.body.overflow`, configurable sizes (sm/md/lg/xl), optional close button |
| `Drawer.tsx` | Animated side-sheet (slide in from right/left). Overlay backdrop |
| `BulkActionBar.tsx` | Sticky bottom bar for bulk operations on selected rows |
| `MultiselectDropdown.tsx` | Dropdown with checkbox selection, optional search, configurable badge colours |
| `FilterChip.tsx` | Toggle chip for filter bars |
| `FormField.tsx` | Form field wrapper with label, error message slot |
| `KPICard.tsx` | Metric card: label, value, optional note, optional trend indicator, optional onClick |
| `StatusBadge.tsx` | Styled badge for task statuses |
| `PriorityBadge.tsx` | Styled badge for priorities (Low/Medium/High/Critical) |
| `TimelineItem.tsx` | Single timeline entry with icon, title, timestamp, actor |
| `Toast.tsx` | Toast notification component |
| `EmptyState.tsx` | Empty state placeholder with icon and message |

### src/components/ui/

| File | Purpose |
|---|---|
| `Spinner.tsx` | Animated loading spinner, configurable size |

---

## src/utils/

| File | Purpose |
|---|---|
| `subTeamUtils.ts` | All sub-team visibility and leadership helpers. `isSubTeamLeader(email, subTeam)`, `isAnySubTeamLeader(email, subTeams, teamId)`, `isTeamLeader(email, team)`, `getSubTeamForUser(user, subTeams, teamId)`, `getMembersOfSubTeam(subTeamId, users)`, `getMembersOfTeam(teamId, users)`, `getVisibleMemberEmails(viewerEmail, teamId, users, subTeams, team)` — **central visibility function for Tasks 5 and 6**, `getTeamRoster(teamId, users)` — full roster for all roles (roster amendment), `canAssignWithinTeam(assignerEmail, targetEmail, users)`, `subTeamLeadersSettingKey(teamId, subTeamId)`, `parseLeaderEmails(value)` |
| `userUtils.ts` | `getAllSubordinates(email, users)` — recursively walks `ManagerEmail` chain downward with cycle protection. Returns flat array of all subordinate emails |
| `taskUtils.ts` | `getVisibleTasks(tasks, activeUser, view, filters, users)` — role + view + filter scoped task list. `getOverdueAndSoonTasks(tasks, activeUser, users)` — splits into overdue and due-within-3-days buckets. `getVisibleReports(reports, activeUser)`. `getStatusBadgeStyle(status)`, `parseSafely(value)` |
| `pdfGenerator.ts` | `generateReportWithAttachments(content, attachments, title)` — generates a jsPDF document with report text and embedded/referenced attachments. Returns a Blob |
| `formatDate.ts` | Date formatting helpers |
| `validators.ts` | `isValidEmail()`, `isValidPassword()` (min 6 chars), `isValidUrl()`, `isRequired()` |
| `registerSW.ts` | `registerSW()` — registers `public/sw.js`, sets up update-check interval, dispatches `swUpdateAvailable` event when a new worker is installed |
| `logger.ts` | Client-side logger wrapper with `[TaskFlow]` prefix. Silenced in production via `import.meta.env.PROD` check |
| `index.ts` | Re-exports `formatDate`, `validators`, `subTeamUtils` |

---

## scripts/

| File | Purpose |
|---|---|
| `migrate-plaintext-passwords.ts` | One-time migration: audits Sheets `users!M` for plaintext passwords and hashes them in-place (Sheets + Firestore). Run with `npx tsx scripts/migrate-plaintext-passwords.ts` (audit only) or `--execute` flag (writes). Already run on 2026-07-03 — 21 passwords hashed, 0 remaining. Safe to re-run (idempotent). Keep as operational audit artifact |
| `generate-icons.js` | One-off script to generate PWA icon PNGs at various sizes |

---

## public/

| File | Purpose |
|---|---|
| `sw.js` | Service worker. Pre-caches static assets on install. Fetch handler: bypasses Google API domains, Vite dev paths (`/@vite/`, `/src/`, `.tsx`), and `/assets/*` (Vite content-hashed chunks — bypassed to prevent serving stale bundles). API routes: network-first with offline fallback. All other requests: cache-first with network fallback |
| `manifest.json` | PWA manifest: name, icons, display mode, theme colour |
| `offline.html` | Fallback page shown by the service worker when offline and no cached response available |
| `pw-logo.jpg` | PW workspace logo used in the sidebar |
| `icons/` | PWA icons at 72, 96, 128, 144, 152, 192, 384, 512 px |

---

## Key Cross-File Patterns

### Adding a new Firestore collection

1. Add interface to `src/types/index.ts`
2. Add `getColl / saveColl / deleteColl` methods to `src/lib/dbService.ts` (follow existing pattern: cache check → Firestore read → optimistic update → async Firestore write → Sheets enqueue)
3. Add collection to `batchLoadAll()` parallel fetch
4. Add `registerOptimisticCallback` subscription in `src/hooks/useDatabase.ts`
5. Add `case 'collection_name':` to `syncCollections()` and `startSheetsSyncInterval()` switch statements in `dbService`
6. Add to `getIdFieldForCollection()` map in `dbService`

### Adding a new server route

1. Create handler in `server/controllers/`
2. Create route file in `server/routes/`
3. Import and mount in `server/routes/index.ts`
4. Add client wrapper in `src/api/` if needed

### Settings key conventions

- Team leaders: `team_{TeamID}_leaders`
- Team stakeholders: `team_{TeamID}_stakeholders`
- Sub-team leaders: `team_{TeamID}_subteam_{SubTeamID}_leaders`
- Use `subTeamLeadersSettingKey(teamId, subTeamId)` from `subTeamUtils.ts` to generate the last pattern
- Use `onUpdateSetting(key, value)` callback (comma-separated emails as value) to persist
