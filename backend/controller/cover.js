// AI-designed covers: POST /feed/ai/cover-design { title, content? } → { design, source }
// Gemini designs it (colours, pattern, emoji, tagline); the browser draws the PNG and uploads it as the
// post image through the normal POST/PUT /feed/posts → Cloudinary path.

const { validationResult } = require('express-validator');
const { designFor } = require('../util/cover-design');

exports.design = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ message: 'Invalid details', errors: errors.array() });
    }
    try {
        const result = await designFor(req.body.title.trim(), (req.body.content || '').trim());
        res.status(200).json(result);
    } catch (err) {
        if (!err.statusCode) err.statusCode = 500;
        next(err);
    }
};
