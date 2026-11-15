const express = require('express');
const { query } = require('express-validator');
const analyticsController = require('../controller/analytics');
const isAuth = require('../middleware/is-auth');
const { aiLimiter } = require('../middleware/rate-limit');

const router = express.Router();

// Every analytics endpoint takes the same optional period: ?months=3|6|12 (default 6)
const monthsRule = [
    query('months').optional().isIn(['3', '6', '12']).withMessage('months must be 3, 6 or 12')
];
// Lists take an optional ?limit (how many rows)
const limitRule = query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1 to 50');
const statusRule = query('status').optional()
    .isIn(['draft', 'pending', 'clarification', 'published', 'rejected', 'closed']).withMessage('unknown status');

router.get('/stats', isAuth, monthsRule, analyticsController.getStats);

router.get('/posts-per-month', isAuth, monthsRule, analyticsController.getPostsPerMonth);

router.get('/review-time', isAuth, monthsRule, analyticsController.getReviewTime);

router.get('/top-authors', isAuth, [...monthsRule, limitRule], analyticsController.getTopAuthors);

router.get('/comment-activity', isAuth, monthsRule, analyticsController.getCommentActivity);

router.get('/ai-summaries', isAuth, monthsRule, analyticsController.getAiSummaries);

router.get('/review-flow', isAuth, monthsRule, analyticsController.getReviewFlow);

// AI summary of the dashboard: counted against the user's AI limit (isAuth first, so req.userId exists)
router.get('/insights', isAuth, aiLimiter, [
    ...monthsRule,
    query('refresh').optional().isIn(['true', 'false']).withMessage('refresh must be true or false')
], analyticsController.getInsights);

router.get('/oldest-posts', isAuth, [statusRule, limitRule], analyticsController.getOldestPosts);

module.exports = router;
