// HTTP layer for /feed: validation results, permissions, status codes and JSON.
// All SQL is in models/post.js.

const {validationResult} = require('express-validator')
const fs = require('fs/promises')
const path = require('path')
const Post = require('../models/post')
const ai = require('../util/ai')

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
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        if(req.file){
        await clearImage(req.file.path);
        }
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
    const imgUrl = req.file.path.replace(/\\/g, '/')
    try {
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
        await clearImage(req.file.path)
        if(!err.statusCode){
            err.statusCode = 500;
        }
        next(err);
    }

}

exports.updatePost = async (req,res,next) => {
    const id = req.params.postId;
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        if(req.file){
            await clearImage(req.file.path);
        }
        return res.status(422).json({
            message:'Validation failid,entered incorrect data',
            errors:errors.array()
        })
    }
    try{
        const existing = await Post.findMeta(id);
        if(!existing){
            if(req.file){
                await clearImage(req.file.path);
            }
            return res.status(404).json({message:'Post Not Found!!'});
        }
        if(existing.user_id !== req.userId){
            if(req.file){
                await clearImage(req.file.path);
            }
            return res.status(403).json({ message: 'Not authorized' });
        }
        if(!['draft','clarification'].includes(existing.status)){
            if(req.file){ await clearImage(req.file.path); }
            return res.status(409).json({ message:`Cannot edit a ${existing.status} post` });
        }

        const oldImgUrl = existing.img_url;
        // keep the old image unless a new one was uploaded
        let newImgUrl = oldImgUrl;
        if(req.file){
            newImgUrl = req.file.path.replace(/\\/g, '/');
        }
        const post = await Post.update(id, {
            title: req.body.title,
            content: req.body.content,
            imgUrl: newImgUrl
        });
        if (oldImgUrl && oldImgUrl !== newImgUrl) {
            await clearImage(oldImgUrl);
        }
        res.status(200).json({
            message:'Post Updated Sucessfully!!',
            post:post
        })
    }catch(err){
        if(req.file){
            await clearImage(req.file.path);
        }
        res.status(500).json({
            message:'Updateing post failed',
            error:err.message
        })
    }

}

const clearImage = async(filePath)=>{
    try{
        await fs.unlink(path.join(__dirname,'..',filePath))
    }catch(err){
        console.log('Could not delete image',err.message)
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
            await clearImage(deleted.img_url);
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
        const summary = await ai.summarize(post.title, post.content);
        res.status(200).json({
            summary:summary
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
