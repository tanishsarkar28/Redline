import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { webhookRouter } from './routes/webhooks.js';
import { apiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): express.Application {
  const app = express();

  app.use(cors());

  // Capture raw body for GitHub webhook HMAC verification
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      }
    })
  );

  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use('/api/webhooks', webhookRouter);
  app.use('/api', apiRouter);

  // Serve static assets from web/dist if built
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  const webDistAlt = path.resolve(__dirname, '../web/dist');
  const distDir = fs.existsSync(webDistPath) ? webDistPath : (fs.existsSync(webDistAlt) ? webDistAlt : null);

  if (distDir) {
    app.use(express.static(distDir));
    // SPA fallback in Express 5
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distDir, 'index.html'));
      }
      next();
    });
  } else {
    // Development fallback when web is running in Vite dev server
    app.get('/', (_req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Redline Review Server</title></head>
          <body style="font-family: monospace; padding: 2rem; background: #f4f1ea; color: #161514;">
            <h2>Redline Review Server Active</h2>
            <p>Webhook endpoint: <code>/api/webhooks/github</code></p>
            <p>API endpoint: <code>/api/reviews</code></p>
            <p>Web dashboard Vite dev server runs at <a href="http://localhost:5173">http://localhost:5173</a> or run <code>npm run build:web</code>.</p>
          </body>
        </html>
      `);
    });
  }

  return app;
}
