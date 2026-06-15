# TrustGrid TaskFlow

TrustGrid TaskFlow is a high-performance, production-grade enterprise task management and reporting dashboard. Designed specifically for role-based synchronization, the application features Google Sheets as the primary database, compliant task recurrence schedulers, and secure audit logging.

This repository is optimized for both sandboxed environments and local developer execution.

---

## 🚀 Getting Started (Run on Local Machine)

To run TrustGrid TaskFlow on your local machine, follow these simple steps:

### 1. Prerequisites
Ensure you have **Node.js (v18.0.0 or higher)** and **npm** installed.

### 2. Installation
Clone or export this directory, navigate to the project root, and install dependencies:
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file at the root by copying `.env.example`:
```bash
cp .env.example .env
```

Configure the required environment variables in `.env`:
```env
# Application Configuration
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Google Service Account (REQUIRED - Google Sheets is the primary database)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id # Optional - auto-created if missing

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key
```

**Important:** Google Sheets integration is REQUIRED. You must create a Google Service Account with the following permissions:
- Google Sheets API (spreadsheets)
- Google Drive API (drive.file)

### 4. Launch Development Server
Start the local development server:
```bash
npm run dev
```
Once started, open your browser and navigate to:
* **Local Access:** `http://localhost:3000`

### 5. First-Time Setup
On first launch, the application will:
1. Automatically create a Google Sheet named "TrustGrid Systems Database" if `GOOGLE_SPREADSHEET_ID` is not set
2. Seed the database with initial admin user and settings
3. Create all required tabs (Users, Teams, Tasks, Templates, Reports, FollowUps, AuditLogs, Settings, Subtasks, Comments)

**Default Admin User:**
- Email: `admin@trustgrid.com`
- Password: `TG-1234` (change this immediately after first login)

---

## 📂 Core Architecture & Features

### 1. Google Sheets Primary Database
TrustGrid TaskFlow uses Google Sheets as the primary database with no LocalStorage fallback:
* **Connection Mode:** Service account authentication for secure, server-side access
* **Auto-Provisioning:** Automatically creates a dedicated multi-tab master spreadsheet (`TrustGrid Systems Database`) in your Google Drive
* **Schema:** Includes tabs for `Users`, `Teams`, `Tasks`, `TaskTemplates`, `TaskReports`, `FollowUps`, `AuditLogs`, `Settings`, `Subtasks`, and `Comments`
* **Data Persistence:** All data is stored directly in Google Sheets with in-memory caching for performance
* **Error Handling:** Explicit error messages for connection failures - no silent fallbacks

### 2. Secure Authentication System
* **JWT-Based Authentication:** Uses JSON Web Tokens for secure session management
* **Password Hashing:** All passwords are hashed using bcrypt before storage
* **Rate Limiting:** API endpoints are rate-limited to prevent brute force attacks
* **Security Headers:** Content Security Policy (CSP) headers for XSS protection

### 3. Enterprise Workflow Policies & Roles
Access control is enforced at the layout level:
* **Admin:** Complete system administration. Access to System Console, user management, template editing, and raw logs view.
* **Stakeholder:** High-level view, progress reviews, and assignment of follow-up tasks for their direct department team members.
* **Sub-stakeholder:** Visual task boards focused strictly on assigned tasks. Permitted to submit completion reports and feedback.

### 4. Recurrence Cycle Processing
A background service checks the next run dates on all active compliance blueprints (e.g., *Quarterly financial compliance review*, *Weekly deployment checks*). The system automatically generates scheduled task instances based on recurrence patterns (Daily, Weekly, Monthly, Quarterly, Half-yearly).

### 5. File Upload Feature
* **Google Drive Integration:** Files uploaded to task reports are stored in Google Drive
* **Folder Structure:** Files are organized as `/BE/TaskReports/{TaskID}/{ReportID}/`
* **Validation:** File size (max 10MB) and type validation (PDF, Word, Excel, images, text)
* **Metadata:** File metadata (ID, name, URL, upload time) is stored in Google Sheets

---

## 🛠️ Tech Stack & Styling Guide

* **Frontend Framework:** React 19 + TypeScript (strict types located in `src/types.ts`)
* **Bundler & Dev Server:** Vite 8
* **Styling Method:** Tailwind CSS 4 using native theme variables and responsive prefixes
* **Database:** Google Sheets API v4 (primary database, no fallback)
* **Authentication:** JWT with bcrypt password hashing
* **Backend:** Express.js with security middleware (helmet, rate-limiting)
* **UI Iconography:** Fully imported from `lucide-react`
* **Animations:** Framer Motion for smooth transitions

---

## 🔒 Security Features

* **Password Security:** All passwords are hashed using bcrypt (12 rounds)
* **JWT Authentication:** Secure token-based authentication with configurable expiration
* **Rate Limiting:** API rate limiting (100 requests per 15 minutes by default)
* **Content Security Policy:** CSP headers to prevent XSS attacks
* **Input Validation:** Server-side validation on all API endpoints
* **File Upload Validation:** Size and type validation for file uploads

---

## 📦 Deployment

### Google Cloud Run (Recommended)
See `DEPLOYMENT.md` for detailed deployment instructions to Google Cloud Run with free tier optimization.

### Environment Variables for Production
```env
NODE_ENV=production
PORT=3000
APP_URL=https://your-cloud-run-url.run.app
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
JWT_SECRET=your-production-jwt-secret
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
GEMINI_API_KEY=your_gemini_api_key
```

---

## 🐛 Troubleshooting

### Google Sheets Connection Issues
- Verify your service account has the correct permissions (Sheets API, Drive API)
- Ensure the private key is properly formatted with `\n` for line breaks
- Check that the service account email is correct

### Authentication Issues
- Verify JWT_SECRET is set in environment variables
- Check that passwords are properly hashed in the database
- Ensure the /api/login endpoint is accessible

### File Upload Issues
- Verify Google Drive API is enabled for your service account
- Check file size (max 10MB) and type validation
- Ensure the service account has drive.file permission

---

## 📝 Migration Notes

This application has been migrated from LocalStorage to Google Sheets as the primary database. Key changes:
- **Removed:** LocalStorage fallback, Firebase Auth, Firestore integration
- **Added:** JWT authentication, bcrypt password hashing, Google Drive file uploads
- **Updated:** All database operations now go directly to Google Sheets with proper error handling
- **Security:** Added rate limiting, CSP headers, and input validation

**Important:** Users must configure Google Service Account credentials before first use.
