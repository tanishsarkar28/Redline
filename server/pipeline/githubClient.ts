import { Octokit } from '@octokit/rest';
import { load as yamlLoad } from 'js-yaml';
import { RedlineConfigSchema } from '../../shared/schema.js';
import type { RedlineConfig, Severity } from '../../shared/types.js';
import type { GitHubReviewComment } from './commentMapper.js';

export interface GitHubClientOptions {
  token?: string;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(options: GitHubClientOptions = {}) {
    const token = options.token || process.env.GITHUB_TOKEN || '';
    this.octokit = new Octokit({
      auth: token || undefined
    });
  }

  public async fetchPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
    try {
      const response = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
        mediaType: {
          format: 'diff'
        }
      });

      return response.data as unknown as string;
    } catch (err: any) {
      console.error(`[Redline] Failed to fetch diff for ${owner}/${repo}#${pullNumber}:`, err.message);
      throw err;
    }
  }

  public async fetchRepoConfig(
    owner: string,
    repo: string,
    ref?: string
  ): Promise<RedlineConfig | null> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path: '.redline.yml',
        ref: ref || undefined
      });

      if ('content' in response.data && typeof response.data.content === 'string') {
        const decoded = Buffer.from(response.data.content, 'base64').toString('utf-8');
        const parsedYaml = yamlLoad(decoded) as any;
        const validated = RedlineConfigSchema.parse(parsedYaml);
        return {
          model: validated.model,
          severityThreshold: validated.severity_threshold as Severity,
          maxFiles: validated.max_files,
          ignore: validated.ignore,
          secretScan: {
            enabled: validated.secret_scan.enabled,
            entropyThreshold: validated.secret_scan.entropy_threshold
          }
        };
      }
    } catch (err: any) {
      // 404 is normal if repo does not have .redline.yml
      if (err.status !== 404) {
        console.warn(`[Redline] Could not read .redline.yml for ${owner}/${repo}:`, err.message);
      }
    }

    return null;
  }

  public async postReview(
    owner: string,
    repo: string,
    pullNumber: number,
    commitSha: string,
    summaryMarkdown: string,
    comments: GitHubReviewComment[]
  ): Promise<{ reviewId?: number; postedCommentsCount: number }> {
    try {
      // First check if a review with the exact commit SHA has already been posted by the bot
      const existingReviews = await this.octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 20
      });

      const alreadyReviewed = existingReviews.data.some(
        r => r.commit_id === commitSha && r.body?.includes('Redline Pull Request Review')
      );

      if (alreadyReviewed) {
        console.log(`[Redline] Review already posted for commit ${commitSha} on ${owner}/${repo}#${pullNumber}`);
        return { postedCommentsCount: 0 };
      }

      // GitHub API accepts up to 50 review comments in a single createReview call
      const batchComments = comments.slice(0, 50).map(c => ({
        path: c.path,
        line: c.line,
        start_line: c.start_line,
        side: c.side,
        start_side: c.start_side,
        body: c.body
      }));

      const reviewResponse = await this.octokit.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitSha,
        event: 'COMMENT',
        body: summaryMarkdown,
        comments: batchComments
      });

      return {
        reviewId: reviewResponse.data.id,
        postedCommentsCount: batchComments.length
      };
    } catch (err: any) {
      console.error(`[Redline] Failed to post review to GitHub:`, err.message);
      // If inline review comments failed because of invalid line offsets, post the summary comment alone
      try {
        const fallback = await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: pullNumber,
          body: summaryMarkdown + '\n\n*(Note: Inline line comments could not be anchored to diff lines and are listed above in the summary table.)*'
        });
        return { reviewId: fallback.data.id, postedCommentsCount: 0 };
      } catch (fallbackErr: any) {
        console.error(`[Redline] Fallback comment also failed:`, fallbackErr.message);
        throw err;
      }
    }
  }
}
