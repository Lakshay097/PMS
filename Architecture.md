# PMS TaskFlow — Architecture

## Overview

PMS TaskFlow is an enterprise task management and compliance-reporting system. Users are organised into Teams and Sub-Teams with role-based access. Recurring task schedules are generated automatically from blueprints. Progress reports, follow-up chains, file attachments, and email notifications are all first-class features.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 8 |
| Styling | Tailwind CSS 4 (native theme variables) |
| Animations | Framer Motion |
| Icons | lucide-react |
| Backend | Express.js 4, TypeScript, `tsx` (dev), `esbuild` (prod bundle) |
| Primary database | **Firestore** (client writes directly via Firebase SDK) |
| Auth source-of-truth | **Google Sheets** (login reads column-indexed rows) |
| Background sync | Google Sheets (5-min flush queue from client `dbService`) |
| Auth tokens | JWT (RS256, issued by Express from Sheets data) |
| Password hashing | bcrypt (12 rounds) |
| File uploads | Cloudinary (primary) + Google Drive (legacy path) |
| Email | Gmail OAuth (per-user), fallback to system account |
| Real-time | SSE (`/api/changes/stream`), immediate broadcast via `POST /api/events/notify` |
| PWA | Service worker (`public/sw.js`), `manifest.json`, install prompt |
| Deployment | Google Cloud Run (Dockerfile + `cloudbuild.yaml`) |
| State management | React `useState` + custom hooks — no Redux/Zustand |
| Query cache | TanStack React Query (used for SSE cache-key invalidation only) |

---

## Repository Structure

```
/
├── server/              Express.js backend
│   ├── config/          Environment variable loading and validation
│   ├── controllers/     Request handlers (one file per route group)
│   ├── middleware/       JWT auth, error handler, rate limiters, logger, validation
│   ├── routes/          Route definitions (mounted in routes/index.ts)
│   ├── services/        Business logic and external API integrations
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
│   │   ├── reminderScheduler.ts        Weekly scheduled-task reminder emails
│   │   ├── recurringTaskScheduler.ts   Recurring task generation scheduler
│   │   └── sheetsSyncController.ts     Server-side Sheets sync queue manager
│   └── utils/           AppError class hierarchy, async wrapper, logger
│
├── src/                 React frontend
│   ├── api/             Thin REST client wrappers (call Express endpoints)
│   ├── components/      UI components organised by concern
│   │   ├── dashboard/   Overview dashboard
│   │   ├── features/    Feature-scoped components (admin, auth, tasks, ...)
│   │   ├── layout/      AppShell, Sidebar, TopBar
│   │   ├── shared/      Generic reusable primitives (Modal, Drawer, badges, ...)
│   │   ├── reports/     Reports page component
│   │   ├── schedules/   Scheduled tasks page component
│   │   ├── settings/    Settings page component
│   │   ├── team/        Team directory page component
│   │   └── ui/          Minimal atoms (Spinner)
│   ├── constants/       Enums and static config
│   ├── contexts/        React Context providers (AuthContext)
│   ├── hooks/           All custom hooks
│   ├── lib/             Core client libraries (Firestore, Sheets, SSE, task engine)
│   ├── pages/           Thin page wrappers that forward props to feature components
│   ├── types/           All TypeScript interfaces (single file)
│   └── utils/           Pure utility functions
│
├── scripts/             One-off operational scripts (not bundled)
│   ├── migrate-plaintext-passwords.ts  One-time bcrypt migration (already run)
│   ├── migrate-subteam-ids.ts          One-time sub-team membership migration
│   └── generate-icons.js               PWA icon generator
├── public/              Static assets, service worker, PWA icons, manifest
└── dist/                Build output (gitignored)
```

---

## Database Architecture

### Two-store design

| Store | Role | Who writes |
|---|---|---|
| **Firestore** | Primary read/write store for the React app | `src/lib/dbService.ts` (client-side, direct) |
| **Google Sheets** | Auth source-of-truth; legacy sync target | Express auth handlers (writes); `dbService` background queue (syncs) |

**Why two stores?**  
The app started with Google Sheets as the only database. Firestore was added later for lower latency and real-time capability. Login authentication was left on Sheets because it reads column-indexed rows directly and the schema predates Firestore. Migrating auth to Firestore is deferred work.

