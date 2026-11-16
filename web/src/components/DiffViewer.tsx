import React, { useState } from 'react';
import type { Finding } from '../../../shared/types.js';
import { SeverityLabel } from './StatusBadge.js';

interface DiffViewerProps {
  filePath: string;
  diffContent: string;
  findings: Finding[];
  activeFindingId?: string;
  onSelectFinding?: (id: string) => void;
}

interface ParsedDiffLine {
  oldLine?: number;
  newLine?: number;
  content: string;
  type: 'add' | 'del' | 'context' | 'header';
}

export function DiffViewer({
  filePath,
  diffContent,
  findings,
  activeFindingId,
  onSelectFinding
}: DiffViewerProps) {
  const [copiedFixId, setCopiedFixId] = useState<string | null>(null);

  // Parse lines from raw diff
  const parsedLines: ParsedDiffLine[] = [];
  const lines = diffContent.split(/\r?\n/);

  let currentOld = 0;
  let currentNew = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentOld = parseInt(match[1], 10);
        currentNew = parseInt(match[2], 10);
      }
      parsedLines.push({
        type: 'header',
        content: line
      });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      parsedLines.push({
        newLine: currentNew,
        type: 'add',
        content: line.slice(1)
      });
      currentNew++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      parsedLines.push({
        oldLine: currentOld,
        type: 'del',
        content: line.slice(1)
      });
      currentOld++;
    } else if (line.startsWith(' ')) {
      parsedLines.push({
        oldLine: currentOld,
        newLine: currentNew,
        type: 'context',
        content: line.slice(1)
      });
      currentOld++;
      currentNew++;
    } else if (!line.startsWith('diff --git') && !line.startsWith('index') && !line.startsWith('---') && !line.startsWith('+++')) {
      // General metadata or file header lines
      parsedLines.push({
        type: 'header',
        content: line
      });
    }
  }

  // Create lookup of findings by end line (or start line)
  const findingsByLine = new Map<number, Finding[]>();
  for (const f of findings) {
    const targetLine = f.lineEnd || f.lineStart;
    const existing = findingsByLine.get(targetLine) || [];
    existing.push(f);
    findingsByLine.set(targetLine, existing);
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFixId(id);
    setTimeout(() => setCopiedFixId(null), 2000);
  };

  return (
    <div className="font-mono text-xs hairline-border bg-[var(--bg-card)] my-6 overflow-hidden">
      {/* File Header Bar */}
      <div className="hairline-b bg-[var(--bg-subtle)] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-[var(--ink)]">{filePath}</span>
          {findings.length > 0 && (
            <span className="text-[var(--red-pen)] font-bold text-[11px]">
              {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
            </span>
          )}
        </div>
        <div className="text-[var(--ink-faint)] text-[11px]">
          unified diff
        </div>
      </div>

      {/* Code Table */}
      <div className="overflow-x-auto divide-y divide-[var(--border-hairline)] divide-opacity-30">
        {parsedLines.map((line, idx) => {
          if (line.type === 'header') {
            return (
              <div
                key={`h-${idx}`}
                className="bg-[var(--bg-subtle)]/50 text-[var(--ink-muted)] py-1 px-4 italic text-[11px]"
              >
                {line.content}
              </div>
            );
          }

          const lineFindings = line.newLine ? findingsByLine.get(line.newLine) : undefined;
          const isFlagged = Boolean(lineFindings && lineFindings.length > 0);
          const hasActiveFinding = lineFindings?.some(f => f.id === activeFindingId);

          return (
            <React.Fragment key={`line-${idx}`}>
              <div
                className={`flex items-start transition-colors ${
                  isFlagged
                    ? 'bg-[var(--bg-accent-tint)] redline-gutter'
                    : line.type === 'add'
                    ? 'bg-[var(--bg-green-tint)]/40'
                    : line.type === 'del'
                    ? 'bg-red-500/5'
                    : 'hover:bg-[var(--bg-subtle)]/40'
                } ${hasActiveFinding ? 'ring-1 ring-[var(--red-pen)]' : ''}`}
              >
                {/* Line numbers gutter */}
                <div className="w-16 flex-shrink-0 select-none text-[var(--ink-faint)] text-right pr-4 py-1 flex justify-between hairline-r border-[var(--border-hairline)]/40 bg-[var(--bg-subtle)]/20">
                  <span className="w-7 text-right">{line.oldLine ?? ''}</span>
                  <span className="w-7 text-right">{line.newLine ?? ''}</span>
                </div>

                {/* Diff line marker */}
                <div className="w-6 text-center flex-shrink-0 py-1 text-[var(--ink-muted)] select-none">
                  {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                </div>

                {/* Line text */}
                <div
                  className={`flex-1 py-1 pr-4 whitespace-pre overflow-x-auto ${
                    isFlagged ? 'redline-strike font-medium' : ''
                  } ${line.type === 'del' ? 'line-through text-[var(--ink-muted)]' : 'text-[var(--ink)]'}`}
                >
                  {line.content || ' '}
                </div>
              </div>

              {/* Redline Proofreader Margin Mark Note */}
              {lineFindings &&
                lineFindings.map(finding => {
                  const isActive = finding.id === activeFindingId;
                  return (
                    <div
                      key={finding.id || finding.title}
                      id={`finding-${finding.id}`}
                      onClick={() => finding.id && onSelectFinding?.(finding.id)}
                      className={`ml-16 my-2 mr-4 p-3.5 bg-[var(--bg-paper)] hairline-border redline-gutter cursor-pointer transition-all ${
                        isActive
                          ? 'ring-2 ring-[var(--red-pen)] shadow-sm'
                          : 'hover:border-[var(--ink)]'
                      }`}
                    >
                      {/* Margin Header */}
                      <div className="flex items-baseline justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <SeverityLabel severity={finding.severity} />
                          <span className="font-mono text-xs text-[var(--ink-muted)] uppercase">
                            [{finding.category}]
                          </span>
                          <span className="font-mono text-xs text-[var(--ink-faint)]">
                            L{finding.lineStart === finding.lineEnd ? finding.lineStart : `${finding.lineStart}-${finding.lineEnd}`}
                          </span>
                        </div>
                      </div>

                      {/* Finding Title & Explanation */}
                      <div className="font-serif text-sm font-semibold text-[var(--ink)] mb-1">
                        {finding.title}
                      </div>
                      <p className="font-sans text-xs text-[var(--ink-muted)] leading-relaxed mb-3">
                        {finding.explanation}
                      </p>

                      {/* Suggested Fix Line */}
                      {finding.suggestedFix && (
                        <div className="mt-2 pt-2 hairline-t border-dashed">
                          <div className="flex items-center justify-between text-[11px] text-[var(--ink-faint)] font-mono mb-1">
                            <span>Suggested replacement:</span>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                copyToClipboard(finding.suggestedFix!, finding.id || finding.title);
                              }}
                              className="hover:text-[var(--ink)] underline cursor-pointer"
                            >
                              {copiedFixId === (finding.id || finding.title) ? 'Copied!' : 'Copy fix'}
                            </button>
                          </div>
                          <div className="bg-[var(--bg-subtle)] p-2 hairline-border font-mono text-xs text-[var(--ink)] whitespace-pre overflow-x-auto">
                            <code>{finding.suggestedFix}</code>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
