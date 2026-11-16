import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client.js';
import type { Review, Finding, ReviewFile } from '../../../shared/types.js';
import { formatRelativeTime, formatExactTime, shortenSha } from '../utils.js';
import { DiffViewer } from '../components/DiffViewer.js';
import { SeverityLabel, ReviewStatusBadge } from '../components/StatusBadge.js';

interface ReviewDetailPageProps {
  reviewId: string;
  onBack: () => void;
}

export function ReviewDetailPage({ reviewId, onBack }: ReviewDetailPageProps) {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFindingId, setActiveFindingId] = useState<string | undefined>(undefined);
  const [copiedSha, setCopiedSha] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getReviewById(reviewId)
      .then(res => {
        setReview(res.review);
        if (res.review.findings && res.review.findings.length > 0) {
          setActiveFindingId(res.review.findings[0].id);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load review detail:', err);
        setLoading(false);
      });
  }, [reviewId]);

  // Flat list of all findings
  const allFindings: Finding[] = useMemo(() => review?.findings || [], [review]);

  // Keyboard navigation for j/k between findings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'Escape') {
        onBack();
        return;
      }

      if (allFindings.length === 0) return;

      const currentIndex = allFindings.findIndex((f: Finding) => f.id === activeFindingId);

      if (e.key === 'j') {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, allFindings.length - 1);
        const nextFinding = allFindings[nextIndex];
        if (nextFinding?.id) {
          setActiveFindingId(nextFinding.id);
          scrollToFinding(nextFinding.id);
        }
      } else if (e.key === 'k') {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        const prevFinding = allFindings[prevIndex];
        if (prevFinding?.id) {
          setActiveFindingId(prevFinding.id);
          scrollToFinding(prevFinding.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allFindings, activeFindingId, onBack]);

  const scrollToFinding = (id: string) => {
    const el = document.getElementById(`finding-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const copySha = () => {
    if (review?.commitSha) {
      navigator.clipboard.writeText(review.commitSha);
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 1800);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 text-center font-mono text-xs text-[var(--ink-muted)]">
        Loading review detail #{reviewId}...
      </div>
    );
  }

  if (!review) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <button
          onClick={onBack}
          className="font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] mb-4"
        >
          ← Return to reviews
        </button>
        <div className="p-8 hairline-border bg-[var(--bg-card)]">
          <h2 className="font-serif text-lg font-bold">Review Not Found</h2>
          <p className="font-sans text-xs text-[var(--ink-muted)] mt-1">
            Could not retrieve review record with identifier {reviewId}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Back Button & Top Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer flex items-center space-x-1"
        >
          <span>←</span>
          <span>Return to ledger</span>
          <span className="kbd-badge ml-1 text-[10px]">esc</span>
        </button>

        <div className="text-xs font-mono text-[var(--ink-faint)]">
          Finding navigation: <span className="kbd-badge">j</span> next · <span className="kbd-badge">k</span> prev
        </div>
      </div>

      {/* PR Header Banner */}
      <div className="hairline-border bg-[var(--bg-card)] p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center space-x-2 text-xs font-mono text-[var(--ink-muted)] mb-2">
              <span className="font-semibold text-[var(--ink)]">
                {review.repoOwner}/{review.repoName}
              </span>
              <span>·</span>
              <span className="font-bold text-[var(--ink)]">#{review.prNumber}</span>
              <span>·</span>
              <span>by {review.author}</span>
              <span>·</span>
              <span title={formatExactTime(review.createdAt)}>
                reviewed {formatRelativeTime(review.createdAt)}
              </span>
            </div>

            <h1 className="font-serif text-2xl font-bold text-[var(--ink)] leading-snug">
              {review.prTitle}
            </h1>

            {/* Commit & Meta */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-[var(--ink-muted)]">
              <div className="flex items-center space-x-1.5">
                <span className="text-[var(--ink-faint)]">commit:</span>
                <span
                  onClick={copySha}
                  className="text-[var(--ink)] hover:text-[var(--red-pen)] cursor-copy underline decoration-dotted font-bold"
                  title="Click to copy SHA"
                >
                  {copiedSha ? 'copied!' : shortenSha(review.commitSha)}
                </span>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-[var(--ink-faint)]">status:</span>
                <ReviewStatusBadge status={review.status} />
              </div>

              {review.prUrl && (
                <a
                  href={review.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--ink-muted)] hover:text-[var(--red-pen)] underline"
                >
                  view on github ↗
                </a>
              )}
            </div>
          </div>

          {/* Severity Scoreboard */}
          <div className="bg-[var(--bg-subtle)] hairline-border p-4 flex flex-col justify-center min-w-[200px]">
            <div className="text-[11px] font-mono uppercase text-[var(--ink-faint)] tracking-wider mb-2">
              Review Summary
            </div>
            <div className="font-mono text-sm font-bold text-[var(--ink)] mb-2">
              {review.findingsCount} {review.findingsCount === 1 ? 'finding' : 'findings'}
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-[var(--red-pen)] font-bold">CRITICAL:</span>
                <span className="font-bold text-[var(--red-pen)]">{review.criticalCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink)] font-semibold">HIGH:</span>
                <span className="font-semibold text-[var(--ink)]">{review.highCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink)]">MEDIUM:</span>
                <span>{review.mediumCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">LOW:</span>
                <span className="text-[var(--ink-muted)]">{review.lowCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Left Findings List Index, Right Files Diff */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Findings Index */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            <div className="hairline-border bg-[var(--bg-card)] p-4">
              <div className="text-xs font-mono uppercase tracking-wider text-[var(--ink-muted)] font-bold hairline-b pb-2 mb-3">
                Findings Index ({allFindings.length})
              </div>

              {allFindings.length === 0 ? (
                <div className="text-xs font-mono text-[var(--ink-faint)] italic py-2">
                  No issues flagged in this PR.
                </div>
              ) : (
                <div className="space-y-2">
                  {allFindings.map((f: Finding, i: number) => {
                    const isActive = f.id === activeFindingId;
                    return (
                      <div
                        key={f.id || i}
                        onClick={() => {
                          if (f.id) {
                            setActiveFindingId(f.id);
                            scrollToFinding(f.id);
                          }
                        }}
                        className={`p-2 hairline-border cursor-pointer text-left transition-colors ${
                          isActive
                            ? 'bg-[var(--bg-subtle)] border-l-2 border-l-[var(--red-pen)]'
                            : 'bg-[var(--bg-paper)] hover:bg-[var(--bg-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                          <SeverityLabel severity={f.severity} />
                          <span className="text-[var(--ink-faint)]">
                            L{f.lineStart}
                          </span>
                        </div>
                        <div className="font-serif text-xs font-semibold text-[var(--ink)] line-clamp-2">
                          {f.title}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--ink-muted)] mt-1 truncate">
                          {f.file.split('/').pop()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Files Diffs */}
        <div className="lg:col-span-3">
          <div className="text-xs font-mono uppercase tracking-wider text-[var(--ink-muted)] font-bold mb-3">
            Changed Files & Annotations ({review.files?.length || 0})
          </div>

          {review.files && review.files.length > 0 ? (
            review.files.map((file: ReviewFile) => {
              const fileFindings = allFindings.filter((f: Finding) => f.file === file.filePath);
              return (
                <DiffViewer
                  key={file.filePath}
                  filePath={file.filePath}
                  diffContent={file.diffContent}
                  findings={fileFindings}
                  activeFindingId={activeFindingId}
                  onSelectFinding={setActiveFindingId}
                />
              );
            })
          ) : (
            <div className="p-8 hairline-border bg-[var(--bg-card)] font-mono text-xs text-[var(--ink-muted)]">
              No changed file hunks recorded for this review.
            </div>
          )}

          {/* Summary Markdown Footer */}
          {review.summaryMd && (
            <div className="mt-8 hairline-border bg-[var(--bg-card)] p-6">
              <div className="text-xs font-mono uppercase tracking-wider text-[var(--ink-muted)] font-bold hairline-b pb-2 mb-4">
                Review Summary Comment Output
              </div>
              <div className="font-mono text-xs text-[var(--ink)] whitespace-pre-wrap leading-relaxed">
                {review.summaryMd}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
