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

async function startServer() {
  const app = express();
  // Support both Cloud Run 3000, Hugging Face 7860, or any environment port
  const PORT = process.env.PORT || 3000;
  const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
  const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "http://localhost:3000", "https://*.googleapis.com", "https://*.google.com", "ws://localhost:*"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: { error: 'Too many requests from this IP, please try again later.' }
  });
  app.use('/api/', limiter);

  app.use(express.json({ limit: '10mb' }));

  // API Route: Google Sheets Service Account Token proxy
  app.get("/api/token", async (req, res) => {
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_PRIVATE_KEY;
      const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

      if (!email || !privateKey) {
        return res.status(400).json({ 
          active: false,
          error: "Google Service Account credentials not provided in environment. Please configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY." 
        });
      }

      // RS256 JWT claims
      const iat = Math.floor(Date.now() / 1000);
      const exp = iat + 3600;
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
        console.error("Express SA Token fetch failed:", errorText);
        return res.status(500).json({ error: "Failed to generate Google Bearer token.", details: errorText });
      }

      const tokenData = await tokenRes.json();
      return res.json({
        accessToken: tokenData.access_token,
        spreadsheetId: spreadsheetId || null,
        expiresIn: tokenData.expires_in,
        serviceAccountActive: true
      });
    } catch (err: any) {
      console.error("Crash inside Express /api/token:", err);
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  });

  // API Route: User authentication with JWT
  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      // Fetch users from Google Sheets to validate credentials
      // Note: In production, you might want to cache this or use a separate auth database
      const tokenRes = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/token`);
      if (!tokenRes.ok) {
        return res.status(500).json({ error: "Failed to authenticate with Google Sheets" });
      }
      const tokenData = await tokenRes.json();
      
      // Fetch users from Google Sheets
      const sheetsRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${tokenData.spreadsheetId}/values/users!A1:Z9999?valueRenderOption=FORMATTED_VALUE`, {
        headers: { Authorization: `Bearer ${tokenData.accessToken}` }
      });
      
      if (!sheetsRes.ok) {
        return res.status(500).json({ error: "Failed to fetch users from database" });
      }
      
      const sheetsData = await sheetsRes.json();
      const rows = sheetsData.values || [];
      const headers = rows[0] || [];
      
      // Find user by email
      const userRow = rows.slice(1).find(row => {
        const emailIdx = headers.indexOf('Email');
        return emailIdx >= 0 && row[emailIdx] === email;
      });
      
      if (!userRow) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      const userObj: any = {};
      headers.forEach((header: string, idx: number) => {
        userObj[header] = userRow[idx] || '';
      });
      
      // Check if user is active
      if (userObj.Active === 'false' || userObj.Active === false) {
        return res.status(403).json({ error: "Account is inactive. Please contact your administrator." });
      }
      
      // Verify password using bcrypt
      const passwordMatch = await bcrypt.compare(password, userObj.Password);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { 
          email: userObj.Email, 
          userId: userObj.UserID, 
          role: userObj.Role,
          fullName: userObj.FullName 
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      
      // Return user data (without password) and token
      const { Password, ...userWithoutPassword } = userObj;
      return res.json({
        token,
        user: userWithoutPassword,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      });
    } catch (err: any) {
      console.error("Crash inside Express /api/login:", err);
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  });

  // API Route: Hash password (for user registration)
  app.post("/api/hash-password", async (req, res) => {
    try {
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      return res.json({ hashedPassword });
    } catch (err: any) {
      console.error("Crash inside Express /api/hash-password:", err);
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  });

  // API Route: Upload file to Google Drive
  app.post("/api/upload-file", async (req, res) => {
    try {
      const { fileName, fileData, mimeType, taskId, reportId } = req.body;

      if (!fileName || !fileData || !mimeType) {
        return res.status(400).json({ error: "File name, data, and MIME type are required" });
      }

      // Validate file size (max 10MB)
      const fileSize = Buffer.from(fileData, 'base64').length;
      if (fileSize > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "File size exceeds 10MB limit" });
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'text/plain'
      ];
      if (!allowedTypes.includes(mimeType)) {
        return res.status(400).json({ error: "File type not allowed" });
      }

      // Get Google Sheets access token
      const tokenRes = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/token`);
      if (!tokenRes.ok) {
        return res.status(500).json({ error: "Failed to authenticate with Google" });
      }
      const tokenData = await tokenRes.json();

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
    } catch (err: any) {
      console.error("Crash inside Express /api/upload-file:", err);
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
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
    app.use(express.static(distPath));
    // Serve index.html for all non-api SPA fallbacks
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
