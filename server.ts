import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  // Support both Cloud Run 3000, Hugging Face 7860, or any environment port
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // API Route: Google Sheets Service Account Token proxy
  app.get("/api/token", async (req, res) => {
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_PRIVATE_KEY;
      const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

      if (!email || !privateKey) {
        return res.json({ 
          active: false,
          error: "Google Service Account credentials not provided in environment." 
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
