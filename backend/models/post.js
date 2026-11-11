// Data layer for the `posts` table: ALL post SQL lives here.
// Controllers call these functions and only deal with HTTP (status codes, JSON).
// No req / res in this file.

const pool = require('../util/database');

// ---- who may see which posts ---------------------------------------------------------
// viewer = { userId, role } from the token, or {} for a guest.
//   guest / user → published only
//   creator      → published + their own (any status)
//   admin        → everything
// Adds its parameter to `params` and returns the SQL condition, e.g. "(status = 'published' OR user_id = $3)".
function visibleTo(viewer, params) {
    if (viewer && viewer.role === 'admin') {
        return 'TRUE';
    }
    if (viewer && viewer.userId) {
        params.push(viewer.userId);
        return `(status = 'published' OR user_id = $${params.length})`;
    }
    return `status = 'published'`;
}

// ---- reading ---------------------------------------------------------------------------

// Paged list, newest first. search = title contains (case-insensitive); status = exact status.
// Returns { posts, total }.
exports.list = async ({ viewer, search, status, page = 1, limit = 10 }) => {
    const params = [];
    const where = [visibleTo(viewer, params)];
    if (search) {
        params.push(`%${search}%`);
        where.push(`title ILIKE $${params.length}`);
    }
    if (status) {
        params.push(status);
        where.push(`status = $${params.length}`);
    }
    const whereSql = ' WHERE ' + where.join(' AND ');

    const count = await pool.query(`SELECT COUNT(*) FROM posts${whereSql}`, params);
    const total = parseInt(count.rows[0].count);   // COUNT(*) comes back as a string

    params.push(limit);
    const limitSql = ` LIMIT $${params.length}`;
    params.push((page - 1) * limit);
    const offsetSql = ` OFFSET $${params.length}`;
    const result = await pool.query(
        `SELECT * FROM posts${whereSql} ORDER BY id DESC${limitSql}${offsetSql}`, params
    );
    return { posts: result.rows, total };
};

// One post the viewer may see, or null (not found OR not allowed: the caller answers 404 for both,
// so nobody can find out that a hidden post exists).
exports.findVisible = async (id, viewer) => {
    const params = [id];
    const visible = visibleTo(viewer, params);
    const result = await pool.query(`SELECT * FROM posts WHERE id = $1 AND ${visible}`, params);
    return result.rows[0] || null;
};

// Owner, status and image of a post, for permission checks before changing it. null if it doesn't exist.
exports.findMeta = async (id) => {
    const result = await pool.query('SELECT id, user_id, status, img_url FROM posts WHERE id = $1', [id]);
    return result.rows[0] || null;
};

// ---- writing ---------------------------------------------------------------------------

// New posts always start as draft; the owner comes from the token (never from the request body).
exports.create = async ({ title, content, imgUrl, userId }) => {
    const result = await pool.query(
        // `author` is a leftover column (see PROJECT_NOTES open tasks); kept empty until it's dropped
        `INSERT INTO posts (title, content, status, author, img_url, user_id)
         VALUES ($1, $2, 'draft', '', $3, $4) RETURNING *`,
        [title, content, imgUrl, userId]
    );
    return result.rows[0];
};

// Also clears the saved AI summary: the text changed, so the old summary would be stale.
exports.update = async (id, { title, content, imgUrl }) => {
    const result = await pool.query(
        `UPDATE posts
         SET title = $1, content = $2, img_url = $3, updated_on = NOW(),
             summary = NULL, summary_source = NULL, summary_updated_at = NULL
         WHERE id = $4 RETURNING *`,
        [title, content, imgUrl, id]
    );
    return result.rows[0] || null;
};

// Save an AI summary on the post (see util/summary.js). source: 'gemini' | 'extractive'.
exports.saveSummary = async (id, summary, source) => {
    await pool.query(
        'UPDATE posts SET summary = $1, summary_source = $2, summary_updated_at = NOW() WHERE id = $3',
        [summary, source, id]
    );
};

// Returns the deleted row (the caller deletes its image file), or null.
exports.remove = async (id) => {
    const result = await pool.query('DELETE FROM posts WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
};

// Workflow step. Repeats the "from" check inside the UPDATE, so if two people act at the same
// moment only one wins; the other gets null (→ 409 "status has changed").
// Review columns are only filled when an admin acts (isReview).
exports.changeStatus = async (id, { from, to, comment, isReview, reviewerId }) => {
    const result = await pool.query(
        `UPDATE posts
         SET status = $1,
             review_comment = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE review_comment END,
             reviewed_by    = CASE WHEN $3 THEN $4::int ELSE reviewed_by END,
             reviewed_at    = CASE WHEN $3 THEN NOW() ELSE reviewed_at END
         WHERE id = $5 AND status = ANY($6)
         RETURNING *`,
        [to, comment ?? null, isReview, reviewerId, id, from]
    );
    return result.rows[0] || null;
};
