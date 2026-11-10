const express = require('express');
const {body,param,query} = require('express-validator')
const authController = require('../controller/auth')


const router = express.Router();

router.post('/users',[
    body('name').trim().notEmpty(),
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isLength({min:6})
],authController.createUser)

router.post('/login',[
    body('email').trim().isEmail().normalizeEmail(),
    body('password').notEmpty()
],authController.loginUser)


module.exports = router;