import { describe, it, expect } from 'vitest';
import {
  mapFindingsToGitHubComments,
  formatFindingCommentBody,
  buildReviewSummaryMarkdown,
  meetsSeverityThreshold
} from '../server/pipeline/commentMapper.js';
import { parseUnifiedDiff } from '../server/pipeline/chunker.js';
import type { Finding } from '../shared/types.js';

describe('Comment Position Mapper & Summary Builder', () => {
  it('correctly filters findings by severity threshold', () => {
    expect(meetsSeverityThreshold('critical', 'high')).toBe(true);
    expect(meetsSeverityThreshold('high', 'high')).toBe(true);
    expect(meetsSeverityThreshold('medium', 'high')).toBe(false);
    expect(meetsSeverityThreshold('low', 'medium')).toBe(false);
    expect(meetsSeverityThreshold('medium', 'low')).toBe(true);
  });

  it('formats finding comment body with suggestion block', () => {
    const finding: Finding = {
      file: 'src/auth.ts',
      lineStart: 25,
      lineEnd: 25,
      severity: 'high',
      category: 'bug',
      title: 'Missing await on asynchronous call',
      explanation: 'The function returns a Promise but is invoked without await.',
      suggestedFix: 'await saveSession(user.id);'
    };

    const body = formatFindingCommentBody(finding);
    expect(body).toContain('[HIGH : bug]');
    expect(body).toContain('Missing await on asynchronous call');
    expect(body).toContain('```suggestion\nawait saveSession(user.id);\n```');
    expect(body).toContain('— Redline Review Bot');
  });

  it('maps findings only to valid lines within diff hunks', () => {
    const diff = `diff --git a/src/db.ts b/src/db.ts
--- a/src/db.ts
+++ b/src/db.ts
@@ -10,3 +10,4 @@
  const a = 1;
+ const b = 2;
  const c = 3;
`;
    const parsedFiles = parseUnifiedDiff(diff);

    const findings: Finding[] = [
      {
        file: 'src/db.ts',
        lineStart: 11,
        lineEnd: 11,
        severity: 'high',
        category: 'bug',
        title: 'Valid line finding',
        explanation: 'Line 11 is inside the hunk'
      },
      {
        file: 'src/db.ts',
        lineStart: 999, // Outside diff
        lineEnd: 999,
        severity: 'high',
        category: 'bug',
        title: 'Invalid line finding',
        explanation: 'Line 999 is far away from the hunk'
      }
    ];

    const { validComments, droppedFindings } = mapFindingsToGitHubComments(
      findings,
      parsedFiles,
      'low'
    );

    expect(validComments.length).toBe(1);
    expect(validComments[0].line).toBe(11);
    expect(validComments[0].side).toBe('RIGHT');

    expect(droppedFindings.length).toBe(1);
    expect(droppedFindings[0].lineStart).toBe(999);
  });

  it('handles multi-line findings with start_line and line', () => {
    const diff = `diff --git a/src/server.ts b/src/server.ts
--- a/src/server.ts
+++ b/src/server.ts
@@ -20,6 +20,8 @@
  const port = 3000;
+ const app = express();
+ app.listen(port);
  console.log('started');
`;
    const parsedFiles = parseUnifiedDiff(diff);

    const finding: Finding = {
      file: 'src/server.ts',
      lineStart: 21,
      lineEnd: 22,
      severity: 'medium',
      category: 'performance',
      title: 'Multi-line block issue',
      explanation: 'Lines 21-22 have an issue'
    };

    const { validComments } = mapFindingsToGitHubComments([finding], parsedFiles, 'low');

    expect(validComments.length).toBe(1);
    expect(validComments[0].start_line).toBe(21);
    expect(validComments[0].line).toBe(22);
  });

  it('builds clean markdown summary table with accurate counts', () => {
    const findings: Finding[] = [
      {
        file: 'src/api.ts',
        lineStart: 15,
        lineEnd: 15,
        severity: 'critical',
        category: 'security',
        title: 'SQL Injection in query',
        explanation: 'SQL injection via unescaped string interpolation'
      },
      {
        file: 'src/api.ts',
        lineStart: 30,
        lineEnd: 32,
        severity: 'high',
        category: 'bug',
        title: 'Race condition in token cache',
        explanation: 'Cache eviction race condition'
      }
    ];

    const summary = buildReviewSummaryMarkdown({
      repoOwner: 'org',
      repoName: 'repo',
      prNumber: 42,
      commitSha: '9f8e7d6c5b4a3210',
      findings,
      reviewedFilesCount: 2,
      skippedFilesCount: 1,
      model: 'gpt-4o-mini'
    });

    expect(summary).toContain('Redline Pull Request Review');
    expect(summary).toContain('`9f8e7d6`');
    expect(summary).toContain('Found **2 findings** (**1 critical**, **1 high**)');
    expect(summary).toContain('| `src/api.ts` | `L15` | **CRITICAL** | `security` | SQL Injection in query |');
    expect(summary).toContain('| `src/api.ts` | `L30-32` | **HIGH** | `bug` | Race condition in token cache |');
  });
});
