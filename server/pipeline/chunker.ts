import type { ParsedDiffFile, ParsedDiffHunk } from '../../shared/types.js';

// Fast glob pattern matcher (supports *, **, ?, etc.)
export function matchesGlob(filepath: string, pattern: string): boolean {
  const pathNorm = filepath.replace(/\\/g, '/').replace(/^\.\//, '');
  const patNorm = pattern.replace(/\\/g, '/').replace(/^\.\//, '');

  if (patNorm === pathNorm) return true;

  // If pattern starts with **/, test both full path and subpattern
  if (patNorm.startsWith('**/')) {
    const subPattern = patNorm.slice(3);
    if (matchesGlob(pathNorm, subPattern)) return true;
  }

  // If pattern is just a filename (no slashes), test against basename
  if (!patNorm.includes('/')) {
    const basename = pathNorm.split('/').pop() || pathNorm;
    if (basename !== pathNorm && matchesGlob(basename, patNorm)) return true;
  }

  // Tokenize pattern
  let regex = '';
  let i = 0;
  while (i < patNorm.length) {
    if (patNorm.slice(i, i + 3) === '**/') {
      regex += '(?:.*\\/)?';
      i += 3;
    } else if (patNorm.slice(i, i + 2) === '**') {
      regex += '.*';
      i += 2;
    } else if (patNorm[i] === '*') {
      regex += '[^\\/]*';
      i++;
    } else if (patNorm[i] === '?') {
      regex += '[^\\/]';
      i++;
    } else if (['.', '+', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\'].includes(patNorm[i])) {
      regex += '\\' + patNorm[i];
      i++;
    } else {
      regex += patNorm[i];
      i++;
    }
  }

  try {
    return new RegExp(`^${regex}$`, 'i').test(pathNorm);
  } catch {
    return false;
  }
}

export function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
  for (const pattern of ignorePatterns) {
    if (matchesGlob(filePath, pattern)) {
      return true;
    }
  }
  return false;
}

export function parseUnifiedDiff(diffText: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  if (!diffText || !diffText.trim()) return files;

  // Split by diff --git
  const rawFileChunks = diffText.split(/^diff --git /m);

  for (const chunk of rawFileChunks) {
    if (!chunk.trim()) continue;

    const lines = chunk.split(/\r?\n/);
    const firstLine = lines[0]; // e.g. "a/src/auth.ts b/src/auth.ts"
    const pathsMatch = firstLine.match(/^a\/(.*?)\s+b\/(.*?)$/);

    const oldPath = pathsMatch ? pathsMatch[1] : 'unknown';
    const newPath = pathsMatch ? pathsMatch[2] : 'unknown';

    let isBinary = false;
    let isDeleted = false;
    let isNew = false;

    // Check headers
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];
      if (line.startsWith('new file mode')) isNew = true;
      if (line.startsWith('deleted file mode')) isDeleted = true;
      if (line.includes('Binary files') || line.includes('GIT binary patch')) isBinary = true;
    }

    const hunks: ParsedDiffHunk[] = [];
    let currentHunk: ParsedDiffHunk | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Hunk header: @@ -1,5 +1,9 @@ optional function header
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }

        const oldStart = parseInt(hunkMatch[1], 10);
        const oldLines = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
        const newStart = parseInt(hunkMatch[3], 10);
        const newLines = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

        currentHunk = {
          oldStart,
          oldLines,
          newStart,
          newLines,
          header: line,
          lines: [],
          newLineToDiffIndex: new Map(),
          changedNewLines: new Set()
        };
        continue;
      }

      if (currentHunk) {
        // Hunk body line
        if (line.startsWith('+') && !line.startsWith('+++')) {
          const hunkLineIdx = currentHunk.lines.length;
          currentHunk.lines.push(line);
          const currentNewLine = currentHunk.newStart + countAddedOrContextLines(currentHunk.lines) - 1;
          currentHunk.newLineToDiffIndex.set(currentNewLine, hunkLineIdx);
          currentHunk.changedNewLines.add(currentNewLine);
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push(line);
        } else if (line.startsWith(' ')) {
          const hunkLineIdx = currentHunk.lines.length;
          currentHunk.lines.push(line);
          const currentNewLine = currentHunk.newStart + countAddedOrContextLines(currentHunk.lines) - 1;
          currentHunk.newLineToDiffIndex.set(currentNewLine, hunkLineIdx);
        }
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    files.push({
      oldPath,
      newPath: isDeleted ? oldPath : newPath,
      isBinary,
      isDeleted,
      isNew,
      hunks,
      rawDiff: 'diff --git ' + chunk
    });
  }

  return files;
}

