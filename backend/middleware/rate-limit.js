const { rateLimit } = require('express-rate-limit');

const tooMany = (message) => (req,res,next)=>{
    res.status(429).json({
        message:message
    })
}

// Login: 5 failed attempts per 15 minutes, per IP. Successful logins don't count.
exports.loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    limit: 5,
    skipSuccessfulRequests: true,   // only count failed attempts
    standardHeaders: 'draft-8',   // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,   // Disable the `X-RateLimit-*` headers
    handler: tooMany('Too many failed login attempts, please try again later.')
})

// Sign up: 5 new accounts per hour, per IP
exports.signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hour
    limit: 5,
    standardHeaders: 'draft-8',   // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,   // Disable the `X-RateLimit-*` headers
    handler: tooMany('Too many accounts created from this IP, please try again later.')
})

// AI features (summary, generate, chat): 30 requests per 10 minutes, per USER.
// These routes are behind isAuth, so req.userId exists; counting per user is fairer than per IP
// (many people can share one IP, e.g. an office).
exports.aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,   // 10 minutes
    limit: 30,
    keyGenerator: (req) => `user:${req.userId}`,    // count per user, not per IP
    standardHeaders: 'draft-8',   // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,   // Disable the `X-RateLimit-*` headers
    handler: tooMany('Too many AI requests, please try again later.')
})