const express = require('express');
const { body, param } = require('express-validator');
const isAuth = require('../middleware/is-auth');
const optionalAuth = require('../middleware/optional-auth');
const commentsController = require('../controller/comments');

const router = express.Router();

// Validators, shared by the routes below (`const`, so they stay inside this file)
const postId = param('postId').isInt({min:1}).withMessage('Post Id is mandatory');
const commentId = param('commentId').isInt({min:1}).withMessage('Comment Id is mandatory');
const content = body('content').trim()
    .notEmpty().withMessage('Comment content is required')
    .isLength({max:2000}).withMessage('Comment must be at most 2000 characters');
// missing or null = top-level comment; otherwise the id of the comment being replied to
const parentId = body('parentId').optional({values:'null'}).isInt({min:1}).withMessage('Invalid parentId');

// Mounted at /feed in app.js, so the full URLs are /feed/posts/:postId/comments and /feed/comments/:commentId

// GET — the thread of a post. Public; a token (if sent) lets creators/admins read comments of posts only they can see
router.get('/posts/:postId/comments', optionalAuth, [postId], commentsController.listComments);

// POST — add a comment or a reply (body: { content, parentId? }). Any logged-in user, published posts only
router.post('/posts/:postId/comments', isAuth, [postId, content, parentId], commentsController.addComment);

// PATCH — edit your own comment (body: { content })
router.patch('/comments/:commentId', isAuth, [commentId, content], commentsController.update);

// DELETE — your own comment, or any comment as admin (soft delete if it has replies)
router.delete('/comments/:commentId', isAuth, [commentId], commentsController.remove);

module.exports = router;