function countAddedOrContextLines(lines: string[]): number {
  let count = 0;
  for (const l of lines) {
    if (l.startsWith('+') || l.startsWith(' ')) {
      count++;
    }
  }
  return count;
}

export interface ChunkedReviewPackage {
  filesToReview: ParsedDiffFile[];
  skippedFiles: Array<{ path: string; reason: string }>;
  totalFiles: number;
}

export function filterAndCapDiffFiles(
  parsedFiles: ParsedDiffFile[],
  ignorePatterns: string[],
  maxFiles = 25
): ChunkedReviewPackage {
  const filesToReview: ParsedDiffFile[] = [];
  const skippedFiles: Array<{ path: string; reason: string }> = [];

  for (const file of parsedFiles) {
    const path = file.newPath;

    if (file.isBinary) {
      skippedFiles.push({ path, reason: 'Binary file' });
      continue;
    }

    if (file.isDeleted) {
      skippedFiles.push({ path, reason: 'Deleted file' });
      continue;
    }

    if (shouldIgnoreFile(path, ignorePatterns)) {
      skippedFiles.push({ path, reason: 'Ignored by pattern' });
      continue;
    }

    if (file.hunks.length === 0) {
      skippedFiles.push({ path, reason: 'No hunks/changes' });
      continue;
    }

    if (filesToReview.length >= maxFiles) {
      skippedFiles.push({ path, reason: `Exceeded max_files limit (${maxFiles})` });
      continue;
    }

    filesToReview.push(file);
  }

  return {
    filesToReview,
    skippedFiles,
    totalFiles: parsedFiles.length
  };
}

// Split very large files into batches of hunks if tokens exceed threshold
export function splitHunksIntoChunks(
  file: ParsedDiffFile,
  maxLinesPerChunk = 400
): Array<{ hunks: ParsedDiffHunk[]; chunkDiff: string }> {
  if (file.hunks.length === 0) return [];

  const chunks: Array<{ hunks: ParsedDiffHunk[]; chunkDiff: string }> = [];
  let currentHunkBatch: ParsedDiffHunk[] = [];
  let currentLines = 0;

  for (const hunk of file.hunks) {
    if (currentLines + hunk.lines.length > maxLinesPerChunk && currentHunkBatch.length > 0) {
      chunks.push({
        hunks: currentHunkBatch,
        chunkDiff: buildDiffForHunks(file.newPath, currentHunkBatch)
      });
      currentHunkBatch = [hunk];
      currentLines = hunk.lines.length;
    } else {
      currentHunkBatch.push(hunk);
      currentLines += hunk.lines.length;
    }
  }

  if (currentHunkBatch.length > 0) {
    chunks.push({
      hunks: currentHunkBatch,
      chunkDiff: buildDiffForHunks(file.newPath, currentHunkBatch)
    });
  }

  return chunks;
}

function buildDiffForHunks(filePath: string, hunks: ParsedDiffHunk[]): string {
  const parts: string[] = [`diff --git a/${filePath} b/${filePath}`];
  for (const hunk of hunks) {
    parts.push(hunk.header);
    parts.push(...hunk.lines);
  }
  return parts.join('\n');
}
