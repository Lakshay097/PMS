# TrustGrid TaskFlow Architecture

## Overview

TrustGrid TaskFlow is an enterprise task management system that uses Google Sheets as its primary database. The application follows a client-server architecture with React on the frontend and Express.js on the backend.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Components: Dashboard, LoginScreen, Modals, Drawers        ││
│  │  State Management: React useState hooks                     ││
│  │  API Calls: fetch() to Express backend                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/HTTPS
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Express.js)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Security Middleware:                                      ││
│  │  - Helmet (CSP headers)                                    ││
│  │  - Rate Limiting                                           ││
│  │  - Body Parser                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  API Endpoints:                                           ││
│  │  - GET  /api/token (Google Sheets service account token)  ││
│  │  - POST /api/login (JWT authentication)                    ││
│  │  - POST /api/hash-password (bcrypt hashing)                ││
│  │  - POST /api/upload-file (Google Drive upload)            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ OAuth 2.0 (Service Account)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Google Services                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Google Sheets API (Primary Database)                      ││
│  │  - Spreadsheet: "TrustGrid Systems Database"               ││
│  │  - Tabs: Users, Teams, Tasks, Templates, Reports, etc.    ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Google Drive API (File Storage)                           ││
│  │  - Folder: /BE/TaskReports/{TaskID}/{ReportID}/           ││
│  │  - File validation: size (10MB), type whitelist            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Authentication Flow

```
1. User enters email/password in LoginScreen
2. Frontend POSTs to /api/login
3. Backend:
   a. Fetches users from Google Sheets
   b. Verifies password using bcrypt.compare()
   c. Generates JWT token
   d. Returns token and user data
4. Frontend stores token in localStorage
5. Frontend includes token in Authorization header for subsequent requests
```

### Data Read Flow

```
1. Frontend calls dbService.getUsers()
2. dbService checks in-memory cache
3. If cache miss:
   a. Calls sheetsApi.getCollection('users')
   b. sheetsApi uses fetchWithRetry with exponential backoff
   c. Data is fetched from Google Sheets API
   d. Data is cached in memory
4. Data is returned to frontend
```

### Data Write Flow

```
1. Frontend calls dbService.saveUser(user)
2. dbService fetches current data from Google Sheets
3. dbService updates the data array
4. dbService calls sheetsApi.saveCollection('users', updatedData)
5. sheetsApi:
   a. Clears the sheet
   b. Writes new data
   c. Uses fetchWithRetry for reliability
6. Cache is invalidated
7. Success/error is returned to frontend
```

### File Upload Flow

```
1. User uploads file in CreateReportModal
2. Frontend converts file to base64
3. Frontend POSTs to /api/upload-file
4. Backend:
   a. Validates file size (max 10MB)
   b. Validates file type (whitelist)
   c. Uploads to Google Drive with folder structure
   d. Returns file URL
5. Frontend stores file URL in task report
6. File metadata is saved to Google Sheets
```

## Key Components

### Frontend Components

#### src/App.tsx
- Main application controller
- Manages all state (users, tasks, templates, etc.)
- Handles user authentication flow
- Coordinates with dbService for data operations

#### src/components/LoginScreen.tsx
- User authentication UI
- Calls /api/login for JWT authentication
- Calls /api/hash-password for registration
- Stores JWT token in localStorage

#### src/components/Dashboard.tsx
- Main dashboard UI
- Task filtering and search
- Role-based views
- Metrics display

#### src/lib/dbService.ts
- Database abstraction layer
- Coordinates Google Sheets API calls
- Implements in-memory caching (5-minute TTL)
- All operations go directly to Google Sheets (no LocalStorage fallback)
- Throws explicit errors on failures

#### src/lib/sheetsService.ts
- Google Sheets API integration
- Implements retry logic with exponential backoff
- Manages service account authentication
- Handles spreadsheet creation and metadata
- Converts between objects and sheet rows

#### src/lib/taskEngine.ts
- Recurring task generation logic
- Overdue task evaluation
- Cycle key calculations
- All async operations are properly awaited (no race conditions)

### Backend Components

#### server.ts
- Express.js server
- Security middleware (helmet, rate-limiting)
- API endpoints for authentication and file upload
- Google Sheets service account token proxy
- Serves static files in production

## Security Architecture

### Authentication
- JWT-based authentication with configurable expiration
- Passwords hashed using bcrypt (12 rounds)
- Service account authentication for Google APIs
- No plain text password storage

### API Security
- Rate limiting (100 requests per 15 minutes)
- Content Security Policy (CSP) headers
- Input validation on all endpoints
- File upload validation (size, type)

### Data Security
- All data stored in Google Sheets (encrypted in transit)
- Service account credentials stored in environment variables
- No sensitive data in LocalStorage (except JWT token)
- Audit logging for all write operations

## Performance Optimizations

### Caching Strategy
- In-memory cache with 5-minute TTL
- Cache invalidation on write operations
- No LocalStorage persistence (security improvement)

### API Optimization
- Retry logic with exponential backoff (max 3 retries)
- Jitter to prevent thundering herd
- Batch operations where possible

### Frontend Optimization
- React 19 with concurrent features
- Framer Motion for smooth animations
- Lazy loading of components

## Error Handling

### Google Sheets API Failures
- Explicit error messages to users
- No silent fallbacks
- Retry logic with exponential backoff
- Detailed error logging

### Authentication Failures
- Clear error messages for invalid credentials
- Account inactive status checks
- Rate limiting to prevent brute force

### Data Validation
- Server-side validation on all inputs
- Type checking with TypeScript
- Schema validation for database operations

## Deployment Architecture

### Development
- Vite dev server with HMR
- Express backend on port 3000
- Local environment variables

### Production (Google Cloud Run)
- Docker containerization
- Serverless deployment
- Auto-scaling (0 to 10 instances)
- Free tier optimized (512Mi memory, 0.5 vCPU)
- Environment variables configured in Cloud Run

## Migration Notes

### Changes from Previous Architecture

**Removed:**
- LocalStorage as primary database
- Firebase Auth
- Firestore integration
- Silent fallback to cache
- Plain text password storage

**Added:**
- Google Sheets as primary database
- JWT authentication
- bcrypt password hashing
- Google Drive file uploads
- Rate limiting
- CSP headers
- Proper error handling
- Retry logic with exponential backoff

**Improved:**
- Security posture (passwords hashed, JWT tokens)
- Reliability (retry logic, explicit errors)
- Performance (in-memory caching)
- User experience (file uploads, better error messages)

## Future Considerations

### Scalability
- Current architecture supports ~100 concurrent users
- Google Sheets API quotas may require pagination for larger datasets
- Consider migrating to PostgreSQL for >1000 users

### Security Enhancements
- Implement httpOnly cookies for JWT storage
- Add CSRF token validation
- Implement proper session management
- Add two-factor authentication

### Performance
- Implement pagination for large datasets
- Add virtual scrolling for task lists
- Optimize Google Sheets API calls with batching
- Consider Redis for distributed caching

### Monitoring
- Add application performance monitoring
- Implement error tracking (Sentry)
- Add health check endpoints
- Implement usage analytics
