const multer = require('multer');

// Keep the uploaded file in memory (req.file.buffer) instead of writing it to disk.
// util/images.js then decides where it goes: Cloudinary in production (Render's disk is wiped
// on every restart), or the local images/ folder in development.

const fileFilter = (req,file,cb)=>{
    if(['image/png','image/jpeg','image/jpg'].includes(file.mimetype)){
        cb(null,true)
    }else{
        cb(null,false)
    }
}

module.exports = multer({
    storage:multer.memoryStorage(),
    fileFilter:fileFilter,
    limits:{fileSize:2*1024*1024}   // 2 MB, so holding it in memory is fine
})
