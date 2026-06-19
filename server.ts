import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

dotenv.config();

// Constants
const JWT_EXPIRATION_SECONDS = 3600;
const USER_ID_MIN = 1000;
const USER_ID_MAX = 9999;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'text/plain'
] as const;

// Types
interface GoogleSheetsTokenResponse {
  accessToken: string;
  spreadsheetId: string | null;
  expiresIn: number;
  serviceAccountActive: boolean;
}

interface AuthRequest extends express.Request {
  user?: {
    email: string;
    userId: string;
    role: string;
    fullName: string;
  };
}

interface LoginRequestBody {
  email: string;
  password: string;
}

interface AccountRequestRequestBody {
  fullName: string;
  email: string;
  password: string;
  role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder';
  teamId: string;
  managerEmail: string;
}

interface UploadFileRequestBody {
  fileName: string;
  fileData: string;
  mimeType: string;
  taskId?: string;
  reportId?: string;
}

interface UserResponse {
  email: string;
  UserID: string;
  Role: string;
  FullName: string;
  TeamID: string;
  TeamName: string;
  Active: boolean;
}

// Helper function to generate user ID
function generateUserId(): string {
  return 'USR-' + Math.floor(USER_ID_MIN + Math.random() * (USER_ID_MAX - USER_ID_MIN));
}

// Helper function to validate file upload
function validateFileUpload(fileName: string, fileData: string, mimeType: string): { valid: boolean; error?: string } {
  if (!fileName || !fileData || !mimeType) {
    return { valid: false, error: "File name, data, and MIME type are required" };
  }

  const fileSize = Buffer.from(fileData, 'base64').length;
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File size exceeds 10MB limit" };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return { valid: false, error: "File type not allowed" };
  }

  return { valid: true };
}

// Reusable function to generate Google Sheets access token
async function generateGoogleSheetsToken(): Promise<GoogleSheetsTokenResponse | null> {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!email || !privateKey) {
      console.error("Google Service Account credentials not provided in environment.");
      return null;
    }

    // RS256 JWT claims
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + JWT_EXPIRATION_SECONDS;
    const claims = {
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
      aud: "https://oauth2.googleapis.com/token",
      exp,
      iat
    };

    const header = { alg: "RS256", typ: "JWT" };
    const base64UrlHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const base64UrlPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${base64UrlHeader}.${base64UrlPayload}`);
    
    const formattedKey = privateKey.replace(/\\n/g, "\n");
    const signature = sign.sign(formattedKey, "base64url");

    const jwt = `${base64UrlHeader}.${base64UrlPayload}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      })
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("Google SA Token fetch failed:", errorText);
      return null;
    }

    const tokenData = await tokenRes.json();
    return {
      accessToken: tokenData.access_token,
      spreadsheetId: spreadsheetId || null,
      expiresIn: tokenData.expires_in,
      serviceAccountActive: true
    };
  } catch (err: unknown) {
    console.error("Error generating Google Sheets token:", err);
    return null;
  }
}

