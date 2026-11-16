import { z } from 'zod';

export const SeverityEnum = z.enum(['critical', 'high', 'medium', 'low']);

export const FindingCategoryEnum = z.enum([
  'bug',
  'security',
  'secret-exposure',
  'performance',
  'style/improvement'
]);

export const FindingSchema = z.object({
  file: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  severity: SeverityEnum,
  category: FindingCategoryEnum,
  title: z.string().min(3),
  explanation: z.string().min(10),
  suggestedFix: z.string().optional()
});

export const LLMFindingSchema = z.object({
  lineStart: z.number().int().positive().describe('Starting line number of the finding in the new file'),
  lineEnd: z.number().int().positive().describe('Ending line number of the finding in the new file'),
  severity: SeverityEnum.describe('Severity level of this issue'),
  category: FindingCategoryEnum.describe('Type of issue identified'),
  title: z.string().describe('Concise, imperative title describing the issue'),
  explanation: z.string().describe('Precise explanation of the flaw, bug, security hole, or improvement'),
  suggestedFix: z.string().describe('Exact replacement code snippet or clear diff')
});

export const LLMReviewResponseSchema = z.object({
  findings: z.array(LLMFindingSchema).describe('List of actionable review findings on the changed lines')
});

// JSON Schema definition for OpenAI structured output API
export const OPENAI_REVIEW_JSON_SCHEMA = {
  name: 'code_review_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lineStart: {
              type: 'integer',
              description: 'Starting line number of the finding in the new file'
            },
            lineEnd: {
              type: 'integer',
              description: 'Ending line number of the finding in the new file'
            },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              description: 'Severity level: critical, high, medium, or low'
            },
            category: {
              type: 'string',
              enum: ['bug', 'security', 'secret-exposure', 'performance', 'style/improvement'],
              description: 'Category of the finding'
            },
            title: {
              type: 'string',
              description: 'Concise, imperative title describing the issue'
            },
            explanation: {
              type: 'string',
              description: 'Precise technical explanation of the issue'
            },
            suggestedFix: {
              type: 'string',
              description: 'Exact replacement code snippet'
            }
          },
          required: [
            'lineStart',
            'lineEnd',
            'severity',
            'category',
            'title',
            'explanation',
            'suggestedFix'
          ],
          additionalProperties: false
        },
        description: 'Actionable code review findings strictly within the changed lines'
      }
    },
    required: ['findings'],
    additionalProperties: false
  }
} as const;

export const RedlineConfigSchema = z.object({
  model: z.string().default('gpt-4o-mini'),
  severity_threshold: SeverityEnum.default('low'),
  max_files: z.number().int().positive().default(25),
  ignore: z.array(z.string()).default([
    '**/*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Cargo.lock',
    'Gemfile.lock',
    'composer.lock',
    '**/*.min.js',
    '**/*.min.css',
    '**/*.map',
    'dist/**',
    'build/**',
    '.next/**',
    'node_modules/**',
    'vendor/**',
    'public/**',
    'docs/**',
    '**/*.md',
    '**/*.svg',
    '**/*.png',
    '**/*.jpg',
    '**/*.ico'
  ]),
  secret_scan: z
    .object({
      enabled: z.boolean().default(true),
      entropy_threshold: z.number().default(4.5)
    })
    .default({
      enabled: true,
      entropy_threshold: 4.5
    })
});

export const WebhookPullRequestPayloadSchema = z.object({
  action: z.string(),
  number: z.number(),
  pull_request: z.object({
    id: z.number(),
    html_url: z.string(),
    title: z.string(),
    user: z.object({
      login: z.string()
    }),
    head: z.object({
      sha: z.string(),
      ref: z.string()
    }),
    base: z.object({
      sha: z.string(),
      ref: z.string()
    })
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({
      login: z.string()
    }),
    default_branch: z.string().optional()
  })
});

export type WebhookPullRequestPayload = z.infer<typeof WebhookPullRequestPayloadSchema>;
