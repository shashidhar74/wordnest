-- 001_create_comments.sql
-- Threaded comments on posts (2 levels: a comment + replies to it).
--
-- Matches the table already created in the local database on 2026-11-10 (checked column by column),
-- so running this on that database changes nothing (IF NOT EXISTS); on a fresh database it creates it.
--
-- Needs the `users` and `posts` tables first (foreign keys). They don't have migration files yet:
-- when you add them, number them before this one (e.g. 001_create_users, 002_create_posts,
-- 003_create_comments) so a fresh database is built in the right order.
--
-- Run:  psql -U <user> -d <database> -p 5433 -f backend/db/migrations/001_create_comments.sql

BEGIN;

CREATE TABLE IF NOT EXISTS comments (
    id          SERIAL PRIMARY KEY,

    -- the post this comment belongs to; deleting the post deletes its comments
    post_id     INT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,

    -- the author; ALWAYS taken from the JWT in the API, never from the request body
    user_id     INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    -- threading: NULL = top-level comment, otherwise the comment it replies to.
    -- The API must also check the parent belongs to the SAME post, and keep the depth at 2 levels.
    parent_id   INT REFERENCES comments (id) ON DELETE CASCADE,

    -- also validated in the API (trimmed, 1–2000); this CHECK is the last line of defence
    content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ,      -- set on edit → the UI shows "(edited)"
    deleted_at  TIMESTAMPTZ       -- soft delete: a deleted comment that has replies shows "[deleted]"
);

-- "all comments of post X, oldest first": the main query of the thread view
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, created_at);

-- "replies of comment X" / "does this comment have replies?" (soft vs hard delete)
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments (parent_id);

COMMIT;

-- ---------------------------------------------------------------------------------------
-- Undo (only if you really want to remove the feature and ALL comments):
--   DROP TABLE IF EXISTS comments;
