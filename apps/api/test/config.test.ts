import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/hotel',
  N8N_BASE_URL: 'http://n8n:5678',
  N8N_WEBHOOK_SECRET: 's3cret',
  INTERNAL_BASE_URL: 'http://api:3000',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ nodeEnv: 'development', port: 3000, n8nMock: false, uploadDir: './uploads', maxUploadMb: 10 });
    expect(c.maxUploadBytes).toBe(10 * 1024 * 1024);
  });

  it('parses N8N_MOCK and numeric values', () => {
    const c = loadConfig({ ...base, N8N_MOCK: '1', PORT: '3001', MAX_UPLOAD_MB: '2.5' });
    expect(c.n8nMock).toBe(true);
    expect(c.port).toBe(3001);
    expect(c.maxUploadBytes).toBe(Math.floor(2.5 * 1024 * 1024));
  });

  it('lists every invalid variable', () => {
    const run = () => loadConfig({ N8N_BASE_URL: 'not a url', N8N_MOCK: 'yes' });
    expect(run).toThrow(ConfigError);
    try {
      run();
    } catch (err) {
      const msg = (err as Error).message;
      for (const key of ['DATABASE_URL', 'N8N_BASE_URL', 'N8N_WEBHOOK_SECRET', 'N8N_MOCK', 'INTERNAL_BASE_URL']) {
        expect(msg).toContain(key);
      }
    }
  });
});
