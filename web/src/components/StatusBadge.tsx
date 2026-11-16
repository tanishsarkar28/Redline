import React from 'react';
import type { Severity, ReviewStatus } from '../../../shared/types.js';

export function SeverityLabel({ severity }: { severity: Severity }) {
  if (severity === 'critical') {
    return (
      <span className="font-mono text-xs font-bold tracking-wider text-[var(--red-pen)] underline decoration-[var(--red-pen)] decoration-1 underline-offset-2">
        CRITICAL
      </span>
    );
  }
  if (severity === 'high') {
    return (
      <span className="font-mono text-xs font-bold tracking-wider text-[var(--ink)]">
        HIGH
      </span>
    );
  }
  if (severity === 'medium') {
    return (
      <span className="font-mono text-xs font-medium tracking-wide text-[var(--ink)]">
        MED
      </span>
    );
  }
  return (
    <span className="font-mono text-xs font-normal tracking-wide text-[var(--ink-muted)]">
      LOW
    </span>
  );
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  if (status === 'completed') {
    return (
      <span className="font-mono text-xs tracking-wide text-[var(--ink-muted)]">
        [completed]
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="font-mono text-xs font-semibold tracking-wide text-[var(--red-pen)] animate-pulse">
        [running...]
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="font-mono text-xs font-bold tracking-wide text-[var(--red-pen)]">
        [failed]
      </span>
    );
  }
  return (
    <span className="font-mono text-xs tracking-wide text-[var(--ink-faint)]">
      [pending]
    </span>
  );
}
