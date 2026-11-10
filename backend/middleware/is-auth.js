const jwt = require('jsonwebtoken');

module.exports = (req,res,next)=>{
    const authHeader = req.get('Authorization');
    if(!authHeader){
        return res.status(401).json({
            message : 'Not authenticated'
        })
    }
    const token = authHeader.split(' ')[1];
    let decodeToken;
    try{
        decodeToken = jwt.verify(token,process.env.JWT_SECRET)
    }catch(err){
        return res.status(401).json({
            message : 'Invalid or expired token'
        })
    }
    req.userId = decodeToken.userId;
    req.userRole = decodeToken.role;
    next();
}