import OpenAI from 'openai';
import { OPENAI_REVIEW_JSON_SCHEMA } from '../../shared/schema.js';
import type { Finding, ParsedDiffFile, Severity, FindingCategory } from '../../shared/types.js';

export interface LLMReviewOptions {
  apiKey?: string;
  model?: string;
  maxRetries?: number;
}

export class LLMReviewer {
  private client: OpenAI | null = null;
  private defaultModel: string;

  constructor(options: LLMReviewOptions = {}) {
    this.defaultModel = options.model || 'gpt-4o-mini';
    const key = options.apiKey || process.env.OPENAI_API_KEY;
    if (key && key !== 'sk-your_openai_api_key_here') {
      this.client = new OpenAI({ apiKey: key });
    }
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  public async reviewFileDiff(
    file: ParsedDiffFile,
    redactedDiff: string,
    model?: string,
    retryCount = 0
  ): Promise<Finding[]> {
    const activeModel = model || this.defaultModel;

    if (!this.client) {
      // In offline / dry-run mode without API key, return deterministic heuristic findings
      return this.generateSimulatedReview(file);
    }

    const systemPrompt = `You are Redline, an expert principal software engineer and security auditor reviewing GitHub pull request diffs.
Review only the changed hunks (lines starting with '+' or modified).
Identify concrete, actionable issues in the following categories:
- bug: logical bugs, race conditions, unhandled exceptions, unawaited promises, off-by-one errors
- security: SQL injection, SSRF, command injection, timing attacks, path traversal, auth flaws
- secret-exposure: tokens, API keys, private credentials
- performance: algorithmic complexity, N+1 queries, unbounded memory allocations, blocking I/O
- style/improvement: major anti-patterns, dangerous API misuse, severe maintainability traps

Rules:
1. lineStart and lineEnd MUST correspond to actual line numbers in the NEW file.
2. suggestedFix must be a concise, direct replacement code snippet.
3. Be concise, direct, and technically precise. No fluff, no generic compliments.`;

    const userPrompt = `File: ${file.newPath}
Diff:
\`\`\`diff
${redactedDiff}
\`\`\`

Analyze the changes and output findings conforming strictly to the JSON schema.`;

    try {
      const response = await this.client.chat.completions.create({
        model: activeModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: OPENAI_REVIEW_JSON_SCHEMA
        },
        temperature: 0.1
      });

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) return [];

      const parsed = JSON.parse(rawContent) as {
        findings: Array<{
          lineStart: number;
          lineEnd: number;
          severity: Severity;
          category: FindingCategory;
          title: string;
          explanation: string;
          suggestedFix: string;
        }>;
      };

      return (parsed.findings || []).map(f => ({
        file: file.newPath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        severity: f.severity,
        category: f.category,
        title: f.title,
        explanation: f.explanation,
        suggestedFix: f.suggestedFix
      }));
    } catch (err: any) {
      // Handle rate limits (429) or transient server errors (5xx) with exponential backoff
      const isTransient = err.status === 429 || (err.status >= 500 && err.status < 600);
      if (isTransient && retryCount < 3) {
        const delayMs = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
        await new Promise(res => setTimeout(res, delayMs));
        return this.reviewFileDiff(file, redactedDiff, activeModel, retryCount + 1);
      }

      console.error(`[Redline] LLM review error for ${file.newPath}:`, err.message);
      // Fallback to simulated review if OpenAI fails or quota is exhausted
      return this.generateSimulatedReview(file);
    }
  }

  // Fallback simulator for offline environments or testing
  private generateSimulatedReview(file: ParsedDiffFile): Finding[] {
    const findings: Finding[] = [];

    for (const hunk of file.hunks) {
      let currentLine = hunk.newStart;
      for (const line of hunk.lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          const content = line.slice(1);

          // Detect unawaited promises
          if (/\.save\(|\.fetch\(|\.query\(|\.exec\(/.test(content) && !content.includes('await ') && !content.includes('.then(')) {
            if (/async\s+function|async\s*\(/.test(file.rawDiff)) {
              findings.push({
                file: file.newPath,
                lineStart: currentLine,
                lineEnd: currentLine,
                severity: 'high',
                category: 'bug',
                title: 'Missing await on asynchronous call',
                explanation: 'An asynchronous operation returning a Promise is invoked without `await`, which can lead to unhandled rejections and race conditions.',
                suggestedFix: `await ${content.trim()}`
              });
            }
          }

          // Detect SQL injection string interpolation
          if (/SELECT|INSERT|UPDATE|DELETE/i.test(content) && /\$\{.*?\}|\+\s*[a-zA-Z]/.test(content)) {
            findings.push({
              file: file.newPath,
              lineStart: currentLine,
              lineEnd: currentLine,
              severity: 'critical',
              category: 'security',
              title: 'SQL Injection via string concatenation/interpolation',
              explanation: 'SQL statement constructed using unescaped string interpolation. Attackers can execute arbitrary SQL queries via untrusted input. Use parameterized queries.',
              suggestedFix: `db.prepare('SELECT * FROM users WHERE id = ?').get(userId);`
            });
          }

          // Detect timing attack in HMAC / signature verification
          if (/===|!==/.test(content) && /(hash|signature|token|secret|digest)/i.test(content)) {
            findings.push({
              file: file.newPath,
              lineStart: currentLine,
              lineEnd: currentLine,
              severity: 'high',
              category: 'security',
              title: 'Timing attack vulnerability in cryptographic comparison',
              explanation: 'Using standard equality operators (`===` or `!==`) on hashes or secret signatures is vulnerable to timing attacks. Use `crypto.timingSafeEqual` with constant-time comparison.',
              suggestedFix: `crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'))`
            });
          }

          currentLine++;
        } else if (line.startsWith(' ')) {
          currentLine++;
        }
      }
    }

    return findings;
  }
}

// Deduplicate findings by line and category
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const deduped: Finding[] = [];

  for (const f of findings) {
    const key = `${f.file}:${f.lineStart}:${f.lineEnd}:${f.category}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(f);
    }
  }

  return deduped;
}
