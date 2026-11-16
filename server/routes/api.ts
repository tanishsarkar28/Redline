import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { ReviewEngine } from '../pipeline/reviewEngine.js';
import { RedlineConfigSchema } from '../../shared/schema.js';

export const apiRouter = Router();

// GET /api/status
apiRouter.get('/status', (req, res) => {
  const latestWebhook = db.getLatestWebhookEvent();
  res.json({
    ok: true,
    version: '1.0.0',
    model: config.openaiModel,
    githubConfigured: Boolean(config.githubToken),
    openaiConfigured: Boolean(config.openaiApiKey && config.openaiApiKey !== 'sk-your_openai_api_key_here'),
    webhookConfigured: Boolean(config.webhookSecret),
    latestWebhookReceivedAt: latestWebhook ? latestWebhook.receivedAt : null,
    latestWebhookDeliveryId: latestWebhook ? latestWebhook.deliveryId : null
  });
});

// GET /api/reviews
apiRouter.get('/reviews', (req, res) => {
  const limit = parseInt(req.query.limit as string || '50', 10);
  const offset = parseInt(req.query.offset as string || '0', 10);
  const repoFilter = req.query.repo as string | undefined;

  const reviews = db.listReviews(limit, offset, repoFilter);
  res.json({ reviews });
});

// GET /api/reviews/:id
apiRouter.get('/reviews/:id', (req, res) => {
  const review = db.getReviewById(req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Review not found' });
  }
  res.json({ review });
});

// GET /api/repos
apiRouter.get('/repos', (req, res) => {
  const repos = db.listRepositories();
  res.json({ repos });
});

// POST /api/repos/:owner/:name/config
apiRouter.post('/repos/:owner/:name/config', (req, res) => {
  const { owner, name } = req.params;
  const parseResult = RedlineConfigSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid config structure', details: parseResult.error.flatten() });
  }

  db.updateRepositoryConfig(owner, name, JSON.stringify(parseResult.data, null, 2));
  res.json({ ok: true, config: parseResult.data });
});

// GET /api/settings
apiRouter.get('/settings', (req, res) => {
  res.json({
    settings: {
      model: config.openaiModel,
      defaultSeverityThreshold: config.defaultSeverityThreshold,
      defaultMaxFiles: config.defaultMaxFiles,
      databasePath: config.databasePath,
      webhookSecretConfigured: Boolean(config.webhookSecret),
      githubTokenConfigured: Boolean(config.githubToken),
      openaiApiKeyConfigured: Boolean(config.openaiApiKey && config.openaiApiKey !== 'sk-your_openai_api_key_here')
    }
  });
});

// POST /api/settings
apiRouter.post('/settings', (req, res) => {
  const { model, defaultSeverityThreshold, defaultMaxFiles } = req.body;
  if (model) config.openaiModel = model;
  if (defaultSeverityThreshold) config.defaultSeverityThreshold = defaultSeverityThreshold;
  if (defaultMaxFiles) config.defaultMaxFiles = parseInt(defaultMaxFiles, 10);

  res.json({ ok: true, settings: {
    model: config.openaiModel,
    defaultSeverityThreshold: config.defaultSeverityThreshold,
    defaultMaxFiles: config.defaultMaxFiles
  }});
});

// POST /api/simulate
apiRouter.post('/simulate', async (req, res) => {
  const {
    repoOwner = 'acme-corp',
    repoName = 'redline-demo',
    prNumber = Math.floor(Math.random() * 900) + 100,
    prTitle = 'feat(auth): add JWT bearer tokens and database caching',
    author = 'developer',
    diffText
  } = req.body;

  const mockKey = ['sk', 'live', '938f01a7bb492cda9e01f'].join('_');
  const sampleDiff = diffText || `diff --git a/src/auth/token.ts b/src/auth/token.ts
new file mode 100644
index 0000000..8a4e321
--- /dev/null
+++ b/src/auth/token.ts
@@ -0,0 +1,24 @@
+import jwt from 'jsonwebtoken';
+import crypto from 'crypto';
+
+// Production master secret fallback
+const BACKUP_JWT_SECRET = "${mockKey}";
+
+export function signUserToken(userId: string) {
+  // Hardcoded AWS credentials for development environment
+  const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
+  return jwt.sign({ sub: userId }, BACKUP_JWT_SECRET, { expiresIn: '1h' });
+}
+
+export async function verifySignature(expected: string, given: string) {
+  // Insecure comparison vulnerable to timing attack
+  if (expected === given) {
+    return true;
+  }
+  return false;
+}
+
+export async function logAccess(userId: string) {
+  // Missing await
+  saveAuditLog(userId);
+}
`;

  try {
    const engine = new ReviewEngine();
    const review = await engine.executeReview({
      repoOwner,
      repoName,
      prNumber,
      prTitle,
      prUrl: `https://github.com/${repoOwner}/${repoName}/pull/${prNumber}`,
      author,
      commitSha: 'a8b1c4d9e0f21a437b6c5d8e1f0a2b3c4d5e6f7a',
      baseSha: '0123456789abcdef0123456789abcdef01234567',
      diffText: sampleDiff,
      postToGitHub: false
    });

    res.json({ ok: true, review });
  } catch (err: any) {
    console.error('[API] Simulation review error:', err);
    res.status(500).json({ error: 'Simulation review failed', message: err.message });
  }
});
