import type { Review, Repository, RedlineConfig } from '../../../shared/types.js';

export interface SystemStatus {
  ok: boolean;
  version: string;
  model: string;
  githubConfigured: boolean;
  openaiConfigured: boolean;
  webhookConfigured: boolean;
  latestWebhookReceivedAt: string | null;
  latestWebhookDeliveryId: string | null;
}

export const api = {
  async getStatus(): Promise<SystemStatus> {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('Failed to load status');
    return res.json();
  },

  async getReviews(repo?: string): Promise<{ reviews: Review[] }> {
    const url = repo ? `/api/reviews?repo=${encodeURIComponent(repo)}` : '/api/reviews';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load reviews');
    return res.json();
  },

  async getReviewById(id: string): Promise<{ review: Review }> {
    const res = await fetch(`/api/reviews/${id}`);
    if (!res.ok) throw new Error('Review not found');
    return res.json();
  },

  async getRepositories(): Promise<{ repos: Repository[] }> {
    const res = await fetch('/api/repos');
    if (!res.ok) throw new Error('Failed to load repositories');
    return res.json();
  },

  async updateRepoConfig(owner: string, name: string, config: Partial<RedlineConfig>): Promise<void> {
    const res = await fetch(`/api/repos/${owner}/${name}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) throw new Error('Failed to update repo config');
  },

  async getSettings(): Promise<{
    settings: {
      model: string;
      defaultSeverityThreshold: string;
      defaultMaxFiles: number;
      databasePath: string;
      webhookSecretConfigured: boolean;
      githubTokenConfigured: boolean;
      openaiApiKeyConfigured: boolean;
    };
  }> {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to load settings');
    return res.json();
  },

  async updateSettings(settings: {
    model?: string;
    defaultSeverityThreshold?: string;
    defaultMaxFiles?: number;
  }): Promise<void> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) throw new Error('Failed to update settings');
  },

  async runSimulation(payload?: { diffText?: string; prTitle?: string }): Promise<{ ok: boolean; review: Review }> {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) throw new Error('Simulation failed');
    return res.json();
  }
};
