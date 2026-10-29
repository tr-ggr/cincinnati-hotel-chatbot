-- Dashboard query (GET /api/admin/stats and the SSE broadcaster).
-- Idempotent: runs on a fresh volume after 01-schema.sql, and can be re-applied to a live database with
--   docker compose -f compose.yml exec -T postgres psql -U hotel -d hotel < migrations/02-stats-view.sql
-- A question counts once it has been classified (answered IS NOT NULL), so total_questions always equals
-- the sum of by_category, and a session counts once it has at least one such question.
CREATE OR REPLACE VIEW stats_overview AS
SELECT
  (SELECT count(*) FROM sessions s WHERE EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id AND m.role='user' AND m.answered IS NOT NULL))::int AS total_sessions,
  (SELECT count(*) FROM messages WHERE role='user' AND answered IS NOT NULL)::int AS total_questions,
  (SELECT count(*) FROM messages WHERE role='user' AND answered = false)::int  AS unanswered_questions,
  (SELECT count(*) FROM leads)::int                                            AS total_leads,
  (SELECT coalesce(json_agg(json_build_object('category', c, 'count', n) ORDER BY n DESC), '[]'::json)
     FROM (SELECT category AS c, count(*) AS n FROM messages WHERE role='user' AND category IS NOT NULL GROUP BY category) t) AS by_category;
