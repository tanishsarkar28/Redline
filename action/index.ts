import * as core from '@actions/core';
import * as github from '@actions/github';
import { ReviewEngine } from '../server/pipeline/reviewEngine.js';

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github_token', { required: true });
    const openaiApiKey = core.getInput('openai_api_key', { required: true });
    const openaiModel = core.getInput('openai_model') || 'gpt-4o-mini';
    const severityThreshold = core.getInput('severity_threshold') || 'low';
    const postReview = core.getInput('post_review') !== 'false';

    const { context } = github;

    if (!context.payload.pull_request) {
      core.setFailed('This action can only run on pull_request events.');
      return;
    }

    const pr = context.payload.pull_request;
    const { owner, repo } = context.repo;

    core.info(`[Redline Action] Starting review for ${owner}/${repo}#${pr.number} (commit: ${pr.head.sha})`);

    process.env.OPENAI_API_KEY = openaiApiKey;
    process.env.OPENAI_MODEL = openaiModel;
    process.env.GITHUB_TOKEN = githubToken;

    const engine = new ReviewEngine({
      githubToken,
      openaiApiKey
    });

    const review = await engine.executeReview({
      repoOwner: owner,
      repoName: repo,
      prNumber: pr.number,
      prTitle: pr.title || `PR #${pr.number}`,
      prUrl: pr.html_url || `https://github.com/${owner}/${repo}/pull/${pr.number}`,
      author: pr.user?.login || 'unknown',
      commitSha: pr.head.sha,
      baseSha: pr.base.sha,
      postToGitHub: postReview
    });

    core.setOutput('findings_count', review.findingsCount.toString());
    core.setOutput('critical_count', review.criticalCount.toString());
    core.setOutput('high_count', review.highCount.toString());
    core.setOutput('review_summary', review.summaryMd);

    core.info(`[Redline Action] Review complete. Found ${review.findingsCount} findings (${review.criticalCount} critical, ${review.highCount} high).`);

    if (review.criticalCount > 0 && severityThreshold === 'critical') {
      core.setFailed(`Redline found ${review.criticalCount} critical findings.`);
    }
  } catch (error: any) {
    core.setFailed(`Redline action failed: ${error.message}`);
  }
}

run();
