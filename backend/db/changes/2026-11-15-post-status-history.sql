-- 2026-11-15: keep a history of every status change of a post.
-- One row per change: draft → pending → clarification → pending → published → closed …
-- Used by the dashboard's review flow (GET /analytics/review-flow) and, later, a post activity log.
-- Written by models/post.js: create() adds the first row (NULL → draft), changeStatus() one per action,
-- in the same SQL statement as the post itself, so history and post can never disagree.
-- Safe on a live database: a new table, existing code does not read it.

BEGIN;

CREATE TABLE IF NOT EXISTS post_status_history (
    id          SERIAL PRIMARY KEY,
    post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,   -- history goes with the post
    from_status TEXT,                                                      -- NULL = the post was created
    to_status   TEXT NOT NULL,
    changed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,           -- who did it (owner or admin)
    comment     TEXT,                                                      -- reviewer's comment (send back / reject)
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT post_status_history_from_check CHECK (from_status IS NULL OR from_status IN
        ('draft', 'pending', 'clarification', 'published', 'rejected', 'closed')),
    CONSTRAINT post_status_history_to_check CHECK (to_status IN
        ('draft', 'pending', 'clarification', 'published', 'rejected', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_post_status_history_post ON post_status_history (post_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_post_status_history_changed_at ON post_status_history (changed_at);

-- Backfill for posts that existed before this table (runs only while the table is still empty).
-- RECONSTRUCTED, so approximate: real submit times were never stored, the submit row uses created_at;
-- the review row uses reviewed_at (or updated_on if there is none); closing uses updated_on. Clarification loops of old posts are lost.
INSERT INTO post_status_history (post_id, from_status, to_status, changed_by, comment, changed_at)
SELECT post_id, from_status, to_status, changed_by, comment, changed_at
FROM (
    SELECT id AS post_id, NULL AS from_status, 'draft' AS to_status, user_id AS changed_by,
           NULL AS comment, created_at::timestamptz AS changed_at, 1 AS step
    FROM posts
    UNION ALL
    SELECT id, 'draft', 'pending', user_id, NULL, created_at::timestamptz, 2
    FROM posts WHERE status <> 'draft'
    UNION ALL
    -- posts published before reviews were recorded have no reviewed_at: use updated_on instead
    SELECT id, 'pending', CASE WHEN status = 'closed' THEN 'published' ELSE status END,
           reviewed_by, review_comment, COALESCE(reviewed_at::timestamptz, updated_on), 3
    FROM posts WHERE status IN ('published', 'rejected', 'clarification', 'closed')
    UNION ALL
    SELECT id, 'published', 'closed', user_id, NULL, updated_on, 4
    FROM posts WHERE status = 'closed'
) AS rebuilt
WHERE NOT EXISTS (SELECT 1 FROM post_status_history)
ORDER BY changed_at, step;

COMMIT;
