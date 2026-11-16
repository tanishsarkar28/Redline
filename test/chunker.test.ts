import { describe, it, expect } from 'vitest';
import {
  parseUnifiedDiff,
  filterAndCapDiffFiles,
  matchesGlob,
  splitHunksIntoChunks
} from '../server/pipeline/chunker.js';

describe('Diff Chunker & Parser', () => {
  it('correctly matches glob patterns', () => {
    expect(matchesGlob('package-lock.json', '**/*.lock')).toBe(false);
    expect(matchesGlob('yarn.lock', '**/*.lock')).toBe(true);
    expect(matchesGlob('package-lock.json', 'package-lock.json')).toBe(true);
    expect(matchesGlob('dist/bundle.js', 'dist/**')).toBe(true);
    expect(matchesGlob('src/components/Header.tsx', 'src/**/*.tsx')).toBe(true);
    expect(matchesGlob('src/components/Header.tsx', 'dist/**')).toBe(false);
  });

  it('parses unified diffs with multiple files and hunks', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
index 1234567..89abcdef 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -10,6 +10,8 @@ export function start() {
   initLogger();
+  setupRoutes();
+  startServer();
   return true;
 }
diff --git a/package-lock.json b/package-lock.json
index 1111111..2222222 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,5 +1,6 @@
 {
   "name": "app",
+  "version": "1.0.1"
 }
`;

    const parsed = parseUnifiedDiff(diff);
    expect(parsed.length).toBe(2);
    expect(parsed[0].newPath).toBe('src/index.ts');
    expect(parsed[0].hunks.length).toBe(1);
    expect(parsed[0].hunks[0].newStart).toBe(10);
    expect(parsed[0].hunks[0].newLines).toBe(8);

    expect(parsed[1].newPath).toBe('package-lock.json');
  });

  it('filters lockfiles, binary files, and deleted files according to config', () => {
    const mockDiff = `diff --git a/yarn.lock b/yarn.lock
--- a/yarn.lock
+++ b/yarn.lock
@@ -1,3 +1,3 @@
 yarn lockfile
diff --git a/assets/logo.png b/assets/logo.png
Binary files differ
diff --git a/old-file.txt b/old-file.txt
deleted file mode 100644
--- a/old-file.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-old content
diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
+import express from 'express';
`;

    const parsed = parseUnifiedDiff(mockDiff);
    const ignorePatterns = ['**/*.lock', 'yarn.lock'];
    const { filesToReview, skippedFiles } = filterAndCapDiffFiles(parsed, ignorePatterns, 10);

    expect(filesToReview.length).toBe(1);
    expect(filesToReview[0].newPath).toBe('src/app.ts');

    const skippedPaths = skippedFiles.map(s => s.path);
    expect(skippedPaths).toContain('yarn.lock');
    expect(skippedPaths).toContain('assets/logo.png');
    expect(skippedPaths).toContain('old-file.txt');
  });

  it('caps review files at max_files limit', () => {
    const diffs: string[] = [];
    for (let i = 1; i <= 10; i++) {
      diffs.push(`diff --git a/file${i}.ts b/file${i}.ts
--- a/file${i}.ts
+++ b/file${i}.ts
@@ -1,2 +1,3 @@
+// file ${i}
`);
    }

    const parsed = parseUnifiedDiff(diffs.join('\n'));
    const maxFiles = 3;
    const { filesToReview, skippedFiles } = filterAndCapDiffFiles(parsed, [], maxFiles);

    expect(filesToReview.length).toBe(3);
    expect(skippedFiles.length).toBe(7);
    expect(skippedFiles[0].reason).toContain('Exceeded max_files limit');
  });

  it('splits huge files into chunked batches', () => {
    const file = parseUnifiedDiff(`diff --git a/src/big.ts b/src/big.ts
--- a/src/big.ts
+++ b/src/big.ts
@@ -1,5 +1,5 @@
+line 1
+line 2
@@ -100,5 +100,5 @@
+line 100
+line 101
`)[0];

    const chunks = splitHunksIntoChunks(file, 2);
    expect(chunks.length).toBe(2);
  });
});
