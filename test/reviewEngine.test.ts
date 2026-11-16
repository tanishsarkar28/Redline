import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewEngine } from '../server/pipeline/reviewEngine.js';
import { db } from '../server/db/index.js';

describe('ReviewEngine Integration Pipeline', () => {
  beforeEach(() => {
    // DB is auto-initialized
  });

  it('executes review pipeline against a test diff, persists findings and marks completed', async () => {
    const engine = new ReviewEngine();

    const mockStripeKey = ['sk', 'live', '948201847192837482910283'].join('_');
    const testDiff = `diff --git a/src/payments/stripe.ts b/src/payments/stripe.ts
new file mode 100644
index 0000000..abcdef1
--- /dev/null
+++ b/src/payments/stripe.ts
@@ -0,0 +1,15 @@
+import Stripe from 'stripe';
+
+// Test staging credentials
+const STRIPE_SECRET = "${mockStripeKey}";
+const AWS_BACKUP_KEY = "AKIAIOSFODNN7EXAMPLE";
+
+export async function chargeCustomer(amount: number) {
+  // Missing await
+  stripeCharge(amount);
+}
+`;

    const review = await engine.executeReview({
      repoOwner: 'test-org',
      repoName: 'test-repo',
      prNumber: 99,
      prTitle: 'test: add stripe integration',
      prUrl: 'https://github.com/test-org/test-repo/pull/99',
      author: 'tester',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
      baseSha: '0123456789abcdef0123456789abcdef01234567',
      diffText: testDiff,
      postToGitHub: false
    });

    expect(review.id).toBeDefined();
    expect(review.status).toBe('completed');
    expect(review.findingsCount).toBeGreaterThanOrEqual(2); // At least the 2 deterministic secrets

    // Verify retrieval from SQLite database
    const saved = db.getReviewById(review.id);
    expect(saved).not.toBeNull();
    expect(saved?.repoOwner).toBe('test-org');
    expect(saved?.prNumber).toBe(99);
    expect(saved?.files?.length).toBe(1);
    expect(saved?.findings?.length).toBeGreaterThanOrEqual(2);

    const secretFindings = saved?.findings?.filter(f => f.category === 'secret-exposure');
    expect(secretFindings?.length).toBeGreaterThanOrEqual(2);
  });
});
