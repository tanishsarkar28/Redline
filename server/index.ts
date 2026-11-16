import { createApp } from './app.js';
import { config } from './config.js';
import { jobQueue } from './queue/jobQueue.js';
import { getDb } from './db/index.js';

// Initialize SQLite database
getDb();

// Start background job queue processing
jobQueue.start(1000);

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`[Redline] Server running on http://${config.host}:${config.port}`);
  console.log(`[Redline] Webhook listening at http://${config.host}:${config.port}/api/webhooks/github`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[Redline] Received ${signal}. Shutting down gracefully...`);
  jobQueue.stop();
  server.close(() => {
    console.log('[Redline] Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
