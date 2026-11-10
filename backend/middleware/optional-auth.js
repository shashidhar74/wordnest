const jwt = require('jsonwebtoken');

// Like is-auth.js, but for PUBLIC routes: a token is optional.
//   no Authorization header → guest (req.userId / req.userRole stay undefined)
//   valid token             → req.userId and req.userRole are set, same as is-auth
//   invalid / expired token → 401, so the frontend signs out instead of silently showing less
module.exports = (req, res, next) => {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
        return next();   // guest
    }
    const token = authHeader.split(' ')[1];
    let decodedToken;
    try {
        decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({
            message: 'Invalid or expired token'
        });
    }
    req.userId = decodedToken.userId;
    req.userRole = decodedToken.role;
    next();
};
