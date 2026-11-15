const { validationResult } = require('express-validator');
const stats = require('../models/stats');
const { getInsights } = require('../util/dashboard-insights');

// Checks the query rules from the route (months, limit, status) and throws a 422 error if one fails.
// Returns the number of months (default 6).
function readMonths(req) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error('Invalid query parameters!!');   // details per field are in error.data
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }
    return Number(req.query.months || 6);
}

// GET /analytics/stats → number of posts per status, plus the numbers for the KPI tiles
exports.getStats = async (req, res, next) => {
    const months = readMonths(req);
    try {
        const [counts, overview] = await Promise.all([      // two independent queries, run in parallel
            stats.statusCount(months),
            stats.overview(months),
        ]);
        res.status(200).json({ months, statusCounts: counts, ...overview });
    }
    catch (err) {
        next(err);
    }
}

// GET /analytics/posts-per-month → one entry per month, with a count for each status
exports.getPostsPerMonth = async (req, res, next) => {
    const months = readMonths(req);
    try {
        const postsPerMonth = await stats.getPostsPerMonth(months);
        res.status(200).json({ months, postsPerMonth });
    }
    catch (err) {
        next(err);
    }
}

// GET /analytics/review-time → average hours to review, overall and per month
exports.getReviewTime = async (req, res, next) => {
    const months = readMonths(req);
    try {
        const reviewTime = await stats.reviewTime(months);
        res.status(200).json({ months, targetHours: 24, ...reviewTime });
    }
    catch (err) {
        next(err);
    }
}

// GET /analytics/top-authors → authors with the most posts, with a count per status
exports.getTopAuthors = async (req, res, next) => {
    const months = readMonths(req);
    const limit = Number(req.query.limit || 5);
    try {
        const authors = await stats.topAuthors(months, limit);
        res.status(200).json({ months, authors });
    }
    catch (err) {
        next(err);
    }
}

// GET /analytics/comment-activity → new comments and replies per week
exports.getCommentActivity = async (req, res, next) => {
    const months = readMonths(req);
    try {
        const activity = await stats.commentActivity(months);
        res.status(200).json({ months, ...activity });
    }
    catch (err) {
        next(err);
    }
}

// GET /analytics/ai-summaries → Gemini vs own summarizer vs not generated, for published posts
exports.getAiSummaries = async (req, res, next) => {
    const months = readMonths(req);
    try {
        const summaries = await stats.aiSummaries(months);
        res.status(200).json({ months, ...summaries });
    }
    catch (err) {
        next(err);
    }
}

// GET /analytics/insights → a written summary of the dashboard (Gemini, or rules when Gemini is busy).
// Kept for 10 minutes per period; ?refresh=true writes a new one.
exports.getInsights = async (req, res, next) => {
    const months = readMonths(req);
    try {
        const insights = await getInsights(months, { refresh: req.query.refresh === 'true' });
        res.status(200).json(insights);
    }
    catch (err) {
        next(err);
    }
}

// GET /analytics/review-flow → status changes in the period, for the Sankey chart
exports.getReviewFlow = async (req, res, next) => {
    const months = readMonths(req);
    try {
        const links = await stats.reviewFlow(months);
        res.status(200).json({ months, links });
    }
    catch (err) {
        next(err);
    }
}

// GET /analytics/oldest-posts → oldest posts in some statuses (default: waiting for review).
// Not limited to the period: a post waiting for 8 months still needs attention.
exports.getOldestPosts = async (req, res, next) => {
    readMonths(req);   // only for the validation check
    const statuses = req.query.status ? [req.query.status] : ['pending', 'clarification'];
    const limit = Number(req.query.limit || 8);
    const viewer = { userId: req.userId, role: req.userRole };
    try {
        const posts = await stats.oldestPosts(viewer, statuses, limit);
        res.status(200).json({ statuses, posts });
    }
    catch (err) {
        next(err);
    }
}
