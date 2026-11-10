const express = require('express');
const { body } = require('express-validator');
const isAuth = require('../middleware/is-auth');
const chatController = require('../controller/chat');

const router = express.Router();

// POST /chat — the blog chatbot (contract: docs/openapi.yaml → /chat)
router.post('/', isAuth, [
    body('message').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Message must be 1 to 500 characters'),
    body('context.awaiting').optional().isIn(['post_for_summary']).withMessage('Invalid context')
], chatController.chat);

module.exports = router;
