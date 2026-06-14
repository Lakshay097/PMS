# TrustGrid TaskFlow

TrustGrid TaskFlow is a high-performance, production-grade enterprise task management and reporting dashboard. Designed specifically for role-based synchronization, the application features bidirectional Google Sheets integration, compliant task recurrence schedulers, and secure audit logging. 

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

### 3. Launch Development Server
Start the local development server:
```bash
npm run dev
```
Once started, open your browser and navigate to:
* **Local Access:** `http://localhost:3000`

---

## 📂 Core Architecture & Features

### 1. Google Sheets Live Database
TrustGrid TaskFlow supports immediate, real-time sync with Google Sheets. Under the hood:
* **Connection Mode:** Authenticate directly using your Google account using the "Connect Sheets" module on the sidebar.
* **Auto-Provisioning:** Upon successful login, the app automatically provisions a dedicated multi-tab master spreadsheet (`TaskFlow_Database`) in your Google Drive with sheets matching the enterprise schema: `Users`, `Teams`, `Tasks`, `TaskTemplates`, `TaskReports`, `FollowUps`, `AuditLogs`, and `AppSettings`.
* **State Syncing:** Includes bidirectional syncing and instant local caches. You can inspect or modify values directly in your master spreadsheet, then tap **Force Sync Now** to sync with the workspace.

### 2. Collapsible Navigation System
* Preserves screen real-estate with a sidebar that adapts dynamically to your preference.
* State is fully preserved in `localStorage` (`trustgrid_sidebar_collapsed`) across window reloads and navigation.
* Elegant UI badges and tooltips indicating assigned Roles, Emails, and connection status in both expanded and collapsed views.

### 3. Enterprise Workflow Policies & Roles
Access control is enforced at the layout level. Real-time controls depend on your logged-in Google Identity or Scoped Local Role:
* **Admin (`admin@trustgrid.com`):** Complete system administration. Access to the **System Console**, database seeding triggers, assignee filtering, raw logs view, and master template editing.
* **Stakeholder (`sales.lead@..., eng.director@...`):** High-level view, progress reviews, and assignment of follow-up tasks for their direct department team members only.
* **Sub-stakeholder (`sales.exec1@..., eng.dev1@...`):** Visual task boards focused strictly on assigned tasks. Permitted to submit completion reports and feedback, but cannot create templates or re-assign other stakeholders.

### 4. Recurrence Cycle Processing
A background service checks the next run dates on all active compliance blueprints (e.g., *Quarterly financial compliance review*, *Weekly deployment checks*). Click **Process Cycle Run** to force-evaluate Cron criteria and automatically generate scheduled instances.

---

## 🛠️ Tech Stack & Styling Guide

* **Frontend Framework:** React 19 + TypeScript (strict types located in `src/types.ts`).
* **Bundler & Dev Server:** Vite 6.
* **Styling Method:** Tailwind CSS using native theme variables and responsive prefixes.
* **Database & Auth Engines:** Google Sheets API v3/v4 proxy combined with Firebase Auth.
* **UI Iconography:** Fully imported from `lucide-react`.

---

## 🔒 Environment Secrets

If you require custom Google API integrations locally, create a `.env` file at the root by copying `.env.example`:
```env
GEMINI_API_KEY="your-gemini-key"
APP_URL="http://localhost:3000"
```
The client-side Firebase runtime configuration is automatically parsed from `firebase-applet-config.json` at startup.
