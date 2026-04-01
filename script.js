require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const multer = require("multer")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)

const io = new Server(server,{
    cors:{origin:"*"}
})

app.use(cors())
app.use(express.json())
app.use("/uploads", express.static("uploads"))

/* =========================
DATABASE CONNECTION
========================= */

mongoose.connect("mongodb://127.0.0.1:27017/ignite",{
    useNewUrlParser:true,
    useUnifiedTopology:true
})
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log(err))


/* =========================
USER MODEL
========================= */

const UserSchema = new mongoose.Schema({

    name:String,
    email:{type:String,unique:true},
    password:String,

    gender:String,
    preference:String,
    location:String,
    image:String,

    likes:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    }],

    matches:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    }]

})

const User = mongoose.model("User",UserSchema)


/* =========================
MESSAGE MODEL
========================= */

const MessageSchema = new mongoose.Schema({

    sender:String,
    receiver:String,
    text:String,
    time:{type:Date,default:Date.now}

})

const Message = mongoose.model("Message",MessageSchema)


/* =========================
IMAGE UPLOAD
========================= */

const storage = multer.diskStorage({

    destination:(req,file,cb)=>{
        cb(null,"uploads/")
    },

    filename:(req,file,cb)=>{
        cb(null,Date.now()+"-"+file.originalname)
    }

})

const upload = multer({storage})


/* =========================
AUTHENTICATION
========================= */

function auth(req,res,next){

    const token = req.headers["authorization"]

    if(!token) return res.status(403).json("No token")

    try{

        const decoded = jwt.verify(token,"igniteSecret")

        req.user = decoded.id

        next()

    }catch{

        res.status(401).json("Invalid token")

    }

}


/* =========================
REGISTER
========================= */

app.post("/api/register", async(req,res)=>{

    try{

        const {name,email,password} = req.body

        const hash = await bcrypt.hash(password,10)

        const user = new User({
            name,
            email,
            password:hash
        })

        await user.save()

        res.json({message:"User registered"})

    }catch(err){

        res.status(500).json(err)

    }

})


/* =========================
LOGIN
========================= */

app.post("/api/login", async(req,res)=>{

    const {email,password} = req.body

    const user = await User.findOne({email})

    if(!user) return res.status(400).json("User not found")

    const valid = await bcrypt.compare(password,user.password)

    if(!valid) return res.status(400).json("Wrong password")

    const token = jwt.sign({id:user._id},"igniteSecret")

    res.json({token,user})

})


/* =========================
PROFILE UPDATE
========================= */

app.post("/api/profile/update",auth,upload.single("image"),async(req,res)=>{

    const userId = req.user

    const updateData = {

        name:req.body.name,
        gender:req.body.gender,
        preference:req.body.preference,
        location:req.body.location

    }

    if(req.file){

        updateData.image = req.file.filename

    }

    await User.findByIdAndUpdate(userId,updateData)

    res.json({message:"Profile updated"})

})


/* =========================
DISCOVER USERS
========================= */

app.get("/api/discover",auth,async(req,res)=>{

    const users = await User.find({_id:{$ne:req.user}}).limit(20)

    res.json(users)

})


/* =========================
SWIPE SYSTEM
========================= */

app.post("/api/swipe",auth,async(req,res)=>{

    const {targetId,action} = req.body
    const userId = req.user

    if(action === "like"){

        const user = await User.findById(userId)

        user.likes.push(targetId)

        await user.save()

        const target = await User.findById(targetId)

        if(target.likes.includes(userId)){

            user.matches.push(targetId)
            target.matches.push(userId)

            await user.save()
            await target.save()

            return res.json({match:true})

        }

    }

    res.json({match:false})

})


/* =========================
GET MATCHES
========================= */

app.get("/api/matches",auth,async(req,res)=>{

    const user = await User.findById(req.user).populate("matches")

    res.json(user.matches)

})


/* =========================
SEND MESSAGE
========================= */

app.post("/api/message",auth,async(req,res)=>{

    const msg = new Message({

        sender:req.user,
        receiver:req.body.receiver,
        text:req.body.text

    })

    await msg.save()

    res.json({status:"sent"})

})


/* =========================
GET MESSAGES
========================= */

app.get("/api/messages/:userId",auth,async(req,res)=>{

    const messages = await Message.find({

        $or:[
            {sender:req.user,receiver:req.params.userId},
            {sender:req.params.userId,receiver:req.user}
        ]

    })

    res.json(messages)

})


/* =========================
SOCKET.IO CHAT
========================= */

io.on("connection",(socket)=>{

    console.log("User connected")

    socket.on("send_message",(data)=>{

        io.emit("receive_message",data)

    })

    socket.on("disconnect",()=>{

        console.log("User disconnected")

    })

})


/* =========================
SERVER START
========================= */

server.listen(5000,()=>{

    console.log("Ignite Backend Running on port 5000")

})
