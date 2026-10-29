import { z } from 'zod';

/** Rate limits per client IP per 1-minute window (ARCHITECTURE §4). Upload is stricter: each one runs a full ingest. */
export const RATE_LIMIT_MAX = 60;
export const UPLOAD_RATE_LIMIT_MAX = 10;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  N8N_BASE_URL: z.url(),
  N8N_WEBHOOK_SECRET: z.string().min(1),
  N8N_MOCK: z.enum(['0', '1']).default('0'),
  INTERNAL_BASE_URL: z.url(),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
});

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  databaseUrl: string;
  n8nBaseUrl: string;
  n8nWebhookSecret: string;
  n8nMock: boolean;
  internalBaseUrl: string;
  uploadDir: string;
  maxUploadMb: number;
  maxUploadBytes: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Validates env (defaults to process.env) and returns typed config. Throws ConfigError listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${String(issue.path[0] ?? '(env)')}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid API configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    n8nBaseUrl: e.N8N_BASE_URL,
    n8nWebhookSecret: e.N8N_WEBHOOK_SECRET,
    n8nMock: e.N8N_MOCK === '1',
    internalBaseUrl: e.INTERNAL_BASE_URL,
    uploadDir: e.UPLOAD_DIR,
    maxUploadMb: e.MAX_UPLOAD_MB,
    maxUploadBytes: Math.floor(e.MAX_UPLOAD_MB * 1024 * 1024),
  };
}
