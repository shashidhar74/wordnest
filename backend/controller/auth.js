const {validationResult} = require('express-validator');
const pool = require('../util/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


exports.createUser = async (req,res,next)=>{
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        const error = new Error('Invalid user details!!');
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }
    try{
        const isEmailExist = await pool.query('SELECT id FROM users WHERE email=$1',[req.body.email]);
        if(isEmailExist.rows.length != 0){
            const error = new Error('Email is already exist!!');
            error.statusCode = 409;
            throw error;
        }
        const hashedPw = await bcrypt.hash(req.body.password,12);
        const result = await pool.query('INSERT INTO users (name,email,password) VALUES($1,$2,$3) RETURNING id,name,email',
            [req.body.name,req.body.email,hashedPw]
        )
        res.status(201).json({
            message:'User created Sucessfully!!',
            data:result.rows[0]
        })
    }catch(err){
        // const error = new Error('Error occured while creating user pls try again!!!');
        if (err.code === '23505') {   // PostgreSQL's code for a unique constraint violation
            err.statusCode = 409;
            err.message = 'Email already exists!!';
        }
        if(!err.statusCode){
            err.statusCode = 500;
        }
        next(err);
    }
}

exports.loginUser = async (req,res,next)=>{
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        const error = new Error('Invalid Login Credentials!!');
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }
    const email = req.body.email;
    const password = req.body.password;
    try{
        const result = await pool.query('SELECT * FROM users WHERE email=$1',[email]);
        if(result.rows.length === 0){
            const error = new Error('Invalid email or password!!');
            error.statusCode = 401;
            throw error;
        }
        const user = result.rows[0];
        const isEqual = await bcrypt.compare(password,user.password);
        if(!isEqual){
            const error = new Error('Invalid email or password!!')
            error.statusCode = 401;
            throw error;
        }
        const token = jwt.sign(
            {userId : user.id,email:user.email,role:user.role},
            process.env.JWT_SECRET,
            {expiresIn:'1h'}
        )
        res.status(200).json({
            message : 'Login Sucess!!',
            token:token,
            userId:user.id
        })
    }catch(err){
         if(!err.statusCode){
            err.statusCode = 500;
        }
        next(err);
    }
}