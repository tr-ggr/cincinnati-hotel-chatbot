import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANNED_FALLBACK, CATEGORIES } from '../../api/src/lib/categories';

// Contract checks for the exported workflows. They catch drift between the JSON, the prompt files and the
// API's category list without starting n8n.
interface Node {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
}
interface Workflow {
  id: string;
  name: string;
  nodes: Node[];
}

const dir = new URL('../workflows/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const workflows = new Map(files.map((f) => [f, JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Workflow]));
// Normalise CRLF: Windows checkouts with core.autocrlf=true rewrite the .md files.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function node(file: string, name: string): Node {
  const found = workflows.get(file)?.nodes.find((n) => n.name === name);
  if (!found) throw new Error(`${file}: node "${name}" not found`);
  return found;
}

describe('workflow files', () => {
  it('has the three workflows', () => {
    expect(files).toEqual(['01-ingest-pdf.json', '02-chat-answer.json', '03-lead-email.json']);
  });

  it.each(files)('%s has a fixed id for idempotent imports', (file) => {
    expect(workflows.get(file)?.id).toMatch(/\S/);
  });

  it.each(files)('%s exposes a secret-protected hotel/* webhook', (file) => {
    const hook = workflows.get(file)!.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
    expect(hook?.parameters.path).toMatch(/^hotel\/(ingest|chat|lead)$/);
    expect(hook?.parameters.authentication).toBe('headerAuth');
  });

  it.each(files)('%s holds no inline API keys', (file) => {
    const raw = readFileSync(new URL(file, dir), 'utf8');
    expect(raw).not.toMatch(/sk-[A-Za-z0-9_-]{16,}|re_[A-Za-z0-9]{16,}/);
  });
});

describe('02-chat-answer', () => {
  const file = '02-chat-answer.json';

  it('Structured Output Parser enum matches the API categories', () => {
    const schema = JSON.parse(node(file, 'Structured Output Parser').parameters.inputSchema as string);
    expect(schema.properties.category.enum).toEqual([...CATEGORIES]);
  });

  it('Guard & finalize uses the exact canned sentence and category list', () => {
    const code = node(file, 'Guard & finalize').parameters.jsCode as string;
    expect(code).toContain(`const CANNED = ${JSON.stringify(CANNED_FALLBACK)};`);
    expect(code).toContain(`const CATEGORIES = [${CATEGORIES.map((c) => `'${c}'`).join(', ')}];`);
  });

  it('Basic LLM Chain prompt matches prompts/chat-system.md', () => {
    const embedded = (node(file, 'Basic LLM Chain').parameters.text as string)
      .replace(/^=/, '')
      .replace(/\{\{ \$\('Build context'\)\.first\(\)\.json\.([a-z]+) \}\}/g, '{{ $1 }}');
    expect(embedded.trim()).toBe(read('../prompts/chat-system.md').trim());
  });
});

describe('03-lead-email', () => {
  it('keeps the sender and recipient as ${VAR} placeholders for the import script', () => {
    const raw = readFileSync(new URL('03-lead-email.json', dir), 'utf8');
    expect(raw).toContain('${EMAIL_FROM}');
    expect(raw).toContain('${LEAD_TO}');
  });
});

describe('credentials.template.json', () => {
  const raw = read('../credentials.template.json');

  it('only uses the placeholders the import script substitutes', () => {
    const vars = new Set([...raw.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((m) => m[1]));
    expect([...vars].sort()).toEqual(
      ['N8N_WEBHOOK_SECRET', 'OPENAI_API_KEY', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'POSTGRES_USER', 'RESEND_API_KEY'],
    );
  });

  it('defines the credentials the workflows reference', () => {
    const ids = new Set((JSON.parse(raw) as { id: string }[]).map((c) => c.id));
    for (const [file, wf] of workflows) {
      for (const n of wf.nodes) {
        for (const ref of Object.values(n.credentials ?? {})) {
          expect(ids, `${file} → ${n.name} → ${ref.id}`).toContain(ref.id);
        }
      }
    }
  });
});
