import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import type { Review, Finding, ReviewFile, Repository, WebhookEventRecord } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    const dbDir = path.dirname(config.databasePath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    dbInstance = new Database(config.databasePath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');

    // Run schema
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
      dbInstance.exec(schemaSql);
    }
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// Database helper functions
export const db = {
  // Repositories
  upsertRepository(repo: {
    id: string;
    owner: string;
    name: string;
    defaultBranch?: string;
    configJson?: string;
    webhookActive?: boolean;
  }): Repository {
    const d = getDb();
    const stmt = d.prepare(`
      INSERT INTO repositories (id, owner, name, default_branch, config_json, webhook_active, updated_at)
      VALUES (@id, @owner, @name, @defaultBranch, @configJson, @webhookActive, CURRENT_TIMESTAMP)
      ON CONFLICT(owner, name) DO UPDATE SET
        default_branch = COALESCE(excluded.default_branch, repositories.default_branch),
        config_json = COALESCE(excluded.config_json, repositories.config_json),
        webhook_active = COALESCE(excluded.webhook_active, repositories.webhook_active),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `);

    const row = stmt.get({
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
      defaultBranch: repo.defaultBranch || 'main',
      configJson: repo.configJson || null,
      webhookActive: repo.webhookActive !== undefined ? (repo.webhookActive ? 1 : 0) : 1
    }) as any;

    return {
      id: row.id,
      owner: row.owner,
      name: row.name,
      defaultBranch: row.default_branch,
      configJson: row.config_json,
      lastReviewAt: row.last_review_at,
      webhookActive: Boolean(row.webhook_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  listRepositories(): Repository[] {
    const d = getDb();
    const rows = d.prepare(`
      SELECT * FROM repositories ORDER BY updated_at DESC
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      owner: r.owner,
      name: r.name,
      defaultBranch: r.default_branch,
      configJson: r.config_json,
      lastReviewAt: r.last_review_at,
      webhookActive: Boolean(r.webhook_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  },

  getRepository(owner: string, name: string): Repository | null {
    const d = getDb();
    const row = d.prepare(`
      SELECT * FROM repositories WHERE owner = ? AND name = ?
    `).get(owner, name) as any;

    if (!row) return null;
    return {
      id: row.id,
      owner: row.owner,
      name: row.name,
      defaultBranch: row.default_branch,
      configJson: row.config_json,
      lastReviewAt: row.last_review_at,
      webhookActive: Boolean(row.webhook_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  updateRepositoryConfig(owner: string, name: string, configJson: string): void {
    const d = getDb();
    d.prepare(`
      UPDATE repositories SET config_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE owner = ? AND name = ?
    `).run(configJson, owner, name);
  },

  // Reviews
  createReview(review: Omit<Review, 'createdAt'> & { createdAt?: string }): Review {
    const d = getDb();
    const stmt = d.prepare(`
      INSERT INTO reviews (
        id, repo_id, repo_owner, repo_name, pr_number, pr_title, pr_url, author,
        commit_sha, base_sha, status, findings_count, critical_count, high_count,
        medium_count, low_count, summary_md, error_message, created_at, completed_at
      ) VALUES (
        @id, @repoId, @repoOwner, @repoName, @prNumber, @prTitle, @prUrl, @author,
        @commitSha, @baseSha, @status, @findingsCount, @criticalCount, @highCount,
        @mediumCount, @lowCount, @summaryMd, @errorMessage, COALESCE(@createdAt, CURRENT_TIMESTAMP), @completedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        findings_count = excluded.findings_count,
        critical_count = excluded.critical_count,
        high_count = excluded.high_count,
        medium_count = excluded.medium_count,
        low_count = excluded.low_count,
        summary_md = excluded.summary_md,
        error_message = excluded.error_message,
        completed_at = excluded.completed_at
      RETURNING *
    `);

    const row = stmt.get({
      id: review.id,
      repoId: review.repoId,
      repoOwner: review.repoOwner,
      repoName: review.repoName,
      prNumber: review.prNumber,
      prTitle: review.prTitle,
      prUrl: review.prUrl,
      author: review.author,
      commitSha: review.commitSha,
      baseSha: review.baseSha,
      status: review.status,
      findingsCount: review.findingsCount || 0,
      criticalCount: review.criticalCount || 0,
      highCount: review.highCount || 0,
      mediumCount: review.mediumCount || 0,
      lowCount: review.lowCount || 0,
      summaryMd: review.summaryMd || '',
      errorMessage: review.errorMessage || null,
      createdAt: review.createdAt || null,
      completedAt: review.completedAt || null
    }) as any;

    return {
      id: row.id,
      repoId: row.repo_id,
      repoOwner: row.repo_owner,
      repoName: row.repo_name,
      prNumber: row.pr_number,
      prTitle: row.pr_title,
      prUrl: row.pr_url,
      author: row.author,
      commitSha: row.commit_sha,
      baseSha: row.base_sha,
      status: row.status,
      findingsCount: row.findings_count,
      criticalCount: row.critical_count,
      highCount: row.high_count,
      mediumCount: row.medium_count,
      lowCount: row.low_count,
      summaryMd: row.summary_md,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at
    };
  },

  updateReview(id: string, updates: Partial<Review>): void {
    const d = getDb();
    const fields: string[] = [];
    const values: any = { id };

    if (updates.status !== undefined) {
      fields.push('status = @status');
      values.status = updates.status;
    }
    if (updates.findingsCount !== undefined) {
      fields.push('findings_count = @findingsCount');
      values.findingsCount = updates.findingsCount;
    }
    if (updates.criticalCount !== undefined) {
      fields.push('critical_count = @criticalCount');
      values.criticalCount = updates.criticalCount;
    }
    if (updates.highCount !== undefined) {
      fields.push('high_count = @highCount');
      values.highCount = updates.highCount;
    }
    if (updates.mediumCount !== undefined) {
      fields.push('medium_count = @mediumCount');
      values.mediumCount = updates.mediumCount;
    }
    if (updates.lowCount !== undefined) {
      fields.push('low_count = @lowCount');
      values.lowCount = updates.lowCount;
    }
    if (updates.summaryMd !== undefined) {
      fields.push('summary_md = @summaryMd');
      values.summaryMd = updates.summaryMd;
    }
    if (updates.errorMessage !== undefined) {
      fields.push('error_message = @errorMessage');
      values.errorMessage = updates.errorMessage;
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = @completedAt');
      values.completedAt = updates.completedAt;
    }

    if (fields.length > 0) {
      d.prepare(`UPDATE reviews SET ${fields.join(', ')} WHERE id = @id`).run(values);
    }
  },

  listReviews(limit = 100, offset = 0, repoFilter?: string): Review[] {
    const d = getDb();
    let query = `
      SELECT * FROM reviews
    `;
    const params: any[] = [];
    if (repoFilter) {
      query += ` WHERE repo_owner || '/' || repo_name = ? `;
      params.push(repoFilter);
    }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ? `;
    params.push(limit, offset);

    const rows = d.prepare(query).all(...params) as any[];

    return rows.map(r => ({
      id: r.id,
      repoId: r.repo_id,
      repoOwner: r.repo_owner,
      repoName: r.repo_name,
      prNumber: r.pr_number,
      prTitle: r.pr_title,
      prUrl: r.pr_url,
      author: r.author,
      commitSha: r.commit_sha,
      baseSha: r.base_sha,
      status: r.status,
      findingsCount: r.findings_count,
      criticalCount: r.critical_count,
      highCount: r.high_count,
      mediumCount: r.medium_count,
      lowCount: r.low_count,
      summaryMd: r.summary_md,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      completedAt: r.completed_at
    }));
  },

  getReviewById(id: string): Review | null {
    const d = getDb();
    const row = d.prepare(`SELECT * FROM reviews WHERE id = ?`).get(id) as any;
    if (!row) return null;

    const findings = d.prepare(`
      SELECT * FROM findings WHERE review_id = ? ORDER BY file_path ASC, line_start ASC
    `).all(id) as any[];

    const files = d.prepare(`
      SELECT * FROM review_files WHERE review_id = ? ORDER BY file_path ASC
    `).all(id) as any[];

    return {
      id: row.id,
      repoId: row.repo_id,
      repoOwner: row.repo_owner,
      repoName: row.repo_name,
      prNumber: row.pr_number,
      prTitle: row.pr_title,
      prUrl: row.pr_url,
      author: row.author,
      commitSha: row.commit_sha,
      baseSha: row.base_sha,
      status: row.status,
      findingsCount: row.findings_count,
      criticalCount: row.critical_count,
      highCount: row.high_count,
      mediumCount: row.medium_count,
      lowCount: row.low_count,
      summaryMd: row.summary_md,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      findings: findings.map(f => ({
        id: f.id,
        reviewId: f.review_id,
        file: f.file_path,
        lineStart: f.line_start,
        lineEnd: f.line_end,
        severity: f.severity,
        category: f.category,
        title: f.title,
        explanation: f.explanation,
        suggestedFix: f.suggested_fix,
        diffHunk: f.diff_hunk,
        githubCommentId: f.github_comment_id,
        createdAt: f.created_at
      })),
      files: files.map(fl => ({
        id: fl.id,
        reviewId: fl.review_id,
        filePath: fl.file_path,
        status: fl.status,
        diffContent: fl.diff_content,
        findingsCount: fl.findings_count
      }))
    };
  },

  saveFindingsAndFiles(
    reviewId: string,
    findings: Finding[],
    files: Array<{ filePath: string; status: string; diffContent: string; findingsCount: number }>
  ): void {
    const d = getDb();
    const deleteFindings = d.prepare(`DELETE FROM findings WHERE review_id = ?`);
    const deleteFiles = d.prepare(`DELETE FROM review_files WHERE review_id = ?`);

    const insertFinding = d.prepare(`
      INSERT INTO findings (
        id, review_id, file_path, line_start, line_end, severity, category,
        title, explanation, suggested_fix, diff_hunk, github_comment_id
      ) VALUES (
        @id, @reviewId, @file, @lineStart, @lineEnd, @severity, @category,
        @title, @explanation, @suggestedFix, @diffHunk, @githubCommentId
      )
    `);

    const insertFile = d.prepare(`
      INSERT INTO review_files (id, review_id, file_path, status, diff_content, findings_count)
      VALUES (@id, @reviewId, @filePath, @status, @diffContent, @findingsCount)
    `);

    const transaction = d.transaction(() => {
      deleteFindings.run(reviewId);
      deleteFiles.run(reviewId);

      for (const fl of files) {
        insertFile.run({
          id: `${reviewId}-${fl.filePath}`,
          reviewId,
          filePath: fl.filePath,
          status: fl.status,
          diffContent: fl.diffContent,
          findingsCount: fl.findingsCount
        });
      }

      for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        insertFinding.run({
          id: f.id || `${reviewId}-f-${i + 1}`,
          reviewId,
          file: f.file,
          lineStart: f.lineStart,
          lineEnd: f.lineEnd,
          severity: f.severity,
          category: f.category,
          title: f.title,
          explanation: f.explanation,
          suggestedFix: f.suggestedFix || null,
          diffHunk: f.diffHunk || null,
          githubCommentId: f.githubCommentId || null
        });
      }
    });

    transaction();
  },

  // Webhook events
  saveWebhookEvent(event: {
    id: string;
    deliveryId: string;
    eventType: string;
    action?: string;
    repoFullName: string;
    prNumber?: number;
    payloadJson: string;
    status: 'received' | 'processing' | 'processed' | 'failed';
    errorMessage?: string;
  }): void {
    const d = getDb();
    d.prepare(`
      INSERT INTO webhook_events (id, delivery_id, event_type, action, repo_full_name, pr_number, payload_json, status, error_message)
      VALUES (@id, @deliveryId, @eventType, @action, @repoFullName, @prNumber, @payloadJson, @status, @errorMessage)
      ON CONFLICT(delivery_id) DO UPDATE SET
        status = excluded.status,
        error_message = excluded.error_message
    `).run({
      id: event.id,
      deliveryId: event.deliveryId,
      eventType: event.eventType,
      action: event.action || null,
      repoFullName: event.repoFullName,
      prNumber: event.prNumber || null,
      payloadJson: event.payloadJson,
      status: event.status,
      errorMessage: event.errorMessage || null
    });
  },

  getLatestWebhookEvent(): WebhookEventRecord | null {
    const d = getDb();
    const row = d.prepare(`
      SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT 1
    `).get() as any;

    if (!row) return null;
    return {
      id: row.id,
      deliveryId: row.delivery_id,
      eventType: row.event_type,
      action: row.action,
      repoFullName: row.repo_full_name,
      prNumber: row.pr_number,
      status: row.status,
      errorMessage: row.error_message,
      receivedAt: row.received_at
    };
  },

  // Job queue records
  enqueueJob(job: { id: string; idempotencyKey: string; type: string; payloadJson: string }): boolean {
    const d = getDb();
    try {
      d.prepare(`
        INSERT INTO jobs (id, idempotency_key, type, payload_json, status, attempts)
        VALUES (@id, @idempotencyKey, @type, @payloadJson, 'pending', 0)
      `).run(job);
      return true;
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return false; // Already queued or processed
      }
      throw err;
    }
  },

  acquireNextJob(): { id: string; type: string; payloadJson: string } | null {
    const d = getDb();
    const job = d.prepare(`
      SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1
    `).get() as any;

    if (!job) return null;

    d.prepare(`
      UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(job.id);

    return {
      id: job.id,
      type: job.type,
      payloadJson: job.payload_json
    };
  },

  markJobCompleted(id: string): void {
    const d = getDb();
    d.prepare(`
      UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);
  },

  markJobFailed(id: string, errorMessage: string): void {
    const d = getDb();
    d.prepare(`
      UPDATE jobs SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(errorMessage, id);
  }
};
