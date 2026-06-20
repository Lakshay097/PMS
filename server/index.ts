import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config, validateEnv } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';
import apiRoutes from './routes';
import { logger } from './utils/logger';
import { sseService } from './services/sseService';

validateEnv();

async function startServer() {
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
    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
        else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        else if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
        else if (filePath.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
        else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
        else if (filePath.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');
        else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) res.setHeader('Content-Type', 'font/woff2');
      }
    }));
    app.get("*", (req, res) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/assets/') || req.path.includes('.')) {
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
