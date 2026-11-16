import crypto from 'crypto';
import { parseUnifiedDiff, filterAndCapDiffFiles } from './chunker.js';
import { scanAndRedactSecrets } from './secretScanner.js';
import { LLMReviewer, deduplicateFindings } from './llmReviewer.js';
import {
  mapFindingsToGitHubComments,
  buildReviewSummaryMarkdown,
  meetsSeverityThreshold
} from './commentMapper.js';
import { GitHubClient } from './githubClient.js';
import { db } from '../db/index.js';
import { config } from '../config.js';
import type { Review, Finding, RedlineConfig, Severity } from '../../shared/types.js';

export interface ExecuteReviewParams {
  repoOwner: string;
  repoName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  author: string;
  commitSha: string;
  baseSha: string;
  diffText?: string;
  postToGitHub?: boolean;
  githubToken?: string;
  openaiApiKey?: string;
}

export class ReviewEngine {
  private githubClient: GitHubClient;
  private llmReviewer: LLMReviewer;

  constructor(options: { githubToken?: string; openaiApiKey?: string } = {}) {
    this.githubClient = new GitHubClient({ token: options.githubToken || config.githubToken });
    this.llmReviewer = new LLMReviewer({
      apiKey: options.openaiApiKey || config.openaiApiKey,
      model: config.openaiModel
    });
  }

  public async executeReview(params: ExecuteReviewParams): Promise<Review> {
    const {
      repoOwner,
      repoName,
      prNumber,
      prTitle,
      prUrl,
      author,
      commitSha,
      baseSha,
      postToGitHub = true
    } = params;

    const reviewId = `rev-${crypto.randomBytes(8).toString('hex')}`;
    const repoFullName = `${repoOwner}/${repoName}`;
    const repoId = `repo-${crypto.createHash('md5').update(repoFullName).digest('hex').slice(0, 12)}`;

    // Ensure repository exists in DB
    db.upsertRepository({
      id: repoId,
      owner: repoOwner,
      name: repoName
    });

    // Create initial pending review record
    const initialReview = db.createReview({
      id: reviewId,
      repoId,
      repoOwner,
      repoName,
      prNumber,
      prTitle,
      prUrl,
      author,
      commitSha,
      baseSha,
      status: 'running',
      findingsCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      summaryMd: 'Review running...',
      createdAt: new Date().toISOString()
    });

    try {
      // 1. Fetch repo config
      const fetchedConfig = await this.githubClient.fetchRepoConfig(repoOwner, repoName, commitSha);
      const activeConfig: RedlineConfig = fetchedConfig || {
        model: config.openaiModel,
        severityThreshold: config.defaultSeverityThreshold,
        maxFiles: config.defaultMaxFiles,
        ignore: [
          '**/*.lock',
          'package-lock.json',
          'yarn.lock',
          'pnpm-lock.yaml',
          'Cargo.lock',
          'dist/**',
          'build/**',
          'node_modules/**',
          '**/*.min.js',
          '**/*.map'
        ],
        secretScan: { enabled: true, entropyThreshold: 4.5 }
      };

      // 2. Fetch diff if not provided
      const rawDiff = params.diffText || (await this.githubClient.fetchPullRequestDiff(repoOwner, repoName, prNumber));

      // 3. Parse diff and filter
      const parsedFiles = parseUnifiedDiff(rawDiff);
      const chunkedPackage = filterAndCapDiffFiles(
        parsedFiles,
        activeConfig.ignore,
        activeConfig.maxFiles
      );

      const allFindings: Finding[] = [];
      const reviewFilesToSave: Array<{
        filePath: string;
        status: string;
        diffContent: string;
        findingsCount: number;
      }> = [];

      // 4 & 5. Secret scan + LLM review per file
      for (const file of chunkedPackage.filesToReview) {
        // Step A: Deterministic secret scanner
        const { findings: secretFindings, redactedDiff } = scanAndRedactSecrets(
          file,
          activeConfig.secretScan.entropyThreshold,
          activeConfig.secretScan.enabled
        );

        allFindings.push(...secretFindings);

        // Step B: LLM review with structured outputs (never seeing plaintext secrets!)
        const llmFindings = await this.llmReviewer.reviewFileDiff(
          file,
          redactedDiff,
          activeConfig.model
        );

        // Filter LLM findings according to configured severity threshold
        const validLlmFindings = llmFindings.filter(f =>
          meetsSeverityThreshold(f.severity, activeConfig.severityThreshold)
        );

        allFindings.push(...validLlmFindings);

        const fileFindings = [...secretFindings, ...validLlmFindings];
        reviewFilesToSave.push({
          filePath: file.newPath,
          status: file.isNew ? 'added' : 'modified',
          diffContent: file.rawDiff,
          findingsCount: fileFindings.length
        });
      }

      // 6. Deduplicate findings
      const deduplicatedFindings = deduplicateFindings(allFindings);

      // Map to GitHub comments
      const { validComments } = mapFindingsToGitHubComments(
        deduplicatedFindings,
        chunkedPackage.filesToReview,
        activeConfig.severityThreshold
      );

      // 7. Build summary markdown
      const summaryMd = buildReviewSummaryMarkdown({
        repoOwner,
        repoName,
        prNumber,
        commitSha,
        findings: deduplicatedFindings,
        reviewedFilesCount: chunkedPackage.filesToReview.length,
        skippedFilesCount: chunkedPackage.skippedFiles.length,
        model: activeConfig.model
      });

      // 8. Post to GitHub if requested and token available
      if (postToGitHub && (process.env.GITHUB_TOKEN || params.githubToken)) {
        try {
          await this.githubClient.postReview(
            repoOwner,
            repoName,
            prNumber,
            commitSha,
            summaryMd,
            validComments
          );
        } catch (err: any) {
          console.warn(`[Redline] Could not post review to GitHub: ${err.message}`);
        }
      }

      // Calculate stats
      const criticalCount = deduplicatedFindings.filter(f => f.severity === 'critical').length;
      const highCount = deduplicatedFindings.filter(f => f.severity === 'high').length;
      const mediumCount = deduplicatedFindings.filter(f => f.severity === 'medium').length;
      const lowCount = deduplicatedFindings.filter(f => f.severity === 'low').length;

      // 9. Persist findings & files in SQLite
      db.saveFindingsAndFiles(reviewId, deduplicatedFindings, reviewFilesToSave);

      // Update review status
      const completedAt = new Date().toISOString();
      db.updateReview(reviewId, {
        status: 'completed',
        findingsCount: deduplicatedFindings.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        summaryMd,
        completedAt
      });

      // Update repo timestamp
      db.upsertRepository({
        id: repoId,
        owner: repoOwner,
        name: repoName,
        configJson: JSON.stringify(activeConfig)
      });

      const finalReview = db.getReviewById(reviewId);
      return finalReview || initialReview;
    } catch (err: any) {
      console.error(`[Redline] Review execution failed for ${repoFullName}#${prNumber}:`, err);
      db.updateReview(reviewId, {
        status: 'failed',
        errorMessage: err.message || 'Unknown review failure',
        completedAt: new Date().toISOString()
      });
      throw err;
    }
  }
}
