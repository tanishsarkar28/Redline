import React, { useEffect, useState, useMemo, useRef } from 'react';
import { api } from '../api/client.js';
import type { Review, Severity } from '../../../shared/types.js';
import { formatRelativeTime, formatExactTime, shortenSha } from '../utils.js';
import { ReviewStatusBadge, SeverityLabel } from '../components/StatusBadge.js';

interface ReviewsPageProps {
  onSelectReview: (reviewId: string) => void;
  filterInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ReviewsPage({ onSelectReview, filterInputRef }: ReviewsPageProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  const loadReviews = () => {
    setLoading(true);
    api.getReviews()
      .then(res => {
        setReviews(res.reviews);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load reviews:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const reposList = useMemo(() => {
    const set = new Set<string>();
    reviews.forEach(r => set.add(`${r.repoOwner}/${r.repoName}`));
    return Array.from(set);
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      const matchesRepo = selectedRepo === 'all' || `${r.repoOwner}/${r.repoName}` === selectedRepo;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        r.prTitle.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.repoName.toLowerCase().includes(q) ||
        r.commitSha.toLowerCase().includes(q) ||
        `#${r.prNumber}`.includes(q);
      return matchesRepo && matchesSearch;
    });
  }, [reviews, selectedRepo, searchQuery]);

  // Keyboard navigation for j/k and Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'j') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, Math.max(0, filteredReviews.length - 1)));
      } else if (e.key === 'k') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (filteredReviews[selectedIndex]) {
          onSelectReview(filteredReviews[selectedIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredReviews, selectedIndex, onSelectReview]);

  const handleSimulate = async () => {
    setIsSimulating(true);
    try {
      const res = await api.runSimulation();
      if (res.review) {
        setReviews(prev => [res.review, ...prev]);
        onSelectReview(res.review.id);
      }
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const copySha = (sha: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 1800);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-baseline justify-between hairline-b pb-4 mb-6 gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[var(--ink)]">
            Pull Request Reviews
          </h1>
          <p className="font-mono text-xs text-[var(--ink-muted)] mt-1">
            {filteredReviews.length} pull {filteredReviews.length === 1 ? 'request' : 'requests'} recorded · dense ledger view
          </p>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <input
              ref={filterInputRef as any}
              type="text"
              placeholder="Filter PRs... [/]"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-[var(--bg-card)] hairline-border px-3 py-1.5 text-xs font-mono w-48 lg:w-64 text-[var(--ink)] placeholder-[var(--ink-faint)] focus:outline-none focus:border-[var(--ink)] rounded-none"
            />
            <span className="absolute right-2 top-2 kbd-badge text-[10px]">/</span>
          </div>

          <select
            value={selectedRepo}
            onChange={e => setSelectedRepo(e.target.value)}
            className="bg-[var(--bg-card)] hairline-border px-3 py-1.5 text-xs font-mono text-[var(--ink)] rounded-none focus:outline-none"
          >
            <option value="all">All Repositories</option>
            {reposList.map(repo => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>

          <button
            onClick={handleSimulate}
            disabled={isSimulating}
            className="font-mono text-xs uppercase tracking-wider py-1.5 px-3 bg-[var(--ink)] text-[var(--bg-paper)] hover:bg-[var(--red-pen)] transition-colors rounded-none disabled:opacity-50 cursor-pointer"
          >
            {isSimulating ? 'Running...' : '+ Run Sample PR'}
          </button>
        </div>
      </div>

      {/* Reviews Table */}
      {loading ? (
        <div className="p-12 text-center font-mono text-xs text-[var(--ink-muted)]">
          Loading pull request ledger...
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="p-12 hairline-border bg-[var(--bg-card)] text-left">
          <div className="font-serif text-base font-bold text-[var(--ink)] mb-1">
            No reviews matching criteria.
          </div>
          <p className="font-sans text-xs text-[var(--ink-muted)] mb-4">
            Try adjusting your search query, selecting another repository, or trigger a sample review to populate data.
          </p>
          <button
            onClick={handleSimulate}
            className="font-mono text-xs uppercase px-3 py-1.5 bg-[var(--ink)] text-[var(--bg-paper)] rounded-none hover:bg-[var(--red-pen)]"
          >
            Run Sample PR Simulation
          </button>
        </div>
      ) : (
        <div className="hairline-border bg-[var(--bg-card)] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="hairline-b bg-[var(--bg-subtle)] text-[11px] font-mono uppercase text-[var(--ink-muted)] tracking-wider">
                <th className="py-2.5 px-4 w-12 text-center">#</th>
                <th className="py-2.5 px-4">Repository & PR</th>
                <th className="py-2.5 px-4">Author</th>
                <th className="py-2.5 px-4">Findings Breakdown</th>
                <th className="py-2.5 px-4">Commit</th>
                <th className="py-2.5 px-4 text-right">Age</th>
                <th className="py-2.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)] divide-opacity-40 text-xs font-mono">
              {filteredReviews.map((rev, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <tr
                    key={rev.id}
                    onClick={() => onSelectReview(rev.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--bg-subtle)] redline-gutter'
                        : 'hover:bg-[var(--bg-subtle)]/50'
                    }`}
                  >
                    {/* Index or selected marker */}
                    <td className="py-3 px-4 text-center text-[var(--ink-faint)]">
                      {isSelected ? (
                        <span className="text-[var(--red-pen)] font-bold">›</span>
                      ) : (
                        idx + 1
                      )}
                    </td>

                    {/* Repo & PR Title */}
                    <td className="py-3 px-4">
                      <div className="flex items-baseline space-x-2">
                        <span className="text-[var(--ink-muted)] font-normal text-[11px]">
                          {rev.repoOwner}/{rev.repoName}
                        </span>
                        <span className="font-bold text-[var(--ink)]">
                          #{rev.prNumber}
                        </span>
                      </div>
                      <div className="font-serif text-sm font-semibold text-[var(--ink)] hover:text-[var(--red-pen)] mt-0.5 line-clamp-1">
                        {rev.prTitle}
                      </div>
                    </td>

                    {/* Author */}
                    <td className="py-3 px-4 text-[var(--ink-muted)]">
                      {rev.author}
                    </td>

                    {/* Findings Breakdown */}
                    <td className="py-3 px-4">
                      {rev.findingsCount === 0 ? (
                        <span className="text-[var(--ink-faint)] italic">clean (0)</span>
                      ) : (
                        <div className="flex items-center space-x-3">
                          <span className="font-bold text-[var(--ink)]">
                            {rev.findingsCount} total
                          </span>
                          {rev.criticalCount > 0 && (
                            <span className="text-[var(--red-pen)] font-bold text-[11px]">
                              {rev.criticalCount} crit
                            </span>
                          )}
                          {rev.highCount > 0 && (
                            <span className="font-semibold text-[var(--ink)] text-[11px]">
                              {rev.highCount} high
                            </span>
                          )}
                          {rev.mediumCount > 0 && (
                            <span className="text-[var(--ink-muted)] text-[11px]">
                              {rev.mediumCount} med
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Commit SHA */}
                    <td className="py-3 px-4">
                      <span
                        onClick={e => copySha(rev.commitSha, e)}
                        className="font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-copy underline decoration-dotted"
                        title="Click to copy SHA"
                      >
                        {copiedSha === rev.commitSha ? 'copied' : shortenSha(rev.commitSha)}
                      </span>
                    </td>

                    {/* Time */}
                    <td
                      className="py-3 px-4 text-right text-[var(--ink-muted)]"
                      title={formatExactTime(rev.createdAt)}
                    >
                      {formatRelativeTime(rev.createdAt)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      <ReviewStatusBadge status={rev.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer hint */}
      <div className="mt-4 flex items-center justify-between text-[11px] font-mono text-[var(--ink-faint)]">
        <div>
          Navigate rows with <span className="kbd-badge">j</span> / <span className="kbd-badge">k</span>, press <span className="kbd-badge">Enter</span> to inspect diff
        </div>
        <div>
          Showing {filteredReviews.length} entries
        </div>
      </div>
    </div>
  );
}