### Write path (client)

```
UI action
  → dbService.saveX()          (optimistic: update in-memory cache + notify pub/sub instantly)
  → (async) setDoc(Firestore)  (actual persistence)
  → on failure: rollback cache from Firestore re-read
  → enqueue Sheets write       (flushed every 5 minutes)
```

### Read path on startup

```
batchLoadAll() races:
  ├─ Firestore (primary, faster)  → wins if responds within 15 s
  └─ Google Sheets (fallback)     → wins if Firestore times out
```

### Optimistic update pub/sub

`dbService` exposes `registerOptimisticCallback(collection, fn)`. `useDatabase` registers callbacks for all collections. When `dbService.saveX()` updates the cache, it immediately calls all registered callbacks so React state reflects the change before the Firestore write completes.

### Settings key pattern

Leadership assignments are stored as `Key/Value` rows in the `settings` Firestore collection:

```
team_{TeamID}_leaders                           → comma-separated emails  (team leader)
team_{TeamID}_stakeholders                      → comma-separated emails  (team stakeholders)
team_{TeamID}_subteam_{SubTeamID}_leaders       → comma-separated emails  (sub-team leader)
```

---

## Firestore Collections

| Collection | Document ID | Purpose |
|---|---|---|
| `users` | `email` (lowercase) | User profiles, roles, team assignments |
| `teams` | `TeamID` | Team definitions |
| `sub_teams` | `SubTeamID` | Sub-team definitions (new) |
| `tasks` | `TaskID` | Task instances |
| `templates` | `TemplateID` | Recurring task blueprints |
| `settings` | `Key` | App config and leadership assignments |
| `reports` | `ReportID` | Progress reports |
| `followups` | `FollowUpID` | Follow-up task chains |
| `subtasks` | `SubtaskID` | Checklist items within tasks |
| `comments` | `CommentID` | Task comments |
| `email_templates` | `Key` | Email body/subject templates |
| `team_submissions` | `SubmissionID` | Weekly scheduled-task submissions |
| `auditlogs` | auto | Append-only audit trail |

---

## Server API Routes

