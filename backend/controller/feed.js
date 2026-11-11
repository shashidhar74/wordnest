// HTTP layer for /feed: validation results, permissions, status codes and JSON.
// All SQL is in models/post.js.

const {validationResult} = require('express-validator')
const Post = require('../models/post')
const Images = require('../util/images')   // Cloudinary in production, backend/images/ locally
const ai = require('../util/ai')
const { getSummary } = require('../util/summary')

const TRANSITIONS = {
    submit:   { from: ['draft','clarification'], to: 'pending',       ownerOnly: true  },
    sendBack: { from: ['pending'],               to: 'clarification', needsComment: true },
    approve:  { from: ['pending'],               to: 'published' },
    reject:   { from: ['pending'],               to: 'rejected',      needsComment: true },
    close:    { from: ['published'],             to: 'closed',        ownerOnly: true  }
};

// who is asking: { userId, role } from the token, or {} for a guest (see middleware/optional-auth.js)
const viewerOf = (req) => ({ userId: req.userId, role: req.userRole });


exports.getPosts =async (req,res,next)=>{
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({
            message:"Validation failed , entered incorrect data",
            errors:errors.array()
        })
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    try{
        // guests and users only get published posts; creators also their own; admins everything
        const { posts, total } = await Post.list({
            viewer: viewerOf(req),
            search: req.query.search,
            status: req.query.status,
            page,
            limit
        });
        res.status(200).json({
            posts:posts,
            limit:limit,
            total:total,
            totalPages:Math.ceil(total / limit)
        })
    }catch(err){
        res.status(500).json({
            message:'Failed to fetch the posts',
            error:err.message
        })
    }
}

exports.createPost = async (req,res,next)=>{
    // the uploaded file is only in memory at this point, so a rejected request leaves nothing to clean up
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        const error = new Error('Validation failid,entered incorrect data');
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }
    if(!req.file){
        return res.status(422).json({
            message : 'Image is required (png/jpg only)'
        })
    }
    let imgUrl;
    try {
        imgUrl = await Images.save(req.file);   // stored only after validation passed
        const post = await Post.create({
            title: req.body.title,
            content: req.body.content,
            imgUrl: imgUrl,
            userId: req.userId
        });
        res.status(201).json({
            message: 'Post created sucessfully',
            post: post
        });
    } catch (err) {
        await Images.remove(imgUrl);   // the post wasn't saved, so don't keep its image
        if(!err.statusCode){
            err.statusCode = 500;
        }
        next(err);
    }

}

exports.updatePost = async (req,res,next) => {
    const id = req.params.postId;
    // the new file (if any) is only in memory until all checks pass, so early returns need no clean-up
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({
            message:'Validation failid,entered incorrect data',
            errors:errors.array()
        })
    }
    let newImgUrl = null;
    try{
        const existing = await Post.findMeta(id);
        if(!existing){
            return res.status(404).json({message:'Post Not Found!!'});
        }
        if(existing.user_id !== req.userId){
            return res.status(403).json({ message: 'Not authorized' });
        }
        if(!['draft','clarification'].includes(existing.status)){
            return res.status(409).json({ message:`Cannot edit a ${existing.status} post` });
        }

        const oldImgUrl = existing.img_url;
        // keep the old image unless a new one was uploaded
        if(req.file){
            newImgUrl = await Images.save(req.file);
        }
        const post = await Post.update(id, {
            title: req.body.title,
            content: req.body.content,
            imgUrl: newImgUrl || oldImgUrl
        });
        // delete the old image only after the UPDATE succeeded
        if (newImgUrl && oldImgUrl && oldImgUrl !== newImgUrl) {
            await Images.remove(oldImgUrl);
        }
        res.status(200).json({
            message:'Post Updated Sucessfully!!',
            post:post
        })
    }catch(err){
        await Images.remove(newImgUrl);   // the update failed: don't keep the new image
        res.status(err.statusCode || 500).json({
            message: err.statusCode ? err.message : 'Updateing post failed',
            error:err.message
        })
    }

}

