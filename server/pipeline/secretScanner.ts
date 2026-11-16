import type { Finding, ParsedDiffFile } from '../../shared/types.js';

export interface SecretScanResult {
  findings: Finding[];
  redactedDiff: string;
}

interface SecretPattern {
  name: string;
  regex: RegExp;
  description: string;
  redactionLabel: string;
}

const KNOWN_SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'AWS Access Key ID',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    description: 'Hardcoded AWS Access Key ID exposed in source code.',
    redactionLabel: 'AWS_ACCESS_KEY'
  },
  {
    name: 'AWS Secret Access Key',
    regex: /(?:aws_secret_access_key|aws_secret_key|secret_access_key|secretkey)\s*[:=]\s*['"]([A-Za-z0-9/+=]{40})['"]/gi,
    description: 'Hardcoded AWS Secret Access Key exposed in source code.',
    redactionLabel: 'AWS_SECRET_KEY'
  },
  {
    name: 'GitHub Personal Access Token',
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g,
    description: 'GitHub personal access token or OAuth credential exposed.',
    redactionLabel: 'GITHUB_TOKEN'
  },
  {
    name: 'GitHub Fine-Grained Token',
    regex: /github_pat_[A-Za-z0-9_]{82}/g,
    description: 'GitHub fine-grained personal access token exposed.',
    redactionLabel: 'GITHUB_FINE_GRAINED_TOKEN'
  },
  {
    name: 'Private Key',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[A-Za-z0-9+/=\s\r\n]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    description: 'Unencrypted cryptographic private key exposed in source code.',
    redactionLabel: 'PRIVATE_KEY'
  },
  {
    name: 'Stripe Secret Key',
    regex: /(?:sk_live|rk_live)_[0-9a-zA-Z]{24,34}/g,
    description: 'Live Stripe secret API key exposed.',
    redactionLabel: 'STRIPE_API_KEY'
  },
  {
    name: 'Slack Token',
    regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    description: 'Slack API / bot token exposed.',
    redactionLabel: 'SLACK_TOKEN'
  },
  {
    name: 'Generic .env Secret Assignment',
    regex: /(?:API_KEY|SECRET_KEY|AUTH_TOKEN|ACCESS_TOKEN|PRIVATE_TOKEN|DB_PASSWORD|DATABASE_PASSWORD)\s*=\s*['"]([A-Za-z0-9_!#$%&*+/=?^`{|}~-]{16,})['"]/gi,
    description: 'High-entropy secret or credential assigned in environment configuration.',
    redactionLabel: 'ENV_SECRET'
  }
];

// Shannon entropy calculation in bits per character
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const frequencies = new Map<string, number>();
  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }

  let entropy = 0;
  const len = str.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Check for high-entropy alphanumeric strings (e.g. API keys, JWTs, hex tokens)
function detectHighEntropyStrings(
  line: string,
  entropyThreshold = 4.5
): Array<{ secret: string; entropy: number }> {
  const results: Array<{ secret: string; entropy: number }> = [];

  // Match standalone strings or quotes with length between 24 and 128 characters
  const tokenRegex = /['"]?([A-Za-z0-9+/=_-]{24,128})['"]?/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    const token = match[1];

    // Exclude common safe patterns (UUIDs, git hashes, obvious URLs, imports)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) continue;
    if (token.includes('node_modules') || token.includes('http://') || token.includes('https://')) continue;
    if (/^(true|false|undefined|null|application|json|javascript)/i.test(token)) continue;

    // Check charset mix (must have letters and digits or symbols)
    const hasLetters = /[a-zA-Z]/.test(token);
    const hasDigits = /[0-9]/.test(token);
    if (!hasLetters || !hasDigits) continue;

    const entropy = calculateShannonEntropy(token);
    if (entropy >= entropyThreshold) {
      results.push({ secret: token, entropy });
    }
  }

  return results;
}

export function scanAndRedactSecrets(
  file: ParsedDiffFile,
  entropyThreshold = 4.5,
  secretScanEnabled = true
): SecretScanResult {
  if (!secretScanEnabled) {
    return { findings: [], redactedDiff: file.rawDiff };
  }

  const findings: Finding[] = [];
  let redactedDiff = file.rawDiff;

  for (const hunk of file.hunks) {
    let currentNewLine = hunk.newStart;

    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
      const line = hunk.lines[lineIndex];

      if (line.startsWith('+') && !line.startsWith('+++')) {
        const addedContent = line.slice(1);
        const actualLineNumber = currentNewLine;

        // 1. Check known deterministic regex patterns
        for (const pattern of KNOWN_SECRET_PATTERNS) {
          // Reset regex state
          pattern.regex.lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = pattern.regex.exec(addedContent)) !== null) {
            const secretValue = match[1] || match[0];
            const startIdx = match.index;

            // Generate finding
            findings.push({
              file: file.newPath,
              lineStart: actualLineNumber,
              lineEnd: actualLineNumber,
              severity: 'critical',
              category: 'secret-exposure',
              title: `Critical: Exposure of ${pattern.name}`,
              explanation: `${pattern.description} Hardcoded secrets committed to version control pose an immediate compromise vector. Redact this secret and rotate it immediately.`,
              suggestedFix: `process.env.${pattern.redactionLabel.toUpperCase()}`,
              diffHunk: hunk.header + '\n' + line
            });

            // Redact in diff string
            const safeReplacement = `[REDACTED_${pattern.redactionLabel}]`;
            redactedDiff = redactedDiff.split(secretValue).join(safeReplacement);
          }
        }

        // 2. High-entropy token check
        const highEntropyMatches = detectHighEntropyStrings(addedContent, entropyThreshold);
        for (const { secret, entropy } of highEntropyMatches) {
          // Skip if already caught by a known pattern
          const alreadyCaught = findings.some(
            f => f.file === file.newPath && f.lineStart === actualLineNumber
          );
          if (alreadyCaught) continue;

          findings.push({
            file: file.newPath,
            lineStart: actualLineNumber,
            lineEnd: actualLineNumber,
            severity: 'critical',
            category: 'secret-exposure',
            title: `Critical: Potential Secret Exposure (High Entropy String: ${entropy.toFixed(2)} bits)`,
            explanation: `Detected suspicious high-entropy string (${entropy.toFixed(2)} bits/char) resembling a token, private key, or password. Secrets must never be stored in plaintext repository files.`,
            suggestedFix: `process.env.SECRET_TOKEN`,
            diffHunk: hunk.header + '\n' + line
          });

          // Redact in diff string
          const safeReplacement = `[REDACTED_HIGH_ENTROPY_SECRET]`;
          redactedDiff = redactedDiff.split(secret).join(safeReplacement);
        }

        currentNewLine++;
      } else if (line.startsWith(' ')) {
        currentNewLine++;
      }
    }
  }

  return { findings, redactedDiff };
}