All routes are mounted under `/api` via `server/routes/index.ts`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/login` | Public | Authenticate against Sheets, issue JWT |
| POST | `/api/account-request` | Public | Self-registration (creates pending user) |
| POST | `/api/approve-user` | JWT | Admin approves pending user |
| POST | `/api/change-password` | JWT | Change own password |
| GET | `/api/teams/public` | Public | Active team names for registration dropdown |
| POST | `/api/upload-file` | JWT | Upload file to Cloudinary |
| GET | `/api/token` | Public | Return Google Sheets OAuth token to client |
| GET | `/api/changes/stream` | — | SSE stream for real-time notifications |
| POST | `/api/events/notify` | JWT | Trigger immediate SSE broadcast |
| GET | `/api/sheets/:id/metadata` | — | Sheets spreadsheet metadata proxy |
| GET/PUT/POST | `/api/sheets/:id/values/*` | — | Sheets read/write proxy |
| GET | `/api/auth/gmail/url` | JWT | Get Gmail OAuth URL |
| GET | `/api/auth/gmail/callback` | Public | Gmail OAuth callback |
| GET/DELETE | `/api/auth/gmail/status` | JWT | Gmail connection status |
| POST | `/api/email/trigger/*` | JWT | Fire event-driven emails |
| GET/POST | `/api/email/templates` | JWT | Read/write email templates |
| POST | `/api/sheets/sync` | JWT | Trigger server-side Sheets sync (centralized queue) |

---

## Authentication Flow

```
1. LoginScreen POSTs { email, password } → /api/login
2. authService reads users from Google Sheets (column 12 = password)
3. bcrypt.compare() against stored hash
4. JWT signed with RS256, embedded { email, userId, role, fullName }
5. Token stored in localStorage as 'PMS_auth_token'
6. App.tsx reads JWT role from localStorage on re-render (prevents Firestore
   stale-value from downgrading role after loadDatabase())
```

---

## Role Hierarchy

| Role | Task/report visibility | Assignment privilege |
|---|---|---|
| **Admin** | Everything | Everything, cross-team |
| **Team Leader** | Everyone in their team across all sub-teams | Same-team members |
| **Sub-Team Leader** | Only members of their own sub-team | Same-team members |
| **Stakeholder** | Own tasks + tasks assigned by them + direct subordinates | Same-team members |
| **Sub-stakeholder** | Only their own assigned tasks | None |

**Roster visibility (amendment):** Every team member — regardless of role — can see the full name/email roster of all members in their team(s), including sub-team groupings. Task/report data visibility is governed by the table above and is separate from roster access.

---

## Real-Time Sync

```
Write  →  POST /api/events/notify  →  SSEService.broadcastChange()
                                         └→ all open EventSource connections
                                              └→ useRealtimeSync invalidates
                                                 React Query cache keys
Fallback: SSEService.startAuditLoop() polls auditlogs every 60 s
```

---

## Email System

1. Emails are sent via the connected user's Gmail OAuth tokens (per-user sending)
2. Fallback: system account (`DEFAULT_FALLBACK_EMAIL`) if user has no Gmail token
3. Email thread continuity: `task_email_threads` Sheets tab stores Gmail `threadId` + `messageId` so replies chain into the same Gmail thread
4. Templates are stored in `email_templates` Firestore collection and `email_templates` Sheets tab
5. Weekly scheduled-task reminders are sent on a configurable day (default: day before report due day) by `reminderScheduler.ts`

---

## PWA

- Service worker registered on production builds (`public/sw.js`)
- Cache strategy: pre-cache static assets on install; `/assets/*` (Vite content-hashed chunks) bypass cache to prevent stale bundles
- Install prompt handled by `useInstallPrompt` hook
- `UpdateBanner` component listens for `swUpdateAvailable` custom event

---

## Build and Deployment

```bash
# Development (Vite middleware mode + tsx hot reload)
npm run dev          # Express on :3000, Vite middleware serves /

# Production build
npm run build        # vite build → dist/ + esbuild server → dist/server.mjs

# Run production build
npm start            # node dist/server.mjs

# Deploy to Google Cloud Run
gcloud builds submit --config cloudbuild.yaml
```

---

## Known Issues / Technical Debt

- `Architecture.md` was previously stale (described old Sheets-only architecture). This version is accurate.
- `NODE_ENV=production` in `.env` causes `import.meta.env.DEV = false` locally — breaks `DEV`-guarded code paths and registers the service worker in dev mode. Change to `NODE_ENV=development` for local development.
- `FIREBASE_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` are required by the Firebase Admin SDK (server) but not listed in `.env.example`.
- `src/api/tasks.ts`, `src/api/users.ts`, `src/api/reports.ts`, `src/api/teams.ts` are REST wrappers that reference server endpoints which do not exist. They are not used by the running app — all data access goes through `dbService`. They exist as scaffolding stubs.
- No test framework is configured. Zero test coverage.
- `src/lib/syncQueue.ts` is implemented but not wired into `dbService` failure paths (noted in code as `TECH-DEBT`).
- Sub-Teams feature (7-task spec) is in progress. Tasks 1–4 committed. Task 4 (Admin UI) is working — the "admin panel fails to load" symptom was caused by a stale service worker cache (SW registered locally because `NODE_ENV=production` in `.env` makes `import.meta.env.PROD` true, which triggers SW registration). Unregistering the SW + hard reload resolved the symptom without code changes. Separately, `DashboardPageProps` was found to be missing `reports`, `teamSubmissions`, `onAddTeamSubmission`, `triggerNotification`, `subTeams`, and the four sub-team callbacks; `onNewTask` was also missing the `teamIds` param — all silently dropped at the page boundary since the file was created. Fixed in commit `869a829`.
- **Open item — NODE_ENV:** `NODE_ENV=production` in `.env` causes the service worker to register during local dev, producing stale-bundle cache issues on every bundle change. Decision pending: change to `NODE_ENV=development` for local work to stop SW registration. Do not change without explicit decision — it affects `import.meta.env.PROD`/`DEV` guards throughout the app.
- **Server-side Sheets sync:** `server/services/sheetsSyncController.ts` implements a centralized Sheets write queue to prevent multi-tab race conditions, but uses in-memory storage. In production, this should be replaced with a persistent queue (Redis, database, etc.) to survive process restarts.
