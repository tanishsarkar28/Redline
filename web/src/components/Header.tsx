import React, { useEffect, useState } from 'react';
import { api, type SystemStatus } from '../api/client.js';
import { formatRelativeTime, formatExactTime } from '../utils.js';

interface HeaderProps {
  currentTab: 'reviews' | 'repos' | 'settings';
  onSelectTab: (tab: 'reviews' | 'repos' | 'settings') => void;
  onOpenShortcuts: () => void;
  theme: 'paper' | 'charcoal';
  onToggleTheme: () => void;
}

export function Header({
  currentTab,
  onSelectTab,
  onOpenShortcuts,
  theme,
  onToggleTheme
}: HeaderProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    api.getStatus().then(setStatus).catch(() => {});
    const interval = setInterval(() => {
      api.getStatus().then(setStatus).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="hairline-b bg-[var(--bg-paper)] px-6 py-3 select-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand & Left Navigation */}
        <div className="flex items-center space-x-8">
          <div
            className="flex items-center space-x-2.5 cursor-pointer group"
            onClick={() => onSelectTab('reviews')}
          >
            <span className="font-mono text-base font-bold text-[var(--red-pen)] tracking-widest uppercase border-b-2 border-[var(--red-pen)] pb-0.5">
              REDLINE
            </span>
            <span className="font-mono text-xs text-[var(--ink-faint)] hidden sm:inline">
              // review engine
            </span>
          </div>

          <nav className="flex items-center space-x-6 text-sm">
            <button
              onClick={() => onSelectTab('reviews')}
              className={`font-mono text-xs uppercase tracking-wider py-1 border-b transition-colors ${
                currentTab === 'reviews'
                  ? 'border-[var(--ink)] text-[var(--ink)] font-bold'
                  : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              Reviews
            </button>
            <button
              onClick={() => onSelectTab('repos')}
              className={`font-mono text-xs uppercase tracking-wider py-1 border-b transition-colors ${
                currentTab === 'repos'
                  ? 'border-[var(--ink)] text-[var(--ink)] font-bold'
                  : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              Repositories
            </button>
            <button
              onClick={() => onSelectTab('settings')}
              className={`font-mono text-xs uppercase tracking-wider py-1 border-b transition-colors ${
                currentTab === 'settings'
                  ? 'border-[var(--ink)] text-[var(--ink)] font-bold'
                  : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              Settings
            </button>
          </nav>
        </div>

        {/* Right Info: Last Webhook & Controls */}
        <div className="flex items-center space-x-6">
          {/* Visible "last webhook received" indicator */}
          <div
            className="hidden md:flex items-center space-x-2 text-xs font-mono text-[var(--ink-muted)] cursor-help"
            title={
              status?.latestWebhookReceivedAt
                ? `Last webhook received: ${formatExactTime(status.latestWebhookReceivedAt)}\nDelivery: ${status.latestWebhookDeliveryId || 'n/a'}`
                : 'No webhooks received yet'
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status?.latestWebhookReceivedAt ? 'bg-[var(--red-pen)]' : 'bg-[var(--ink-faint)]'
              }`}
            />
            <span className="text-[var(--ink-faint)]">webhook:</span>
            <span className="text-[var(--ink)] font-medium">
              {formatRelativeTime(status?.latestWebhookReceivedAt)}
            </span>
          </div>

          {/* Model info */}
          <div className="hidden lg:flex items-center text-xs font-mono text-[var(--ink-muted)]">
            <span className="text-[var(--ink-faint)] mr-1.5">model:</span>
            <span className="text-[var(--ink)]">{status?.model || 'gpt-4o-mini'}</span>
          </div>

          {/* Theme switcher */}
          <button
            onClick={onToggleTheme}
            className="text-xs font-mono py-1 px-2 border hairline-border hover:border-[var(--ink)] text-[var(--ink)] bg-[var(--bg-subtle)] transition-colors rounded-none"
            title="Toggle Theme [t]"
          >
            {theme === 'paper' ? 'paper' : 'charcoal'}
          </button>

          {/* Keyboard shortcuts trigger */}
          <button
            onClick={onOpenShortcuts}
            className="kbd-badge cursor-pointer hover:border-[var(--ink)] text-[var(--ink)]"
            title="Keyboard shortcuts [?]"
          >
            ?
          </button>
        </div>
      </div>
    </header>
  );
}
