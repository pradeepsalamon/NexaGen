-- Throwaway PoC schema (RAG_POC.md §2). NOT a Prisma migration and never run
-- against a production or shared database: stores.PgStore refuses any DSN whose
-- database name doesn't end in _poc. Tables follow AI_FOUNDATION.md §10.1.
-- {dim} is substituted with the embedder's dimension.

CREATE EXTENSION IF NOT EXISTS vector;
DROP SCHEMA IF EXISTS rag_poc CASCADE;
CREATE SCHEMA rag_poc;

CREATE TABLE rag_poc.knowledge_collection (
  id text PRIMARY KEY,
  audience text NOT NULL,
  active_embedding_model text NOT NULL
);

CREATE TABLE rag_poc.knowledge_document (
  id text PRIMARY KEY,
  collection_id text NOT NULL REFERENCES rag_poc.knowledge_collection (id),
  title text NOT NULL,
  source text NOT NULL,
  licence text NOT NULL
);

CREATE TABLE rag_poc.knowledge_document_version (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES rag_poc.knowledge_document (id) ON DELETE CASCADE,
  collection_id text NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('READY', 'SUPERSEDED', 'PENDING_REVIEW')),
  warnings text[] NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);
-- The same normalised file is never ingested twice into one collection.
CREATE UNIQUE INDEX knowledge_document_version_dedupe ON rag_poc.knowledge_document_version (collection_id, sha256);
-- At most one READY version per document.
CREATE UNIQUE INDEX knowledge_document_version_one_ready
  ON rag_poc.knowledge_document_version (document_id) WHERE status = 'READY';

CREATE TABLE rag_poc.knowledge_chunk (
  id text PRIMARY KEY,
  version_id text NOT NULL REFERENCES rag_poc.knowledge_document_version (id) ON DELETE CASCADE,
  -- Denormalised so the permission filter sits in the same WHERE as the ANN scan.
  collection_id text NOT NULL,
  ordinal integer NOT NULL,
  text text NOT NULL,
  heading_path text[] NOT NULL,
  char_start integer NOT NULL,
  char_end integer NOT NULL,
  token_count integer NOT NULL,
  sha256 text NOT NULL,
  embedding_model text NOT NULL,
  embedding vector({dim}) NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);
CREATE INDEX knowledge_chunk_embedding ON rag_poc.knowledge_chunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX knowledge_chunk_tsv ON rag_poc.knowledge_chunk USING gin (tsv);
CREATE INDEX knowledge_chunk_collection ON rag_poc.knowledge_chunk (collection_id);
