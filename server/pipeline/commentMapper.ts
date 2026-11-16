import type { Finding, ParsedDiffFile, Severity } from '../../shared/types.js';

export interface GitHubReviewComment {
  path: string;
  line: number;
  start_line?: number;
  side: 'RIGHT';
  start_side?: 'RIGHT';
  body: string;
}

export interface SummaryData {
  repoOwner: string;
  repoName: string;
  prNumber: number;
  commitSha: string;
  findings: Finding[];
  reviewedFilesCount: number;
  skippedFilesCount: number;
  model: string;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

export function meetsSeverityThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold];
}

export function formatFindingCommentBody(finding: Finding): string {
  const severityTag = finding.severity.toUpperCase();
  const categoryTag = finding.category;

  let body = `### [${severityTag} : ${categoryTag}] ${finding.title}\n\n`;
  body += `${finding.explanation}\n`;

  if (finding.suggestedFix && finding.suggestedFix.trim()) {
    // If suggested fix already has ``` delimiters, use it; otherwise wrap in suggestion block
    if (finding.suggestedFix.includes('```')) {
      body += `\n**Suggested Fix:**\n${finding.suggestedFix}\n`;
    } else {
      body += `\n\`\`\`suggestion\n${finding.suggestedFix.trim()}\n\`\`\`\n`;
    }
  }

  body += `\n*— Redline Review Bot*`;
  return body;
}

export function mapFindingsToGitHubComments(
  findings: Finding[],
  parsedFiles: ParsedDiffFile[],
  severityThreshold: Severity = 'low'
): { validComments: GitHubReviewComment[]; droppedFindings: Finding[] } {
  const validComments: GitHubReviewComment[] = [];
  const droppedFindings: Finding[] = [];

  // Create lookup of files and valid changed line numbers
  const fileLinesMap = new Map<string, { validLines: Set<number>; hunkHeaders: string[] }>();
  for (const file of parsedFiles) {
    const validLines = new Set<number>();
    const hunkHeaders: string[] = [];
    for (const hunk of file.hunks) {
      hunkHeaders.push(hunk.header);
      for (const lineNum of hunk.newLineToDiffIndex.keys()) {
        validLines.add(lineNum);
      }
    }
    fileLinesMap.set(file.newPath, { validLines, hunkHeaders });
  }

  for (const finding of findings) {
    if (!meetsSeverityThreshold(finding.severity, severityThreshold)) {
      continue;
    }

    const fileMeta = fileLinesMap.get(finding.file);
    if (!fileMeta) {
      droppedFindings.push(finding);
      continue;
    }

    // Verify finding line exists in diff hunk
    let targetLine = finding.lineEnd || finding.lineStart;
    let startLine = finding.lineStart;

    // Check if targetLine is within validLines
    if (!fileMeta.validLines.has(targetLine)) {
      // Find nearest valid line within +/- 3 lines
      let nearestLine: number | null = null;
      for (let offset = 1; offset <= 3; offset++) {
        if (fileMeta.validLines.has(targetLine + offset)) {
          nearestLine = targetLine + offset;
          break;
        }
        if (fileMeta.validLines.has(targetLine - offset)) {
          nearestLine = targetLine - offset;
          break;
        }
      }

      if (nearestLine !== null) {
        targetLine = nearestLine;
        startLine = nearestLine;
      } else {
        // Cannot map to diff line; drop from inline comments (will still appear in summary)
        droppedFindings.push(finding);
        continue;
      }
    }

    const comment: GitHubReviewComment = {
      path: finding.file,
      line: targetLine,
      side: 'RIGHT',
      body: formatFindingCommentBody(finding)
    };

    if (startLine && startLine < targetLine && fileMeta.validLines.has(startLine)) {
      comment.start_line = startLine;
      comment.start_side = 'RIGHT';
    }

    validComments.push(comment);
  }

  return { validComments, droppedFindings };
}

export function buildReviewSummaryMarkdown(data: SummaryData): string {
  const { findings, reviewedFilesCount, skippedFilesCount, model, commitSha } = data;

  const critical = findings.filter(f => f.severity === 'critical');
  const high = findings.filter(f => f.severity === 'high');
  const medium = findings.filter(f => f.severity === 'medium');
  const low = findings.filter(f => f.severity === 'low');

  const shortSha = commitSha.slice(0, 7);

  let md = `## Redline Pull Request Review\n\n`;
  md += `**Commit:** \`${shortSha}\` · **Model:** \`${model}\` · **Analyzed Files:** ${reviewedFilesCount} (${skippedFilesCount} skipped)\n\n`;

  if (findings.length === 0) {
    md += `> **Status: Clean** — No issues identified above the configured threshold.\n`;
    return md;
  }

  md += `**Overview:** Found **${findings.length} findings** `;
  const parts: string[] = [];
  if (critical.length > 0) parts.push(`**${critical.length} critical**`);
  if (high.length > 0) parts.push(`**${high.length} high**`);
  if (medium.length > 0) parts.push(`${medium.length} medium`);
  if (low.length > 0) parts.push(`${low.length} low`);
  md += `(${parts.join(', ')})\n\n`;

  // Findings Table
  md += `| File | Lines | Severity | Category | Title |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (const f of findings) {
    const lineStr = f.lineStart === f.lineEnd ? `L${f.lineStart}` : `L${f.lineStart}-${f.lineEnd}`;
    const sevIcon = f.severity === 'critical' ? 'CRITICAL' : f.severity.toUpperCase();
    md += `| \`${f.file}\` | \`${lineStr}\` | **${sevIcon}** | \`${f.category}\` | ${f.title.replace(/\|/g, '\\|')} |\n`;
  }

  md += `\n---\n*Inline comments have been placed directly on relevant hunks. Review generated by [Redline](https://github.com).*`;
  return md;
}
