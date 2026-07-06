import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mime from 'mime-types';
import { config, validateEnv } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';
import apiRoutes from './routes';
import { logger } from './utils/logger';
import { sseService } from './services/sseService';
import { authenticateToken, AuthRequest } from './middleware/auth';
import { oauthRateLimiter, loginRateLimiter } from './middleware/rateLimiters';
import * as gmailAuthController from './controllers/gmailAuthController';
import { initializeTeamSubmissionsSheet } from './services/googleSheetsService';
import { startReminderScheduler } from './services/reminderScheduler';
import { startRecurringTaskScheduler } from './services/recurringTaskScheduler';
import { startSheetsSyncInterval } from './services/sheetsSyncController';

validateEnv();

async function startServer() {
  // Initialize email-related sheets
  await gmailAuthController.initializeEmailSheets();
  await initializeTeamSubmissionsSheet();

  // Start automated email reminders scheduler
  startReminderScheduler();
  
  // Start recurring task generation scheduler
  startRecurringTaskScheduler();

  // Start server-side Sheets sync controller
  startSheetsSyncInterval();
  const app = express();

  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.use(helmet({ contentSecurityPolicy: false }));

  app.use('/api/', rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    message: { error: 'Too many requests from this IP, please try again later.' }
  }));

  app.use(requestLogger);
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', apiRoutes);
  app.get("/api/changes/stream", sseService.getSSEHandler());
  sseService.startAuditLoop();

  // Gmail OAuth callback route (public, not under /api/)
  // Rate limited: 20 failed requests per 15 minutes per IP
  app.get('/api/auth/gmail/callback', oauthRateLimiter, gmailAuthController.gmailCallbackHandler);

  // POST /api/events/notify - immediate SSE broadcast endpoint
  app.post('/api/events/notify', authenticateToken, (req: AuthRequest, res) => {
    const { collection, action, entityId } = req.body;
    const changedBy = req.user?.email || 'unknown';

    // Broadcast immediately to all SSE clients
    sseService.broadcastChange({
      collection,
      action,
      entityId,
      changedBy,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true });
  });

  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(process.cwd(), 'public', 'sw.js'));
  });

  if (config.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static files with correct MIME types
    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        const mimeType = mime.lookup(filePath);
        if (mimeType) {
          res.setHeader('Content-Type', mimeType);
        }
      }
    }));
    
    app.get("*", (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).send('Not Found');
        return;
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(config.PORT, "0.0.0.0", () => {
    logger.info(`Server successfully started on http://0.0.0.0:${config.PORT}`);
  });
}

startServer();
