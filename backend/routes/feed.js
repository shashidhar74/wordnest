const express = require('express');
const feedController = require('../controller/feed')
const {body,param, query}= require('express-validator')
const upload = require('../util/upload')
const isAuth = require('../middleware/is-auth')
const optionalAuth = require('../middleware/optional-auth')
const hasRole = require('../middleware/has-role')
const {aiLimiter} = require('../middleware/rate-limit')

const router = express.Router();
// public, but a token (if sent) widens what you see: creators → +own posts, admins → all
router.get('/posts',optionalAuth,[
    query('page').optional().isInt({min:1}).toInt(),
    query('limit').optional().isInt({min:1,max:50}).toInt(),
    // query('status').optional().isIn(['draft','published']).withMessage('Invalid Status'),
    query('search').optional().trim().isLength({min:1,max:100}),
],feedController.getPosts)

router.post('/posts',isAuth,hasRole('creator'),upload.single('image'),[
    body('title').trim().isLength({min:5}),
    body('content').trim().isLength({min:5})
],feedController.createPost)

router.get('/posts/:postId',optionalAuth,[
    param('postId').isInt({min:1}).withMessage('Post Id is mandatory')
],feedController.getPostById)

router.put('/posts/:postId',isAuth,upload.single('image'),[
    param('postId').isInt({min:1}).withMessage('Post Id is mandatory'),
    body('title').trim().isLength({min:5}),
    body('content').trim().isLength({min:5})
],feedController.updatePost)

// router.get('/posts/search',[
//    query('title').trim().notEmpty().withMessage('Search text required')
// ],feedController.getPostsByTitle)

router.delete('/posts/:postId',isAuth,hasRole('creator','admin'),[
    param('postId').isInt({min:1}).withMessage('Post Id is mandatory')
],feedController.deletePostById)

const postId = param('postId').isInt({min:1}).withMessage('Post Id is mandatory');
const comment = body('comment').trim().notEmpty().withMessage('Comment is required');

router.patch('/posts/:postId/submit',isAuth,hasRole('creator'),[postId],feedController.changeStatus('submit'));
router.patch('/posts/:postId/send-back', isAuth, hasRole('admin'),            [postId, comment], feedController.changeStatus('sendBack'))
router.patch('/posts/:postId/approve',  isAuth, hasRole('admin'),            [postId],          feedController.changeStatus('approve'))
router.patch('/posts/:postId/reject',   isAuth, hasRole('admin'),            [postId, comment], feedController.changeStatus('reject'))
router.patch('/posts/:postId/close',    isAuth, hasRole('creator','admin'),  [postId],          feedController.changeStatus('close'))

// AI features
router.post('/posts/:postId/summary',isAuth,aiLimiter,[postId],feedController.summarizePost)

router.post('/ai/generate-post',isAuth,aiLimiter,hasRole('creator'),[
    body('topic').trim().isLength({min:3,max:200}).withMessage('Topic must be 3 to 200 characters'),
    body('tone').optional().isIn(['formal','casual','funny','informative']).withMessage('Invalid tone'),
    body('keywords').optional().trim().isLength({max:200}).withMessage('Keywords must be under 200 characters')
],feedController.generatePost)

module.exports = router;