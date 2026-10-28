import { loadConfig } from '../src/config.js';
import { closePool, getPool, query } from '../src/db/pool.js';
import { createSession, insertMessage } from '../src/db/queries.js';
import { getStats } from '../src/lib/stats.js';
import { createN8nClient } from '../src/lib/n8n.js';

async function main(): Promise<void> {
  const config = loadConfig();
  getPool(config.databaseUrl);
  const n8n = createN8nClient(config);
  let sessionId: string | null = null;
  try {
    const session = await createSession('db-check');
    sessionId = session.id;
    const msg = await insertMessage({ sessionId, role: 'user', content: 'Do you have a pool?' });
    const chat = await n8n.chat({
      session_id: sessionId,
      message_id: msg.id,
      question: msg.content,
      document_id: 'none',
      history: [],
    });
    const stats = await getStats();
    console.log(JSON.stringify({ session, message: msg, chat, stats }, null, 2));
  } finally {
    if (sessionId) await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    await closePool();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
