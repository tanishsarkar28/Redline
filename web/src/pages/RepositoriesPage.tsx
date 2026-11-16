import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { Repository } from '../../../shared/types.js';
import { formatRelativeTime, formatExactTime } from '../utils.js';

export function RepositoriesPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [configText, setConfigText] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const loadRepos = () => {
    setLoading(true);
    api.getRepositories()
      .then(res => {
        setRepos(res.repos);
        if (res.repos.length > 0 && !selectedRepo) {
          setSelectedRepo(res.repos[0]);
          setConfigText(res.repos[0].configJson || '{\n  "model": "gpt-4o-mini",\n  "severity_threshold": "low"\n}');
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load repositories:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRepos();
  }, []);

  const handleSelectRepo = (repo: Repository) => {
    setSelectedRepo(repo);
    setConfigText(repo.configJson || '{\n  "model": "gpt-4o-mini",\n  "severity_threshold": "low"\n}');
    setSaveStatus(null);
  };

  const handleSaveConfig = async () => {
    if (!selectedRepo) return;
    try {
      const parsed = JSON.parse(configText);
      await api.updateRepoConfig(selectedRepo.owner, selectedRepo.name, parsed);
      setSaveStatus('Configuration saved successfully.');
      setTimeout(() => setSaveStatus(null), 3000);
      loadRepos();
    } catch (err: any) {
      setSaveStatus(`Error saving: ${err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="hairline-b pb-4 mb-6">
        <h1 className="font-serif text-2xl font-bold text-[var(--ink)]">
          Connected Repositories
        </h1>
        <p className="font-mono text-xs text-[var(--ink-muted)] mt-1">
          {repos.length} repositories receiving webhooks and workflow triggers
        </p>
      </div>

      {loading ? (
        <div className="p-12 font-mono text-xs text-[var(--ink-muted)] text-center">
          Loading repositories...
        </div>
      ) : repos.length === 0 ? (
        <div className="p-8 hairline-border bg-[var(--bg-card)]">
          <h2 className="font-serif text-base font-bold">No Repositories Connected Yet</h2>
          <p className="font-sans text-xs text-[var(--ink-muted)] mt-2 leading-relaxed">
            Configure your GitHub webhook URL to point to <code className="font-mono bg-[var(--bg-subtle)] px-1">http://your-server:3000/api/webhooks/github</code>, or add the Redline Action to your workflow.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Repo List */}
          <div className="lg:col-span-1 space-y-3">
            <div className="font-mono text-xs uppercase tracking-wider text-[var(--ink-muted)] font-bold mb-2">
              Repositories List
            </div>
            {repos.map(r => {
              const isSelected = selectedRepo?.id === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => handleSelectRepo(r)}
                  className={`p-4 hairline-border cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[var(--bg-card)] border-l-2 border-l-[var(--red-pen)]'
                      : 'bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-bold text-[var(--ink)]">
                      {r.owner}/{r.name}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        r.webhookActive ? 'bg-[var(--red-pen)]' : 'bg-[var(--ink-faint)]'
                      }`}
                      title={r.webhookActive ? 'Webhook active' : 'Webhook inactive'}
                    />
                  </div>
                  <div className="text-xs font-mono text-[var(--ink-muted)] flex items-center justify-between mt-2">
                    <span>branch: {r.defaultBranch}</span>
                    <span title={formatExactTime(r.lastReviewAt)}>
                      {r.lastReviewAt ? `reviewed ${formatRelativeTime(r.lastReviewAt)}` : 'unreviewed'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Repository Config Inspector & Editor */}
          <div className="lg:col-span-2">
            {selectedRepo ? (
              <div className="hairline-border bg-[var(--bg-card)] p-6">
                <div className="flex items-center justify-between hairline-b pb-4 mb-4">
                  <div>
                    <h2 className="font-serif text-lg font-bold text-[var(--ink)]">
                      {selectedRepo.owner}/{selectedRepo.name}
                    </h2>
                    <span className="font-mono text-xs text-[var(--ink-muted)]">
                      Default branch: {selectedRepo.defaultBranch}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-[var(--ink-muted)]">
                    Created: {formatExactTime(selectedRepo.createdAt)}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-[var(--ink-muted)] font-bold mb-2 flex items-center justify-between">
                    <span>Repository Review Configuration (.redline.yml)</span>
                    <span className="text-[11px] text-[var(--ink-faint)] lowercase">json override</span>
                  </div>
                  <textarea
                    value={configText}
                    onChange={e => setConfigText(e.target.value)}
                    rows={12}
                    className="w-full font-mono text-xs p-3 bg-[var(--bg-subtle)] hairline-border text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] resize-y rounded-none"
                    placeholder="Enter configuration JSON..."
                  />
                </div>

                {saveStatus && (
                  <div className="mb-4 p-2 font-mono text-xs bg-[var(--bg-subtle)] hairline-border text-[var(--ink)]">
                    {saveStatus}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--ink-faint)]">
                    Target repo can also define <code className="bg-[var(--bg-subtle)] px-1">.redline.yml</code> in root.
                  </span>
                  <button
                    onClick={handleSaveConfig}
                    className="font-mono text-xs uppercase px-4 py-2 bg-[var(--ink)] text-[var(--bg-paper)] hover:bg-[var(--red-pen)] transition-colors rounded-none cursor-pointer"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 hairline-border bg-[var(--bg-card)] font-mono text-xs text-[var(--ink-muted)]">
                Select a repository from the left panel to inspect its settings.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
