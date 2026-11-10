const Comment = require('../models/comments');
const { validationResult } = require('express-validator');
const Post = require('../models/post');

// who is asking: { userId, role } from the token, or {} for a guest.
// The key must be `role`: models/post.js → visibleTo() reads viewer.role.
const viewerOf = (req) => ({ userId: req.userId, role: req.userRole });


 exports.listComments = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({message: 'Invalid input data', errors: errors.array() });
    }
    const postId = req.params.postId;
    try {
        // same visibility as the post itself: nobody can read comments of a post they can't see
        const post = await Post.findVisible(postId, viewerOf(req));
        if (!post) {
            return res.status(404).json({ message: 'Post not found or not visible to the user' });
        }
        const { comments, total } = await Comment.listComments(postId);
        res.status(200).json({ total, comments: buildTree(comments) });
    } catch (err) {
        next(err);
    }
}

exports.addComment = async (req, res, next) => {
    // validate first: no database work for bad input (422 = validation failed, like the rest of the API)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({message: 'Invalid input data', errors: errors.array() });
    }
    const postId = Number(req.params.postId);
    const userId = req.userId;                 // always from the token, never from the body
    const content = req.body.content;
    let parentId = req.body.parentId ? Number(req.body.parentId) : null;

    try {
        const post = await Post.findVisible(postId, viewerOf(req));
        if (!post) {
            return res.status(404).json({ message: 'Post not found or not visible to the user' });
        }
        if(post.status !== 'published') {
            return res.status(403).json({ message: 'You do not have permission to comment on this post' });
        }

        // Replies (Fix 4)
        if (parentId) {
            const parent = await Comment.findById(parentId);
            // the parent must exist, not be deleted, and belong to THIS post
            if (!parent || parent.deleted_at || parent.post_id !== postId) {
                return res.status(422).json({ message: 'The comment you are replying to was not found' });
            }
            // 2 levels only: replying to a reply joins the same thread (under the top-level comment)
            if (parent.parent_id) {
                parentId = parent.parent_id;
            }
        }

        const newComment = await Comment.addComment(postId, userId, content, parentId);
        res.status(201).json(newComment);
    }catch (err) {
        next(err);
    }
}

// PATCH /feed/comments/:commentId   body: { content }
// Fix 6: edit — only the author, and not a deleted comment
exports.update = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({message: 'Invalid input data', errors: errors.array() });
    }
    try {
        const comment = await Comment.findById(req.params.commentId);
        if (!comment || comment.deleted_at) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        if (comment.user_id !== req.userId) {
            return res.status(403).json({ message: 'You can only edit your own comments' });
        }
        const updated = await Comment.update(comment.id, req.body.content);
        res.status(200).json(updated);
    } catch (err) {
        next(err);
    }
}

exports.remove = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({message: 'Invalid input data', errors: errors.array() });
    }
    try {
        const comment = await Comment.findById(req.params.commentId);
        // Fix 7: an already deleted comment is "not found" too
        if (!comment || comment.deleted_at) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        const isOwner = comment.user_id === req.userId;
        const isAdmin = req.userRole === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: 'You do not have permission to delete this comment' });
        }

        if (await Comment.hasReplies(comment.id)) {
            // Soft delete: the row stays so its replies stay; the list shows "[deleted]"
            await Comment.softDelete(comment.id);
        } else {
            // Hard delete
            await Comment.remove(comment.id);
            // clean-up: if this was the last reply of an already deleted comment,
            // remove that now-empty "[deleted]" placeholder too
            if (comment.parent_id) {
                const parent = await Comment.findById(comment.parent_id);
                if (parent && parent.deleted_at && !(await Comment.hasReplies(parent.id))) {
                    await Comment.remove(parent.id);
                }
            }
        }
        res.status(200).json({ message: 'Comment deleted successfully' });

    } catch (err) {
        next(err);
    }
}


// Flat rows (oldest first) → top-level comments with their replies inside.
// One pass with a Map, no extra SQL. Parents always come before their replies (ORDER BY created_at).
function buildTree(rows) {
    const byId = new Map();
    const roots = [];
    for (const row of rows) {
        const node = {
            id: row.id,
            parentId: row.parent_id,
            content: row.content,                                         // null when deleted
            author: row.deleted_at ? null : { id: row.user_id, name: row.author_name },
            createdAt: row.created_at,
            edited: !!row.updated_at,
            deleted: !!row.deleted_at,
            replies: []
        };
        byId.set(row.id, node);
        const parent = row.parent_id ? byId.get(row.parent_id) : null;
        if (parent) {
            parent.replies.push(node);
        } else {
            roots.push(node);
        }
    }
    return roots;
}