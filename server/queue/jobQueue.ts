import crypto from 'crypto';
import { db } from '../db/index.js';
import { ReviewEngine } from '../pipeline/reviewEngine.js';
import type { ExecuteReviewParams } from '../pipeline/reviewEngine.js';

export interface QueueJob {
  id: string;
  idempotencyKey: string;
  type: 'review_pr';
  payload: ExecuteReviewParams;
}

export class JobQueue {
  private isProcessing = false;
  private intervalHandle: NodeJS.Timeout | null = null;
  private reviewEngine: ReviewEngine;

  constructor() {
    this.reviewEngine = new ReviewEngine();
  }

  public start(pollIntervalMs = 1000): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      this.processNextJob().catch(err => {
        console.error('[JobQueue] Error during job processing:', err);
      });
    }, pollIntervalMs);
  }

  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  public enqueueReview(params: ExecuteReviewParams): { queued: boolean; jobId: string } {
    // Idempotency key based on repo + pr + commitSha to prevent duplicate runs for identical commit
    const idempotencyKey = `pr-${params.repoOwner}/${params.repoName}-${params.prNumber}-${params.commitSha}`;
    const jobId = `job-${crypto.randomBytes(8).toString('hex')}`;

    const inserted = db.enqueueJob({
      id: jobId,
      idempotencyKey,
      type: 'review_pr',
      payloadJson: JSON.stringify(params)
    });

    if (!inserted) {
      console.log(`[JobQueue] Duplicate job skipped for idempotency key: ${idempotencyKey}`);
      return { queued: false, jobId: 'already_queued_or_processed' };
    }

    console.log(`[JobQueue] Enqueued review job ${jobId} for ${params.repoOwner}/${params.repoName}#${params.prNumber}`);

    // Trigger immediate loop processing
    setImmediate(() => {
      this.processNextJob().catch(err => console.error('[JobQueue] Immediate process error:', err));
    });

    return { queued: true, jobId };
  }

  private async processNextJob(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const nextJob = db.acquireNextJob();
      if (!nextJob) {
        this.isProcessing = false;
        return;
      }

      console.log(`[JobQueue] Starting job ${nextJob.id} (${nextJob.type})`);
      const payload = JSON.parse(nextJob.payloadJson) as ExecuteReviewParams;

      try {
        await this.reviewEngine.executeReview(payload);
        db.markJobCompleted(nextJob.id);
        console.log(`[JobQueue] Job ${nextJob.id} completed successfully`);
      } catch (err: any) {
        console.error(`[JobQueue] Job ${nextJob.id} failed:`, err.message);
        db.markJobFailed(nextJob.id, err.message || 'Unknown error');
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const jobQueue = new JobQueue();
