import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { jobQueue } from '../queue/jobQueue.js';
import { WebhookPullRequestPayloadSchema } from '../../shared/schema.js';

export const webhookRouter = Router();

export function verifyGitHubSignature(rawBody: Buffer | string, signatureHeader?: string, secret?: string): boolean {
  if (!signatureHeader || !secret) {
    // If no secret configured in development, skip verification only if secret is empty
    return !secret;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  const sigBuffer = Buffer.from(signatureHeader, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

webhookRouter.post('/github', (req, res) => {
  const deliveryId = (req.headers['x-github-delivery'] as string) || `del-${Date.now()}`;
  const eventType = (req.headers['x-github-event'] as string) || 'unknown';
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  // Verify HMAC signature
  const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
  if (config.webhookSecret && !verifyGitHubSignature(rawBody, signature, config.webhookSecret)) {
    console.warn(`[Webhook] Invalid signature received for delivery ${deliveryId}`);
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  // Only handle pull_request events
  if (eventType !== 'pull_request') {
    return res.status(200).json({ ok: true, message: `Ignored event: ${eventType}` });
  }

  const action = req.body?.action;
  const supportedActions = ['opened', 'synchronize', 'reopened'];

  if (!supportedActions.includes(action)) {
    return res.status(200).json({ ok: true, message: `Ignored action: ${action}` });
  }

  try {
    const parsedPayload = WebhookPullRequestPayloadSchema.safeParse(req.body);
    if (!parsedPayload.success) {
      console.warn('[Webhook] Payload validation failed:', parsedPayload.error.flatten());
      return res.status(400).json({ error: 'Invalid payload structure', details: parsedPayload.error.flatten() });
    }

    const { pull_request, repository } = parsedPayload.data;

    // Record webhook event in DB
    db.saveWebhookEvent({
      id: `evt-${crypto.randomBytes(6).toString('hex')}`,
      deliveryId,
      eventType,
      action,
      repoFullName: repository.full_name,
      prNumber: pull_request.id,
      payloadJson: JSON.stringify(req.body),
      status: 'received'
    });

    // Enqueue review job
    const queueResult = jobQueue.enqueueReview({
      repoOwner: repository.owner.login,
      repoName: repository.name,
      prNumber: parsedPayload.data.number,
      prTitle: pull_request.title,
      prUrl: pull_request.html_url,
      author: pull_request.user.login,
      commitSha: pull_request.head.sha,
      baseSha: pull_request.base.sha,
      postToGitHub: true
    });

    return res.status(200).json({
      ok: true,
      message: queueResult.queued ? 'Review enqueued' : 'Duplicate delivery skipped',
      deliveryId,
      jobId: queueResult.jobId
    });
  } catch (err: any) {
    console.error('[Webhook] Processing error:', err);
    return res.status(500).json({ error: 'Internal webhook processing failure' });
  }
});