async function startServer() {
  const app = express();
  // Support both Cloud Run 3000, Hugging Face 7860, or any environment port
  const PORT = process.env.PORT || 3000;
  const JWT_SECRET = (process.env.JWT_SECRET as string) || 'change-this-secret-in-production';
  const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

  // Trust proxy for rate limiting behind proxies (only trust specific proxies)
  app.set('trust proxy', 1); // Trust first proxy

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Temporarily disabled to fix login issue
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: { error: 'Too many requests from this IP, please try again later.' }
  });
  app.use('/api/', limiter);

  app.use(express.json({ limit: '10mb' }));

  // JWT Authentication Middleware
  const authenticateToken = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err: jwt.VerifyErrors | null, user: any) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      req.user = user;
      next();
    });
  };

  // API Route: Google Sheets Service Account Token proxy (public - needed for app initialization)
  app.get("/api/token", async (req, res) => {
    try {
      const tokenData = await generateGoogleSheetsToken();
      
      if (!tokenData) {
        return res.status(400).json({ 
          active: false,
          error: "Google Service Account credentials not provided in environment. Please configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY." 
        });
      }

      return res.json(tokenData);
    } catch (err: unknown) {
      console.error("Crash inside Express /api/token:", err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: "Internal Server Error", details: errorMessage });
    }
  });

  // API Route: Simple login
  app.post("/api/login", async (req: express.Request, res: express.Response) => {
    try {
      const { email, password } = req.body as LoginRequestBody;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      // Simple authentication - for demo purposes
      // In production, you should verify against a real database
      const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
      const userId = generateUserId();
      const normalizedEmail = email.toLowerCase();
      const fullName = email.split('@')[0];
      
      const token = jwt.sign(
        {
          email: normalizedEmail,
          userId,
          role: 'Admin',
          fullName
        },
        JWT_SECRET,
        { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] }
      );

      const userResponse: UserResponse = {
        email: normalizedEmail,
        UserID: userId,
        Role: 'Admin',
        FullName: fullName,
        TeamID: 'T-00',
        TeamName: 'Admin Team',
        Active: true
      };

      return res.json({
        token,
        user: userResponse,
        expiresIn
      });
    } catch (err: unknown) {
      console.error("Crash inside Express /api/login:", err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: "Internal Server Error", details: errorMessage });
    }
  });

  // API Route: Account request (public)
  app.post("/api/account-request", async (req: express.Request, res: express.Response) => {
    try {
      const { fullName, email, password, role, teamId, managerEmail } = req.body as AccountRequestRequestBody;

      if (!fullName || !email || !password || !role || !teamId) {
        return res.status(400).json({ error: "All required fields must be provided" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Get Google Sheets access token
      const tokenData = await generateGoogleSheetsToken();
      if (!tokenData) {
        return res.status(500).json({ error: "Failed to authenticate with Google Sheets" });
      }

      // Check if user already exists
      const spreadsheetId = tokenData.spreadsheetId;
      if (!spreadsheetId) {
        return res.status(500).json({ error: "Spreadsheet ID not found" });
      }

      // Fetch existing users to check for duplicate email
      const usersRange = 'users!A:R';
      const usersRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${usersRange}`,
        {
          headers: { 'Authorization': `Bearer ${tokenData.accessToken}` }
        }
      );

      if (!usersRes.ok) {
        return res.status(500).json({ error: "Failed to check existing users" });
      }

      const usersData = await usersRes.json();
      const existingUsers = usersData.values || [];
      const normalizedEmail = email.toLowerCase();

      // Check if email already exists
      for (const row of existingUsers) {
        if (row[3] === normalizedEmail) { // Email is in column 4 (index 3)
          return res.status(400).json({ error: "An account with this email already exists" });
        }
      }

      // Create new user with pending approval status
      const newUserId = generateUserId();
      const now = new Date().toISOString();
      const teamName = teamId === 'T-01' ? 'Enterprise Sales' : 'Default Team';

      const newUserRow = [
        newUserId,                    // UserID (A)
        fullName,                     // FullName (B)
        normalizedEmail,              // Email (C)
        role,                         // Role (D)
        managerEmail || '',           // ManagerEmail (E)
        teamId,                       // TeamID (F)
        teamName,                     // TeamName (G)
        'false',                      // Active (H) - inactive until approved
        'true',                       // CanCreateFollowUp (I)
        'true',                       // CanCloseTask (J)
        now,                          // CreatedAt (K)
        now,                          // UpdatedAt (L)
        password,                     // Password (M)
        'pending',                    // ApprovalStatus (N)
        normalizedEmail,              // RequestedBy (O)
        now,                          // RequestedAt (P)
        '',                           // ApprovedBy (Q)
        ''                            // ApprovedAt (R)
      ];

      // Append new user to Google Sheets
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/users:append`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [newUserRow],
            valueInputOption: 'RAW'
          })
        }
      );

      if (!appendRes.ok) {
        return res.status(500).json({ error: "Failed to submit account request" });
      }

      return res.json({
        success: true,
        message: "Account request submitted successfully. Please wait for admin approval."
      });
    } catch (err: unknown) {
      console.error("Crash inside Express /api/account-request:", err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: "Internal Server Error", details: errorMessage });
    }
  });

  // API Route: Approve user account (protected)
  app.post("/api/approve-user", authenticateToken, async (req: AuthRequest, res: express.Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Get Google Sheets access token
      const tokenData = await generateGoogleSheetsToken();
      if (!tokenData) {
        return res.status(500).json({ error: "Failed to authenticate with Google Sheets" });
      }

      const spreadsheetId = tokenData.spreadsheetId;
      if (!spreadsheetId) {
        return res.status(500).json({ error: "Spreadsheet ID not found" });
      }

      // Fetch all users
      const usersRange = 'users!A:R';
      const usersRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${usersRange}`,
        {
          headers: { 'Authorization': `Bearer ${tokenData.accessToken}` }
        }
      );

      if (!usersRes.ok) {
        return res.status(500).json({ error: "Failed to fetch users" });
      }

      const usersData = await usersRes.json();
      const users = usersData.values || [];
      const normalizedEmail = email.toLowerCase();
      const adminEmail = req.user?.email || 'admin';

      // Find the user to approve
      let userRowIndex = -1;
      let userRow: any[] | null = null;

      for (let i = 0; i < users.length; i++) {
        const row = users[i];
        if (row[3] === normalizedEmail) { // Email is in column 4 (index 3)
          userRowIndex = i;
          userRow = row;
          break;
        }
      }

      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update user row: set Active to true, ApprovalStatus to approved, add approver info
      const now = new Date().toISOString();
      userRow[7] = 'true'; // Active (H)
      userRow[13] = 'approved'; // ApprovalStatus (N)
      userRow[16] = adminEmail; // ApprovedBy (Q)
      userRow[17] = now; // ApprovedAt (R)

      // Update the user row in Google Sheets
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/users!A${userRowIndex + 1}:R${userRowIndex + 1}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${tokenData.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [userRow],
            valueInputOption: 'RAW'
          })
        }
      );

      if (!updateRes.ok) {
        return res.status(500).json({ error: "Failed to approve user" });
      }

      return res.json({
        success: true,
        message: "User approved successfully"
      });
    } catch (err: unknown) {
      console.error("Crash inside Express /api/approve-user:", err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: "Internal Server Error", details: errorMessage });
    }
  });


  // API Route: Upload file to Google Drive (protected)
  app.post("/api/upload-file", authenticateToken, async (req: AuthRequest, res: express.Response) => {
    try {
      const { fileName, fileData, mimeType, taskId, reportId } = req.body as UploadFileRequestBody;

      const validation = validateFileUpload(fileName, fileData, mimeType);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Get Google Sheets access token directly instead of making HTTP request to self
      const tokenData = await generateGoogleSheetsToken();
      if (!tokenData) {
        return res.status(500).json({ error: "Failed to authenticate with Google" });
      }

      // Create folder structure in Google Drive
      const folderPath = `/BE/TaskReports/${taskId}/${reportId}`;
      
      // First, create the parent folder if it doesn't exist
      // For simplicity, we'll upload directly to Drive with the folder structure in the name
      const driveFileName = `${folderPath}/${fileName}`;

      // Upload file to Google Drive
      const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.accessToken}`,
        },
        body: JSON.stringify({
          name: driveFileName,
          mimeType: mimeType,
        }),
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("Google Drive upload failed:", errorText);
        return res.status(500).json({ error: "Failed to upload file to Google Drive" });
      }

      const uploadData = await uploadRes.json();

      // Get file URL (webViewLink)
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}?fields=webViewLink,webContentLink`, {
        headers: {
          'Authorization': `Bearer ${tokenData.accessToken}`,
        },
      });

      const fileDataResult = await fileRes.json();

      return res.json({
        fileId: uploadData.id,
        fileName: fileName,
        webViewLink: fileDataResult.webViewLink,
        webContentLink: fileDataResult.webContentLink,
        uploadedAt: new Date().toISOString()
      });
    } catch (err: unknown) {
      console.error("Crash inside Express /api/upload-file:", err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: "Internal Server Error", details: errorMessage });
    }
  });

  // Vite development vs production compiler route configuration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Serve static files from dist directory with proper MIME types
    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (filePath.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        } else if (filePath.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
        } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
          res.setHeader('Content-Type', 'image/jpeg');
        } else if (filePath.endsWith('.svg')) {
          res.setHeader('Content-Type', 'image/svg+xml');
        } else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) {
          res.setHeader('Content-Type', 'font/woff2');
        }
      }
    }));
    // Serve index.html for all non-API SPA fallbacks
    app.get("*", (req, res) => {
      // Don't intercept API routes
      if (req.path.startsWith('/api/')) {
        res.status(404).send('Not Found');
        return;
      }
      // For all other routes, serve index.html (let static middleware handle actual files first)
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
