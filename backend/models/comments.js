const pool = require('../util/database');

// All comments of a post, oldest first, in ONE query (uses the comments_post_idx index).
// A soft-deleted comment keeps its row (so its replies stay), but its text and author are
// hidden here, so they never reach the browser.
exports.listComments = async (postId) => {
    const result = await pool.query(`
                SELECT c.id, c.post_id, c.parent_id, c.user_id,
                       CASE WHEN c.deleted_at IS NULL THEN c.content END AS content,
                       CASE WHEN c.deleted_at IS NULL THEN u.name END AS author_name,
                       c.created_at, c.updated_at, c.deleted_at
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.post_id = $1
                ORDER BY c.created_at
        `,[postId]);
    // total = comments people can still read (soft-deleted ones don't count)
    const total = result.rows.filter(c => !c.deleted_at).length;
    return { comments: result.rows, total };
}

exports.addComment = async (postId, userId, content, parentCommentId = null) => {
    const result = await pool.query(
        'INSERT INTO comments (post_id, user_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [postId, userId, content, parentCommentId]
    );
    return result.rows[0];
}


// Edit: new text + updated_at, so the UI can show "(edited)"
exports.update = async (id, content) => {
    const result = await pool.query(
        'UPDATE comments SET content = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id, content]
    );
    return result.rows[0] || null;
}

exports.findById = async (id) =>{
    const result = await pool.query(`SELECT * FROM comments WHERE id = $1`,[id]);
    return result.rows[0] || null;
}

exports.hasReplies = async (id) => {
    const result = await pool.query(`SELECT EXISTS (SELECT 1 FROM comments WHERE parent_id = $1) AS has_replies`, [id]);
    return result.rows[0].has_replies;
}

exports.softDelete = async (id) => {
    const result = await pool.query(
        'UPDATE comments SET deleted_at = NOW() WHERE id = $1 RETURNING *',
        [id]
    );
    return result.rows[0] || null;
}

exports.remove = async (id) => {
    const result = await pool.query('DELETE FROM comments WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
}