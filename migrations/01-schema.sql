CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- LangChain PGVectorStore uses uuid_generate_v4()

-- Knowledge base documents (exactly one active)
CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     text NOT NULL,
  size_bytes   integer NOT NULL,
  page_count   integer,
  chunk_count  integer,
  status       text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  error        text,
  is_active    boolean NOT NULL DEFAULT false,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  ready_at     timestamptz
);
CREATE UNIQUE INDEX documents_one_active ON documents (is_active) WHERE is_active;

-- Vector chunks: EXACT LangChain / n8n PGVector Store layout. Do not rename columns.
CREATE TABLE chunks (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  text      text,
  metadata  jsonb,
  embedding vector(1536)
);
CREATE INDEX chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_document_id ON chunks ((metadata->>'document_id'));

CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  user_agent       text
);

CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user','assistant')),
  content     text NOT NULL,
  category    text CHECK (category IN ('Rooms','Restaurant & Dining','Amenities & Facilities',
                 'Pricing & Booking','Location & Transport','Policies','Events','Other')),
  answered    boolean,           -- set on the USER message (the question) and mirrored on the reply
  sources     jsonb,             -- [{chunk_index, score}] on assistant messages
  latency_ms  integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_session_idx ON messages (session_id, created_at);
CREATE INDEX messages_category_idx ON messages (category) WHERE role = 'user';

CREATE TABLE leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid REFERENCES sessions(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  phone                text NOT NULL,
  email                text NOT NULL,
  unanswered_question  text,
  email_status         text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sent','failed')),
  email_id             text,
  summary              text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- The dashboard view lives in 02-stats-view.sql so it can be re-applied to an existing database.
