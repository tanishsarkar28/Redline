import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function SettingsPage() {
  const [model, setModel] = useState('gpt-4o-mini');
  const [severityThreshold, setSeverityThreshold] = useState('low');
  const [maxFiles, setMaxFiles] = useState(25);
  const [ignorePatterns, setIgnorePatterns] = useState(
    '**/*.lock\npackage-lock.json\nyarn.lock\npnpm-lock.yaml\nCargo.lock\ndist/**\nbuild/**\nnode_modules/**\n**/*.min.js\n**/*.map'
  );
  const [envStatus, setEnvStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Simulation test diff
  const mockGhToken = ['ghp', '1234567890abcdefghijklmnopqrstuvwxyz'].join('_');
  const [testDiff, setTestDiff] = useState(`diff --git a/src/auth/secret.ts b/src/auth/secret.ts
new file mode 100644
--- /dev/null
+++ b/src/auth/secret.ts
@@ -0,0 +1,12 @@
+import crypto from 'crypto';
+
+// Hardcoded secret credential
+const GITHUB_TOKEN = "${mockGhToken}";
+
+export function checkHash(a: string, b: string) {
+  // Vulnerable comparison
+  if (a === b) {
+    return true;
+  }
+  return false;
+}`);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  useEffect(() => {
    api.getSettings()
      .then(res => {
        const s = res.settings;
        setModel(s.model);
        setSeverityThreshold(s.defaultSeverityThreshold);
        setMaxFiles(s.defaultMaxFiles);
        setEnvStatus(s);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load settings:', err);
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateSettings({
        model,
        defaultSeverityThreshold: severityThreshold,
        defaultMaxFiles: maxFiles
      });
      setStatusMessage('Settings updated successfully.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage(`Failed to update settings: ${err.message}`);
    }
  };

  const handleRunSimulation = async () => {
    setSimulating(true);
    setSimulationResult(null);
    try {
      const res = await api.runSimulation({
        diffText: testDiff,
        prTitle: 'test(sandbox): test diff simulation run'
      });
      setSimulationResult(res.review);
    } catch (err: any) {
      setSimulationResult({ error: err.message });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="hairline-b pb-4 mb-8">
        <h1 className="font-serif text-2xl font-bold text-[var(--ink)]">
          Engine Settings & Diagnostic Sandbox
        </h1>
        <p className="font-mono text-xs text-[var(--ink-muted)] mt-1">
          Review pipeline parameters, authentication credentials, and live simulation runner
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Review Configuration Form */}
        <div className="space-y-6">
          <form onSubmit={handleSave} className="hairline-border bg-[var(--bg-card)] p-6 space-y-4">
            <div className="font-mono text-xs uppercase tracking-wider text-[var(--ink-muted)] font-bold hairline-b pb-2 mb-4">
              Default Pipeline Parameters
            </div>

            <div>
              <label className="block text-xs font-mono font-bold text-[var(--ink)] mb-1">
                OpenAI Review Model
              </label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full p-2 text-xs font-mono bg-[var(--bg-subtle)] hairline-border text-[var(--ink)] focus:outline-none rounded-none"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (recommended, fast & structured)</option>
                <option value="gpt-4o">gpt-4o (comprehensive reasoning)</option>
                <option value="o1-mini">o1-mini (deep reasoning)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold text-[var(--ink)] mb-1">
                Minimum Severity Threshold
              </label>
              <select
                value={severityThreshold}
                onChange={e => setSeverityThreshold(e.target.value)}
                className="w-full p-2 text-xs font-mono bg-[var(--bg-subtle)] hairline-border text-[var(--ink)] focus:outline-none rounded-none"
              >
                <option value="low">low (report all bugs, styles, performance, secrets)</option>
                <option value="medium">medium (skip purely stylistic suggestions)</option>
                <option value="high">high (only critical bugs and security vulnerabilities)</option>
                <option value="critical">critical (only critical secrets & direct exploits)</option>
              </select>
              <span className="text-[11px] font-mono text-[var(--ink-faint)] mt-1 block">
                Findings below this threshold will not post inline comments to GitHub PRs.
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold text-[var(--ink)] mb-1">
                Maximum Changed Files Per Review
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={maxFiles}
                onChange={e => setMaxFiles(parseInt(e.target.value, 10))}
                className="w-full p-2 text-xs font-mono bg-[var(--bg-subtle)] hairline-border text-[var(--ink)] focus:outline-none rounded-none"
              />
              <span className="text-[11px] font-mono text-[var(--ink-faint)] mt-1 block">
                Diffs with more files will review up to this limit and note skipped files in the summary comment.
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold text-[var(--ink)] mb-1">
                Default Ignore Patterns (one per line)
              </label>
              <textarea
                rows={5}
                value={ignorePatterns}
                onChange={e => setIgnorePatterns(e.target.value)}
                className="w-full p-2 text-xs font-mono bg-[var(--bg-subtle)] hairline-border text-[var(--ink)] focus:outline-none rounded-none resize-y"
              />
            </div>

            {statusMessage && (
              <div className="p-2 font-mono text-xs bg-[var(--bg-subtle)] hairline-border text-[var(--ink)]">
                {statusMessage}
              </div>
            )}

            <button
              type="submit"
              className="font-mono text-xs uppercase px-4 py-2 bg-[var(--ink)] text-[var(--bg-paper)] hover:bg-[var(--red-pen)] transition-colors rounded-none cursor-pointer"
            >
              Save Engine Defaults
            </button>
          </form>

          {/* Environment Status Diagnostic */}
          <div className="hairline-border bg-[var(--bg-card)] p-6">
            <div className="font-mono text-xs uppercase tracking-wider text-[var(--ink-muted)] font-bold hairline-b pb-2 mb-3">
              Environment & Host Status
            </div>
            <div className="divide-y divide-[var(--border-hairline)] divide-opacity-40 text-xs font-mono">
              <div className="py-2 flex justify-between">
                <span className="text-[var(--ink-muted)]">GitHub Webhook Secret:</span>
                <span className={envStatus?.webhookSecretConfigured ? 'text-[var(--ink)] font-bold' : 'text-[var(--red-pen)] font-bold'}>
                  {envStatus?.webhookSecretConfigured ? 'CONFIGURED' : 'NOT SET (unverified)'}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-[var(--ink-muted)]">GitHub App / Personal Token:</span>
                <span className={envStatus?.githubTokenConfigured ? 'text-[var(--ink)] font-bold' : 'text-[var(--ink-faint)]'}>
                  {envStatus?.githubTokenConfigured ? 'AUTHENTICATED' : 'ANONYMOUS (rate-limited)'}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-[var(--ink-muted)]">OpenAI API Key:</span>
                <span className={envStatus?.openaiApiKeyConfigured ? 'text-[var(--ink)] font-bold' : 'text-[var(--ink-muted)]'}>
                  {envStatus?.openaiApiKeyConfigured ? 'ACTIVE' : 'OFFLINE SIMULATOR'}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-[var(--ink-muted)]">Database Storage:</span>
                <span className="text-[var(--ink)] truncate max-w-xs" title={envStatus?.databasePath}>
                  {envStatus?.databasePath?.split(/[/\\]/).pop()} (SQLite WAL)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Diff Simulation Runner */}
        <div className="hairline-border bg-[var(--bg-card)] p-6 flex flex-col">
          <div className="font-mono text-xs uppercase tracking-wider text-[var(--ink-muted)] font-bold hairline-b pb-2 mb-3 flex items-center justify-between">
            <span>Diff Review Simulation Sandbox</span>
            <span className="text-[11px] text-[var(--ink-faint)] lowercase">dry run pipeline</span>
          </div>

          <p className="font-sans text-xs text-[var(--ink-muted)] mb-3">
            Paste any unified diff text below to simulate the end-to-end Redline pipeline (secret scanning, chunking, analysis, and report generation).
          </p>

          <textarea
            rows={10}
            value={testDiff}
            onChange={e => setTestDiff(e.target.value)}
            className="w-full p-2.5 font-mono text-xs bg-[var(--bg-subtle)] hairline-border text-[var(--ink)] focus:outline-none resize-y rounded-none mb-3"
            placeholder="diff --git a/file b/file..."
          />

          <button
            onClick={handleRunSimulation}
            disabled={simulating}
            className="font-mono text-xs uppercase px-4 py-2 bg-[var(--ink)] text-[var(--bg-paper)] hover:bg-[var(--red-pen)] transition-colors rounded-none disabled:opacity-50 cursor-pointer self-start mb-4"
          >
            {simulating ? 'Analyzing Diff...' : 'Execute Simulation'}
          </button>

          {simulationResult && (
            <div className="hairline-border bg-[var(--bg-subtle)] p-4 flex-1 overflow-y-auto font-mono text-xs">
              <div className="font-bold text-[var(--ink)] mb-2 hairline-b pb-1">
                Simulation Output:
              </div>
              {simulationResult.error ? (
                <div className="text-[var(--red-pen)]">{simulationResult.error}</div>
              ) : (
                <div>
                  <div className="text-[var(--ink)] font-semibold mb-2">
                    Found {simulationResult.findingsCount} findings:
                  </div>
                  <ul className="list-disc pl-4 space-y-1 mb-3">
                    {simulationResult.findings?.map((f: any, idx: number) => (
                      <li key={idx} className="text-[var(--ink)]">
                        <span className="font-bold text-[var(--red-pen)]">[{f.severity.toUpperCase()}]</span>{' '}
                        <span>{f.title}</span> <span className="text-[var(--ink-faint)]">({f.file}:L{f.lineStart})</span>
                      </li>
                    ))}
                  </ul>
                  <div className="hairline-t pt-2 text-[11px] text-[var(--ink-faint)]">
                    Review record #{simulationResult.id} persisted to database.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
