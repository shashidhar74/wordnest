const express = require('express');
const { body } = require('express-validator');
const isAuth = require('../middleware/is-auth');
const chatController = require('../controller/chat');
const { aiLimiter } = require('../middleware/rate-limit');

const router = express.Router();

// POST /chat — the blog chatbot (contract: docs/openapi.yaml → /chat)
router.post('/', isAuth, aiLimiter, [
    body('message').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Message must be 1 to 500 characters'),
    body('context.awaiting').optional().isIn(['post_for_summary', 'post_topic', 'post_tone']).withMessage('Invalid context'),
    // the post flow's collected answers, sent back by the chat panel between steps
    body('context.draft.topic').optional().isString().trim().isLength({ min: 3, max: 200 }).withMessage('Invalid draft topic'),
    body('context.draft.tone').optional().isIn(['informative', 'casual', 'formal', 'funny']).withMessage('Invalid draft tone')
], chatController.chat);

// POST /chat/warm — wake the AI service in the background (it sleeps on Render's free plan and needs
// ~50 s to start). The frontend calls this when the app opens, so the service is up before the first
// chat message. Answers at once (202); the wake-up ping runs on its own. Logged-in users only.
router.post('/warm', isAuth, chatController.warm);

module.exports = router;
