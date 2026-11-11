require('dotenv').config();
const express = require('express')
const feedRoutes = require('./routes/feed')
const bodyParser = require('body-parser')
const pool = require('./util/database')
const path = require('path')
const authRoutes = require('./routes/auth')
const chatRoutes = require('./routes/chat')
const commentRoutes = require('./routes/comments')
const fs = require('fs')
const YAML = require('yaml')
const swaggerUi = require('swagger-ui-express')
const app = express();
app.use((req,res,next)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PATCH, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
})
app.use(express.json()); 
app.use(bodyParser.json())
app.use('/auth',authRoutes);
app.use('/feed',feedRoutes);
app.use('/feed',commentRoutes);   // /feed/posts/:postId/comments, /feed/comments/:commentId
app.use('/chat',chatRoutes);   // blog chatbot: our intent model (ai-service) + DB + Gemini

// API docs: Swagger UI at /docs, raw spec at /docs/openapi.json (source: docs/openapi.yaml)
const openapi = YAML.parse(fs.readFileSync(path.join(__dirname,'docs','openapi.yaml'),'utf8'));
app.get('/docs/openapi.json',(req,res)=>res.json(openapi));
app.use('/docs',swaggerUi.serve,swaggerUi.setup(openapi,{
    customSiteTitle:'Blog App API',
    swaggerOptions:{ persistAuthorization:true }   // keep the token after a page refresh
}));

pool.query('SELECT NOW()')
.then(res=>{console.log('DB Connection sucess')})
.catch(err=>{console.log('DB Connection failed')})

app.use('/images',express.static(path.join(__dirname,'images')));

app.use((error,req,res,next)=>{
    const status = error.statusCode || 500;
    const message = error.message;
    res.status(status).json({
        message : message,
        data : error.data
    })
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    // wake the Python AI service now, so the first chat message doesn't wait for its cold start
    require('./util/ai-service').warmUp();
})
