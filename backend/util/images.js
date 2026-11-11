// Where post images are stored — one place for it, like util/database.js for the database:
//   • CLOUDINARY_URL set (production) → Cloudinary; img_url = "https://res.cloudinary.com/…"
//   • otherwise (local development)   → backend/images/; img_url = "images/<file>"
// The frontend shows both: full https URLs as they are, relative paths through /api.

const fs = require('fs/promises');
const path = require('path');
const cloudinary = require('cloudinary').v2;

const useCloudinary = !!process.env.CLOUDINARY_URL;   // the SDK reads the URL from the environment
const FOLDER = 'wordnest/posts';                        // folder inside your Cloudinary account
const LOCAL_DIR = path.join(__dirname, '..', 'images');

if (useCloudinary) {
    cloudinary.config({ secure: true });                 // always return https URLs
}

const imageError = (message, err) => {
    console.log(message, err && err.message);
    const error = new Error(message);
    error.statusCode = 502;
    return error;
};

// Save an uploaded file (req.file from multer memoryStorage). Returns the value for posts.img_url.
exports.save = async (file) => {
    if (useCloudinary) {
        try {
            const result = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: FOLDER, resource_type: 'image' },
                    (err, res) => (err ? reject(err) : resolve(res))
                );
                stream.end(file.buffer);
            });
            return result.secure_url;
        } catch (err) {
            throw imageError('Image upload failed, please try again', err);
        }
    }
    // local: same naming as before (timestamp-originalname); basename() blocks paths like "../../x.png"
    const name = `${Date.now()}-${path.basename(file.originalname).replace(/\s+/g, '-')}`;
    await fs.writeFile(path.join(LOCAL_DIR, name), file.buffer);
    return `images/${name}`;
};

// Delete a stored image by its img_url. Never throws: a missing image is only logged,
// so a failed clean-up can't break the request that triggered it.
exports.remove = async (imgUrl) => {
    if (!imgUrl) return;
    try {
        if (/^https?:\/\//.test(imgUrl)) {
            const publicId = cloudinaryPublicId(imgUrl);
            if (publicId && useCloudinary) {
                await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
            }
            return;   // a URL we don't manage (or Cloudinary not configured here): leave it
        }
        await fs.unlink(path.join(__dirname, '..', imgUrl));
    } catch (err) {
        console.log('Could not delete image', err.message);
    }
};

// "https://res.cloudinary.com/<cloud>/image/upload/v1731234567/wordnest/posts/abc.png" → "wordnest/posts/abc"
function cloudinaryPublicId(url) {
    const match = url.match(/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
    return match ? match[1] : null;
}

exports.usingCloudinary = useCloudinary;
