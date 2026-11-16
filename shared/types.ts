export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type FindingCategory =
  | 'bug'
  | 'security'
  | 'secret-exposure'
  | 'performance'
  | 'style/improvement';

export type ReviewStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Finding {
  id?: string;
  reviewId?: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: Severity;
  category: FindingCategory;
  title: string;
  explanation: string;
  suggestedFix?: string;
  diffHunk?: string;
  githubCommentId?: number;
  createdAt?: string;
}

export interface ReviewFile {
  id?: string;
  reviewId?: string;
  filePath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  diffContent: string;
  findingsCount: number;
  findings?: Finding[];
}

export interface Review {
  id: string;
  repoId: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  author: string;
  commitSha: string;
  baseSha: string;
  status: ReviewStatus;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  summaryMd: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  findings?: Finding[];
  files?: ReviewFile[];
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  configJson?: string;
  lastReviewAt?: string;
  webhookActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEventRecord {
  id: string;
  deliveryId: string;
  eventType: string;
  action?: string;
  repoFullName: string;
  prNumber?: number;
  status: 'received' | 'processing' | 'processed' | 'failed';
  errorMessage?: string;
  receivedAt: string;
}

export interface RedlineConfig {
  model: string;
  severityThreshold: Severity;
  maxFiles: number;
  ignore: string[];
  secretScan: {
    enabled: boolean;
    entropyThreshold: number;
  };
}

export interface ParsedDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
  // Maps 1-based line number in new file to diff line index
  newLineToDiffIndex: Map<number, number>;
  // Set of added or modified new file line numbers in this hunk
  changedNewLines: Set<number>;
}

export interface ParsedDiffFile {
  oldPath: string;
  newPath: string;
  isBinary: boolean;
  isDeleted: boolean;
  isNew: boolean;
  hunks: ParsedDiffHunk[];
  rawDiff: string;
}
