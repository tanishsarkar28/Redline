import dotenv from 'dotenv';
import path from 'path';

// Load .env if present
dotenv.config();

export interface ServerConfig {
  port: number;
  host: string;
  webhookSecret: string;
  githubToken: string;
  openaiApiKey: string;
  openaiModel: string;
  databasePath: string;
  defaultSeverityThreshold: 'critical' | 'high' | 'medium' | 'low';
  defaultMaxFiles: number;
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  githubToken: process.env.GITHUB_TOKEN || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data/redline.db'),
  defaultSeverityThreshold: (process.env.DEFAULT_SEVERITY_THRESHOLD as any) || 'low',
  defaultMaxFiles: parseInt(process.env.DEFAULT_MAX_FILES || '25', 10)
};
