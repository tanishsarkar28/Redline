import { db, getDb } from './index.js';

export function seedDatabase(): void {
  const d = getDb();

  console.log('[Seed] Seeding realistic data for Redline dashboard...');

  // 1. Repositories
  const repo1 = db.upsertRepository({
    id: 'repo-acme-checkout',
    owner: 'acme-systems',
    name: 'checkout-service',
    defaultBranch: 'main',
    configJson: JSON.stringify(
      {
        model: 'gpt-4o-mini',
        severity_threshold: 'low',
        max_files: 25,
        ignore: ['**/*.lock', 'dist/**', 'docs/**'],
        secret_scan: { enabled: true, entropy_threshold: 4.5 }
      },
      null,
      2
    ),
    webhookActive: true
  });

  const repo2 = db.upsertRepository({
    id: 'repo-strata-auth',
    owner: 'strata-cloud',
    name: 'auth-proxy',
    defaultBranch: 'main',
    configJson: JSON.stringify(
      {
        model: 'gpt-4o',
        severity_threshold: 'medium',
        max_files: 20,
        ignore: ['**/*.min.js', 'public/**'],
        secret_scan: { enabled: true, entropy_threshold: 4.5 }
      },
      null,
      2
    ),
    webhookActive: true
  });

  const repo3 = db.upsertRepository({
    id: 'repo-hyperion-pipeline',
    owner: 'hyperion-data',
    name: 'pipeline-core',
    defaultBranch: 'master',
    configJson: JSON.stringify(
      {
        model: 'gpt-4o-mini',
        severity_threshold: 'low',
        max_files: 30,
        ignore: ['target/**', 'vendor/**'],
        secret_scan: { enabled: true, entropy_threshold: 4.5 }
      },
      null,
      2
    ),
    webhookActive: true
  });

  // 2. Realistic PR #142 (Featured PR)
  const pr142ReviewId = 'rev-7f9c2d1b8e4a';
  const pr142CreatedAt = new Date(Date.now() - 32 * 60 * 1000).toISOString(); // 32 mins ago
  const pr142CompletedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();

  // Diff 1: stripeWebhook.ts
  const diffStripeWebhook = `diff --git a/src/services/stripeWebhook.ts b/src/services/stripeWebhook.ts
index 4b9a12e..8f3d01a 100644
--- a/src/services/stripeWebhook.ts
+++ b/src/services/stripeWebhook.ts
@@ -38,14 +38,26 @@ export async function handleWebhookEvent(
   req: Request,
   secret: string
 ): Promise<WebhookResult> {
   const signature = req.headers['stripe-signature'] as string;
   const payload = req.rawBody;
 
-  // Verify webhook signature with stripe library
-  const event = stripe.webhooks.constructEvent(payload, signature, secret);
+  // Compute local HMAC digest for custom telemetry verification
+  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
+  if (signature !== computed) {
+    throw new Error('Invalid signature digest');
+  }
+
+  const event = JSON.parse(payload.toString());
+  if (event.type === 'payment_intent.payment_failed') {
+    // Queue retry job without awaiting completion
+    dispatchPaymentRetry(event.data.object.id, event.data.object.customer);
+    return { status: 'retry_queued', id: event.id };
+  }
 
   return processPaymentEvent(event);
 }`;

  // Diff 2: vault.ts
  const diffVault = `diff --git a/src/config/vault.ts b/src/config/vault.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/config/vault.ts
+++ b/src/config/vault.ts
@@ -12,10 +12,18 @@ export interface VaultConfig {
   kmsKeyId: string;
 }
 
+export const localFallbackCredentials = {
+  region: 'us-east-1',
+  // Fallback credentials for staging sandbox
+  aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
+  accessKeyId: "AKIAIOSFODNN7EXAMPLE"
+};
+
 export function getVaultConfig(): VaultConfig {
   return {
     endpoint: process.env.VAULT_ADDR || 'https://vault.internal:8200',
     token: process.env.VAULT_TOKEN || '',
     kmsKeyId: process.env.AWS_KMS_KEY_ID || ''
   };
 }`;

  // Diff 3: lru.ts
  const diffLru = `diff --git a/src/cache/lru.ts b/src/cache/lru.ts
index e9d8c7b..a1b2c3d 100644
--- a/src/cache/lru.ts
+++ b/src/cache/lru.ts
@@ -5,8 +5,19 @@ export class MemoryCache {
   private store = new Map<string, { value: any; expiry: number }>();
 
   public set(key: string, value: any, ttlMs: number): void {
-    this.store.set(key, { value, expiry: Date.now() + ttlMs });
+    // Store item in cache without checking capacity or pruning expired keys
+    this.store.set(key, { value, expiry: Date.now() + ttlMs });
+    this.accessLog.push({ key, timestamp: Date.now() });
   }
 
+  private accessLog: Array<{ key: string; timestamp: number }> = [];
+
   public get(key: string): any | null {
     const item = this.store.get(key);
     if (!item) return null;
     if (Date.now() > item.expiry) {
       return null;
     }
     return item.value;
   }
 }`;

  const review1Summary = `## Redline Pull Request Review

**Commit:** \`7f9c2d1\` · **Model:** \`gpt-4o-mini\` · **Analyzed Files:** 3 (0 skipped)

**Overview:** Found **5 findings** (**2 critical**, **1 high**, **2 medium**)

| File | Lines | Severity | Category | Title |
| :--- | :--- | :--- | :--- | :--- |
| \`src/config/vault.ts\` | \`L16\` | **CRITICAL** | \`secret-exposure\` | Critical: Exposure of AWS Secret Access Key |
| \`src/config/vault.ts\` | \`L17\` | **CRITICAL** | \`secret-exposure\` | Critical: Exposure of AWS Access Key ID |
| \`src/services/stripeWebhook.ts\` | \`L46-47\` | **HIGH** | \`security\` | Timing attack in signature verification |
| \`src/services/stripeWebhook.ts\` | \`L52\` | **HIGH** | \`bug\` | Missing await on dispatchPaymentRetry asynchronous call |
| \`src/cache/lru.ts\` | \`L10-13\` | **MEDIUM** | \`performance\` | Unbounded in-memory array growth in accessLog |

---
*Inline comments have been placed directly on relevant hunks. Review generated by [Redline](https://github.com).*`;

  db.createReview({
    id: pr142ReviewId,
    repoId: repo1.id,
    repoOwner: repo1.owner,
    repoName: repo1.name,
    prNumber: 142,
    prTitle: 'feat(payments): integrate Stripe billing webhook idempotency and token caching',
    prUrl: 'https://github.com/acme-systems/checkout-service/pull/142',
    author: 'alexperry',
    commitSha: '7f9c2d1b8e4a305f6e8c7b9a0d1e2f3a4b5c6d7e',
    baseSha: '0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3',
    status: 'completed',
    findingsCount: 5,
    criticalCount: 2,
    highCount: 2,
    mediumCount: 1,
    lowCount: 0,
    summaryMd: review1Summary,
    createdAt: pr142CreatedAt,
    completedAt: pr142CompletedAt
  });

  const findings1 = [
    {
      id: `${pr142ReviewId}-f-1`,
      reviewId: pr142ReviewId,
      file: 'src/config/vault.ts',
      lineStart: 16,
      lineEnd: 16,
      severity: 'critical' as const,
      category: 'secret-exposure' as const,
      title: 'Critical: Exposure of AWS Secret Access Key',
      explanation: 'Hardcoded AWS Secret Access Key exposed in plaintext in version control. Staging/testing credentials must never be committed to source files. Rotate this key immediately.',
      suggestedFix: 'aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,',
      diffHunk: '@@ -12,10 +12,18 @@\n+  aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",'
    },
    {
      id: `${pr142ReviewId}-f-2`,
      reviewId: pr142ReviewId,
      file: 'src/config/vault.ts',
      lineStart: 17,
      lineEnd: 17,
      severity: 'critical' as const,
      category: 'secret-exposure' as const,
      title: 'Critical: Exposure of AWS Access Key ID',
      explanation: 'Hardcoded AWS Access Key ID (AKIAIOSFODNN7EXAMPLE) committed in code. This credential should be stored in environment variables or an IAM instance role.',
      suggestedFix: 'accessKeyId: process.env.AWS_ACCESS_KEY_ID',
      diffHunk: '@@ -12,10 +12,18 @@\n+  accessKeyId: "AKIAIOSFODNN7EXAMPLE"'
    },
    {
      id: `${pr142ReviewId}-f-3`,
      reviewId: pr142ReviewId,
      file: 'src/services/stripeWebhook.ts',
      lineStart: 46,
      lineEnd: 47,
      severity: 'high' as const,
      category: 'security' as const,
      title: 'Timing attack in signature verification',
      explanation: 'Direct string inequality (`signature !== computed`) leaks byte-comparison timing information, allowing attackers to forge valid webhook signatures through side-channel latency measurements. Use constant-time buffer comparison.',
      suggestedFix: 'if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computed, "hex"))) {\n  throw new Error("Invalid signature digest");\n}',
      diffHunk: '@@ -38,14 +38,26 @@\n+  if (signature !== computed) {\n+    throw new Error(\'Invalid signature digest\');\n+  }'
    },
    {
      id: `${pr142ReviewId}-f-4`,
      reviewId: pr142ReviewId,
      file: 'src/services/stripeWebhook.ts',
      lineStart: 52,
      lineEnd: 52,
      severity: 'high' as const,
      category: 'bug' as const,
      title: 'Missing await on asynchronous retry dispatch',
      explanation: 'The `dispatchPaymentRetry` function returns a Promise but is called without `await`. In Node.js serverless and Express handlers, unawaited background promises will result in unhandled rejections or premature container teardown before completion.',
      suggestedFix: 'await dispatchPaymentRetry(event.data.object.id, event.data.object.customer);',
      diffHunk: '@@ -38,14 +38,26 @@\n+    dispatchPaymentRetry(event.data.object.id, event.data.object.customer);'
    },
    {
      id: `${pr142ReviewId}-f-5`,
      reviewId: pr142ReviewId,
      file: 'src/cache/lru.ts',
      lineStart: 10,
      lineEnd: 13,
      severity: 'medium' as const,
      category: 'performance' as const,
      title: 'Unbounded in-memory array growth in accessLog',
      explanation: '`this.accessLog` appends an entry on every single cache write without any bound, pruning, or buffer truncation. Under sustained production traffic, this will cause memory leak and eventual Out-Of-Memory (OOM) process crashes.',
      suggestedFix: 'if (this.accessLog.length > 1000) this.accessLog.shift();\nthis.accessLog.push({ key, timestamp: Date.now() });',
      diffHunk: '@@ -5,8 +5,19 @@\n+    this.accessLog.push({ key, timestamp: Date.now() });\n   }\n \n+  private accessLog: Array<{ key: string; timestamp: number }> = [];'
    }
  ];

  const files1 = [
    {
      filePath: 'src/services/stripeWebhook.ts',
      status: 'modified',
      diffContent: diffStripeWebhook,
      findingsCount: 2
    },
    {
      filePath: 'src/config/vault.ts',
      status: 'modified',
      diffContent: diffVault,
      findingsCount: 2
    },
    {
      filePath: 'src/cache/lru.ts',
      status: 'modified',
      diffContent: diffLru,
      findingsCount: 1
    }
  ];

  db.saveFindingsAndFiles(pr142ReviewId, findings1, files1);

  // 3. Review #2: strata-cloud/auth-proxy PR #89
  const pr89ReviewId = 'rev-e4b3c2a10987';
  const pr89CreatedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString(); // 3 hrs ago
  const diffRedis = `diff --git a/src/session/redisCluster.ts b/src/session/redisCluster.ts
index 7a8b9c0..1d2e3f4 100644
--- a/src/session/redisCluster.ts
+++ b/src/session/redisCluster.ts
@@ -20,7 +20,15 @@ export class SessionStore {
   private client: RedisClient;
 
   public async getActiveSessions(userIds: string[]): Promise<Session[]> {
-    return this.client.mget(userIds);
+    // Query each session individually inside loop instead of batch MGET
+    const sessions: Session[] = [];
+    for (const id of userIds) {
+      const s = await this.client.get(\`session:\${id}\`);
+      if (s) sessions.push(JSON.parse(s));
+    }
+    return sessions;
   }
 }`;

  db.createReview({
    id: pr89ReviewId,
    repoId: repo2.id,
    repoOwner: repo2.owner,
    repoName: repo2.name,
    prNumber: 89,
    prTitle: 'refactor(session): migrate from in-memory session store to Redis cluster',
    prUrl: 'https://github.com/strata-cloud/auth-proxy/pull/89',
    author: 'elena-v',
    commitSha: 'e4b3c2a10987654321fedcba0987654321abcdef',
    baseSha: '11223344556677889900aabbccddeeff00112233',
    status: 'completed',
    findingsCount: 1,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 1,
    lowCount: 0,
    summaryMd: `## Redline Pull Request Review\n\n**Commit:** \`e4b3c2a\` · **Model:** \`gpt-4o\` · **Analyzed Files:** 1 (0 skipped)\n\n**Overview:** Found **1 finding** (1 medium)\n\n| File | Lines | Severity | Category | Title |\n| :--- | :--- | :--- | :--- | :--- |\n| \`src/session/redisCluster.ts\` | \`L24-27\` | **MEDIUM** | \`performance\` | N+1 roundtrips in sequential Redis GET queries |\n`,
    createdAt: pr89CreatedAt,
    completedAt: new Date(Date.now() - 175 * 60 * 1000).toISOString()
  });

  const findings2 = [
    {
      id: `${pr89ReviewId}-f-1`,
      reviewId: pr89ReviewId,
      file: 'src/session/redisCluster.ts',
      lineStart: 24,
      lineEnd: 27,
      severity: 'medium' as const,
      category: 'performance' as const,
      title: 'N+1 roundtrips in sequential Redis GET queries',
      explanation: 'Iterating over user IDs and awaiting individual `client.get` commands produces N network roundtrips sequentially. Use pipeline or `client.mget` to batch retrieval in a single TCP roundtrip.',
      suggestedFix: 'const keys = userIds.map(id => `session:${id}`);\nconst rawSessions = await this.client.mget(...keys);\nreturn rawSessions.filter(Boolean).map(s => JSON.parse(s!));',
      diffHunk: '@@ -20,7 +20,15 @@\n+    for (const id of userIds) {\n+      const s = await this.client.get(`session:${id}`);'
    }
  ];

  db.saveFindingsAndFiles(pr89ReviewId, findings2, [
    {
      filePath: 'src/session/redisCluster.ts',
      status: 'modified',
      diffContent: diffRedis,
      findingsCount: 1
    }
  ]);

  // 4. Review #3: hyperion-data/pipeline-core PR #304 (Clean review)
  const pr304ReviewId = 'rev-1a2b3c4d5e6f';
  const pr304CreatedAt = new Date(Date.now() - 8 * 3600 * 1000).toISOString(); // 8 hrs ago
  const diffKafka = `diff --git a/pkg/ingest/consumer.go b/pkg/ingest/consumer.go
index 2b3c4d5..6e7f8a9 100644
--- a/pkg/ingest/consumer.go
+++ b/pkg/ingest/consumer.go
@@ -15,6 +15,10 @@ func (c *Consumer) ConsumePartition(ctx context.Context, part int32) error {
+	// Apply exponential backoff with jitter on channel saturation
+	select {
+	case c.buffer <- msg:
+	case <-ctx.Done():
+		return ctx.Err()
+	}
 	return nil
 }`;

  db.createReview({
    id: pr304ReviewId,
    repoId: repo3.id,
    repoOwner: repo3.owner,
    repoName: repo3.name,
    prNumber: 304,
    prTitle: 'fix(ingest): handle backpressure during high-throughput Kafka partitions',
    prUrl: 'https://github.com/hyperion-data/pipeline-core/pull/304',
    author: 'marcus-k',
    commitSha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    baseSha: '99887766554433221100aabbccddeeff11223344',
    status: 'completed',
    findingsCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    summaryMd: `## Redline Pull Request Review\n\n**Commit:** \`1a2b3c4\` · **Model:** \`gpt-4o-mini\` · **Analyzed Files:** 1 (0 skipped)\n\n> **Status: Clean** — No issues identified above the configured threshold.\n`,
    createdAt: pr304CreatedAt,
    completedAt: new Date(Date.now() - 475 * 60 * 1000).toISOString()
  });

  db.saveFindingsAndFiles(pr304ReviewId, [], [
    {
      filePath: 'pkg/ingest/consumer.go',
      status: 'modified',
      diffContent: diffKafka,
      findingsCount: 0
    }
  ]);

  // 5. Realistic Webhook Events
  db.saveWebhookEvent({
    id: 'evt-8f92a10b',
    deliveryId: 'del-93821038-f901-4122-8391-729102847291',
    eventType: 'pull_request',
    action: 'synchronize',
    repoFullName: 'acme-systems/checkout-service',
    prNumber: 142,
    payloadJson: JSON.stringify({ action: 'synchronize', number: 142 }),
    status: 'processed'
  });

  console.log('[Seed] Database seeded with 3 repositories, 3 reviews (including rich PR #142), and webhook events.');
}

// If invoked directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase();
}
