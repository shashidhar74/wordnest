-- 2026-11-11: cache AI summaries on the post.
-- "Summarize" saves its result here, so the next request returns it instantly with no AI call.
-- Editing the post clears these columns (models/post.js → update), so a summary is never stale.
-- Safe on a live database: new columns are optional (NULL), existing code ignores them.

BEGIN;

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS summary            TEXT,
    ADD COLUMN IF NOT EXISTS summary_source     TEXT,          -- 'gemini' or 'extractive' (our own summarizer)
    ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_summary_source_check;
ALTER TABLE posts ADD CONSTRAINT posts_summary_source_check
    CHECK (summary_source IS NULL OR summary_source IN ('gemini', 'extractive'));

COMMIT;