exports.getPostById = async (req,res,next)=>{
    const id = req.params.postId;
     const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({
            message:'Invalid Post Details',
            errors:errors.array()
        })
    }
    try{
        // a hidden post (e.g. someone else's draft) answers 404, the same as a missing one
        const post = await Post.findVisible(id, viewerOf(req));
        if(!post){
            return res.status(404).json({
                message:'Post Not Found!!'
            });
        }
        res.status(200).json({
            post:post
        })
    }catch(err){
        res.status(500).json({
            message:'Fetching Post Failed',
            error:err.message
        })
    }

}

exports.deletePostById = async (req,res,next)=>{
    const id = req.params.postId;
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({
            message:'Invalid Post Details',
            errors:errors.array()
        })
    }
    try{
        // (1) find the post
        const post = await Post.findMeta(id);
        if(!post){
            return res.status(404).json({ message:'Post Not Found!!' });
        }
        const isOwner = post.user_id === req.userId;
        const isAdmin = req.userRole === 'admin';
        // (2) only the owner or an admin can delete
        if(!isAdmin && !isOwner){
            return res.status(403).json({
                message:'Not authorized'
            })
        }
        // (3) the owner can only delete posts that aren't live; an admin can delete any post
        if(!isAdmin && !['draft','rejected'].includes(post.status)){
            return res.status(409).json({
                message : `Cannot delete a ${post.status} post`
            })
        }
        const deleted = await Post.remove(id);
        if(deleted && deleted.img_url){
            await Images.remove(deleted.img_url);   // Cloudinary or the local file
        }
        res.status(200).json({
            message:'Post deleted sucessfully'
        })
    }catch(err){
        res.status(500).json({
            message:'Failed to delete the Post',
            error:err.message
        })
    }
}

exports.changeStatus = (action) =>{
    const rule = TRANSITIONS[action];

    return async (req,res,next) => {
        const id = req.params.postId;
        const errors = validationResult(req);
        if(!errors.isEmpty()){
            return res.status(422).json({
                message : 'Invalid details',
                error:errors.array()
            })
        }

        try{
            const postData = await Post.findMeta(id);
            if(!postData){
                return res.status(404).json({
                    message : 'Post Not found!!'
                })
            }
            if(rule.ownerOnly && postData.user_id !== req.userId && req.userRole !== 'admin'){
                return res.status(403).json({
                    message : 'Not authorized'
                })
            }
            if(!rule.from.includes(postData.status)){
                return res.status(409).json({
                    message : `Cannot ${action} a ${postData.status} post`
                })
            }
            const post = await Post.changeStatus(id, {
                from: rule.from,
                to: rule.to,
                comment: rule.needsComment ? req.body.comment : null,
                isReview: req.userRole === 'admin',
                reviewerId: req.userId
            });
            if(!post){
                 return res.status(409).json({ message:'Post status has changed, please refresh' });
            }
            res.status(200).json({
                message:`Post ${rule.to}`,
                post:post
            });

        }catch(err){
            res.status(500).json({ message:'Changing status failed', error:err.message });
        }

    }
}

exports.summarizePost = async (req,res,next)=>{
    const id = req.params.postId;
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({
            message:'Invalid Post Details',
            errors:errors.array()
        })
    }
    try{
        // same visibility as GET /feed/posts/:id: nobody can summarize a post they can't read
        const post = await Post.findVisible(id, viewerOf(req));
        if(!post){
            return res.status(404).json({ message:'Post Not Found!!' });
        }
        // saved summary if there is one; otherwise Gemini, falling back to our own summarizer.
        // { "refresh": true } in the body (the "Regenerate" button) skips the saved one.
        const result = await getSummary(post, { refresh: req.body && req.body.refresh === true });
        res.status(200).json({
            summary: result.summary,
            source: result.source,     // 'gemini' | 'extractive'
            cached: result.cached      // true = returned from the database, no AI call
        })
    }catch(err){
        // AI errors already carry a statusCode (429, 503 ...); anything else is a 500
        if(!err.statusCode){
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.generatePost = async (req,res,next)=>{
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({
            message:'Invalid details',
            errors:errors.array()
        })
    }
    try{
        const draft = await ai.generatePost(
            req.body.topic,
            req.body.tone || 'informative',
            req.body.keywords || ''
        );
        // not saved: the frontend fills the "New post" form, the creator saves it as a draft
        res.status(200).json({
            title:draft.title,
            content:draft.content
        })
    }catch(err){
        if(!err.statusCode){
            err.statusCode = 500;
        }
        next(err);
    }
}
