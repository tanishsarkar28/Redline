import { describe, it, expect } from 'vitest';
import {
  scanAndRedactSecrets,
  calculateShannonEntropy
} from '../server/pipeline/secretScanner.js';
import type { ParsedDiffFile } from '../shared/types.js';

function createMockDiffFile(lines: string[], filePath = 'src/auth/keys.ts'): ParsedDiffFile {
  return {
    oldPath: filePath,
    newPath: filePath,
    isBinary: false,
    isDeleted: false,
    isNew: false,
    rawDiff: `diff --git a/${filePath} b/${filePath}\n--- a/${filePath}\n+++ b/${filePath}\n@@ -1,5 +1,${lines.length} @@\n` + lines.join('\n'),
    hunks: [
      {
        oldStart: 1,
        oldLines: 5,
        newStart: 1,
        newLines: lines.length,
        header: `@@ -1,5 +1,${lines.length} @@`,
        lines,
        newLineToDiffIndex: new Map(),
        changedNewLines: new Set([1, 2, 3])
      }
    ]
  };
}

describe('Deterministic Secret Scanner', () => {
  it('calculates Shannon entropy correctly', () => {
    // Uniform character string has 0 entropy
    expect(calculateShannonEntropy('aaaaa')).toBe(0);

    // High-entropy mixed alphanumeric/symbol key should have > 4.5 bits
    const highEntropyKey = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/';
    expect(calculateShannonEntropy(highEntropyKey)).toBeGreaterThan(4.5);

    // Simple word has low entropy
    expect(calculateShannonEntropy('password')).toBeLessThan(3.0);
  });

  it('detects and redacts AWS Access Key IDs', () => {
    const rawKey = 'AKIAIOSFODNN7EXAMPLE';
    const file = createMockDiffFile([
      '+ const awsKey = "' + rawKey + '";',
      '+ console.log("Init AWS client");'
    ]);

    const result = scanAndRedactSecrets(file);

    expect(result.findings.length).toBe(1);
    expect(result.findings[0].category).toBe('secret-exposure');
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[0].title).toContain('AWS Access Key ID');
    expect(result.redactedDiff).not.toContain(rawKey);
    expect(result.redactedDiff).toContain('[REDACTED_AWS_ACCESS_KEY]');
  });

  it('detects and redacts AWS Secret Access Keys', () => {
    const rawSecret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const file = createMockDiffFile([
      '+ const aws_secret_access_key = "' + rawSecret + '";'
    ]);

    const result = scanAndRedactSecrets(file);

    expect(result.findings.length).toBe(1);
    expect(result.findings[0].category).toBe('secret-exposure');
    expect(result.findings[0].title).toContain('AWS Secret Access Key');
    expect(result.redactedDiff).not.toContain(rawSecret);
    expect(result.redactedDiff).toContain('[REDACTED_AWS_SECRET_KEY]');
  });

  it('detects and redacts GitHub Personal Access Tokens', () => {
    const rawToken = ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].join('_');
    const file = createMockDiffFile([
      '+ const token = "' + rawToken + '";'
    ]);

    const result = scanAndRedactSecrets(file);

    expect(result.findings.length).toBe(1);
    expect(result.findings[0].title).toContain('GitHub Personal Access Token');
    expect(result.redactedDiff).not.toContain(rawToken);
    expect(result.redactedDiff).toContain('[REDACTED_GITHUB_TOKEN]');
  });

  it('detects and redacts Private Keys', () => {
    const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA04rQ\n-----END RSA PRIVATE KEY-----';
    const file = createMockDiffFile([
      '+ const key = `' + privateKey + '`;'
    ]);

    const result = scanAndRedactSecrets(file);

    expect(result.findings.length).toBe(1);
    expect(result.findings[0].title).toContain('Private Key');
    expect(result.redactedDiff).not.toContain('MIIEowIBAAKCAQEA04rQ');
  });

  it('detects and redacts generic .env secret assignments', () => {
    const rawSecret = 'SuperSecretDbPassword123!';
    const file = createMockDiffFile([
      '+ DB_PASSWORD="' + rawSecret + '"'
    ], '.env.production');

    const result = scanAndRedactSecrets(file);

    expect(result.findings.length).toBe(1);
    expect(result.findings[0].title).toContain('Generic .env Secret Assignment');
    expect(result.redactedDiff).not.toContain(rawSecret);
  });

  it('does not flag normal code, imports, or UUIDs', () => {
    const file = createMockDiffFile([
      '+ import { useState, useEffect } from "react";',
      '+ const userId = "c9bf9e57-1685-4c89-bafb-ff5af830be8a";',
      '+ const path = "/api/v1/users/profile";',
      '+ const greeting = "Welcome back to the application dashboard";'
    ]);

    const result = scanAndRedactSecrets(file);
    expect(result.findings.length).toBe(0);
    expect(result.redactedDiff).toBe(file.rawDiff);
  });
});
