import React from 'react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'j', desc: 'Focus next finding or table row' },
    { key: 'k', desc: 'Focus previous finding or table row' },
    { key: 'Enter', desc: 'Open focused review or expand suggested fix' },
    { key: '/', desc: 'Focus filter / search input' },
    { key: 't', desc: 'Toggle paper / charcoal theme' },
    { key: '?', desc: 'Toggle keyboard shortcuts reference' },
    { key: 'Esc', desc: 'Close dialog or return to reviews list' }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--bg-paper)] hairline-border shadow-none p-6 text-[var(--ink)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between hairline-b pb-3 mb-4">
          <h2 className="font-serif text-lg font-bold">Keyboard Navigation</h2>
          <button
            onClick={onClose}
            className="font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            [esc]
          </button>
        </div>

        <div className="divide-y divide-[var(--border-hairline)] text-sm">
          {shortcuts.map(s => (
            <div key={s.key} className="py-2.5 flex items-center justify-between">
              <span className="font-mono text-xs text-[var(--ink-muted)]">{s.desc}</span>
              <span className="kbd-badge font-mono font-bold">{s.key}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-3 hairline-t text-xs font-mono text-[var(--ink-faint)] text-right">
          Press [esc] or click outside to dismiss
        </div>
      </div>
    </div>
  );
}
