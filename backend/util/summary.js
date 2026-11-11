// One place that decides how a post gets its summary (used by POST /feed/posts/:id/summary and the chat).
//
//   1. Saved summary on the post (posts.summary)?  → return it instantly, no AI call
//   2. Otherwise (or "Regenerate"):  Gemini        → best quality
//   3. Gemini busy / down / quota used up?          → our own summarizer (ai-service /summarize)
//   4. Save whichever worked on the post, so the next request is instant.
// Editing a post clears the saved summary (models/post.js → update), so it's never stale.

const ai = require('./ai');                 // Gemini
const aiService = require('./ai-service');  // our own extractive summarizer
const Post = require('../models/post');

// post: a row with id, title, content, summary, summary_source (e.g. from Post.findVisible)
// returns { summary, source: 'gemini' | 'extractive', cached: boolean }
exports.getSummary = async (post, { refresh = false } = {}) => {
    if (!refresh && post.summary) {
        return { summary: post.summary, source: post.summary_source, cached: true };
    }

    let summary, source;
    try {
        summary = await ai.summarize(post.title, post.content);
        source = 'gemini';
    } catch (geminiError) {
        console.log('Gemini summary failed, using our own summarizer:', geminiError.message);
        try {
            summary = await aiService.summarize(post.title, post.content);
            source = 'extractive';
        } catch (ownError) {
            // both failed: an older saved summary is still better than an error
            if (post.summary) {
                return { summary: post.summary, source: post.summary_source, cached: true };
            }
            throw geminiError;   // carries a useful status code (429 / 503 …)
        }
    }

    await Post.saveSummary(post.id, summary, source);
    return { summary, source, cached: false };
};
