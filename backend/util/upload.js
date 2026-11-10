const multer = require('multer');

const storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,'images');
    },
    filename:(req,file,cb)=>{
        cb(null,Date.now() + '-' + file.originalname);
    }
})

const fileFilter = (req,file,cb)=>{
    if(['image/png','image/jpeg','image/jpg'].includes(file.mimetype)){
        cb(null,true)
    }else{
        cb(null,false)
    }
}

module.exports = multer({
    storage:storage,
    fileFilter:fileFilter,
    limits:{fileSize:2*1024*1024}
})