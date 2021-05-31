const { Client } = require('pg');
const express = require("express")
const cors = require("cors")
const axios = require("axios")
const nodemailer = require("nodemailer")

const app = express()
app.use(express.json());
app.use(cors())

const client = new Client({
    user: 'ayushpayasi',
    host: 'apttestdb.cqgz43wq9ns0.ap-south-1.rds.amazonaws.com',
    database: 'postgres',
    password: 'Ayush123',
    port: 5432
})

client.connect()

var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
           user: 'ayushpayasi@gmail.com',
           pass: 'MH34k2909'
       }
   });

const checks = {
    userExists : async (contact)=>{
        try{
        const result = await client.query(`SELECT "userId" FROM apttestuser WHERE contact = $1`,[contact])
        return result.rows.length
        }
        catch(e){
            console.log(e)
            return "failed"
        }
    }
}

const communication = {
    sendReportsMail: async (to,name)=>{

        const mailOptions = {
            from: 'ayushpayasi@gmail.com',
            to: `${to}`,
            subject: `Welcome to APT Diagnostics ${name}`,
            html: `<p>Welcome ${name}</p>`
          }

        await transporter.sendMail(mailOptions,(err, info)=>{
            if(err)
                console.log(err)
            else
                console.log(info);
        })
    },
    sendOTP:async(to,name)=>{

    }

}

const liveHealthApiRequest ={
    labAppointment:async(data)=>{
        try{
           const response = await axios.post("https://staging.livehealth.solutions/LHRegisterBillAPI/a6277e50-bc7d-11eb-aed7-0afba0d18fd2/",data)
            return {code:"200",data:response}
        } 
        catch(err){
            return {code:"400",data:err}
        }
    },
    homeAppointment:async (data)=>{
        try{
            const response = await axios.post("https://staging.livehealth.solutions/LHRegisterBillAPI/a6277e50-bc7d-11eb-aed7-0afba0d18fd2/",data)
             console.log(response)
             return {code:"200",data:response}
         } 
         catch(err){
             return {code:"400",data:err}
         }
    },
}

const localDatabaseRequest ={
    createNewUser: async (body)=>{
        try{
        const response = await client.query(`INSERT INTO "apttestuser" ("contact") VALUES ($1)`,[body["mobile"]])
        return true
        }catch (err){
            return false
        }
    },
    getList: async (body)=>{
        try{
        const response = await client.query(`SELECT "billList","appointmentList","reportList" FROM "apttestuser" WHERE "contact" = ($1) ;`,[body["mobile"]])
        if(response.rows.length){
            return { ...response.rows[0] , contains:1}
        }
        else{
            return {contains:0}
        }
        }catch(e){
            return {...e, contains:0}
        }
    },
    updateUserInfo: async (body,billList)=>{
        try{
            if("billId" in body){
                billList.push(body["billId"])
            }
            const response = await client.query(`UPDATE "apttestuser" SET "userName" = ($1), "age" = ($2), "billlist" = ($3) WHERE "contact" = ($4) ;`,[body["fullName"],body["age"],billList,body["mobile"]])
            console.log(response)
        }
        catch (err){
            console.log(err)
        }
    },

}

app.post("/userCheck",async (req,res)=>{
    if (await checks.userExists(req.body["mobile"])){
        res.send("exists").status(200)
    }
    else{
        res.send("Do not exists").status(404)
    }

})

app.post("/createNewUser",async (req,res)=>{
    if (await localDatabaseRequest.createNewUser(req.body)){
        res.send("new User Creted").status(201)
    }
    else{
        res.send("failed to create new user").status(500)
    }
})

// unchecked
app.post("/updateUser",async (req,res)=>{

try{
    var billList = []
    var appointmentList = []
    var reportList = []

    const list = await localDatabaseRequest.getList(req.body)
    if (list.contains){
        billList = list.billList
        appointmentList =list.appointmentList
        reportList = list.reportList
    }
    // address may not be present perform check
    const isUpdated = await client.query(`UPDATE "apttestuser" SET "dob" = $1,  "email" = $2 , "gender" = $3 , "address" = $4 , "city" = $5 , "pincode" = $6, "billList" = $7 , "reportList" = $8 ,"appointmentList" = $9, "userName" = $10 WHERE "contact" = $11 `,
    [
        req.body["dob"],req.body["email"],req.body["gender"],req.body["area"],req.body["city"],req.body["pincode"],billList,reportList,appointmentList,req.body["fullName"],req.body["mobile"]
    ])
    console.log(isUpdated)
}
catch(err){
    console.log(err)
    res.send("internal server error").status(500)
}

})

app.post("/createAppointment/lab",async(req,res)=>{
    const localSaveBody = {contact : req.body["mobile"],
    name : req.body["fullName"],
    email : req.body["email"],
    age : req.body["age"],
    gender : req.body["gender"],
    area : req.body["area"],
    city: req.body["city"],
    pincode: req.body["pincode"]}

    if (await checks.userExists(req.body["mobile"])){
        const billList = await localDatabaseRequest.getBillList(req.body["mobile"])
        const response = await liveHealthApiRequest.labAppointment(req.body)
        if (response.code === "200"){   
            const billId = response.data["billId"]
        }
        else{
            res.send("failed to book Appointment!").status(400)
        }

        localDatabaseRequest.updateUserInfo()
    }
    else{

    }
})

app.get("/priceList",async (req,res)=>{
    try{
    const response = await axios.get("https://staging.livehealth.solutions/getAllTestsAndProfiles/?token=a6277e50-bc7d-11eb-aed7-0afba0d18fd2")
    const coupon = req.query.coupon
    switch (coupon) {
        case "SENIOR" :
            res.json([{code:200},response.data["testList"]])
            break;
        case "GYMFREAK" :
            res.json([{code:200},response.data["testList"]])
            break;
        default :
            res.json([{code:200},{...response.data["testList"]}])
            break;
    }
    }catch(err){
        console.log(err)
        res.send("failed").status(200)
    }
})

app.post("/check",async (req,res)=>{
    try{
        const billList =[]
        const reportList =[]
        const appointmentList = []
        // const billList = await localDatabaseRequest.getBillList(req.body)
        // const response = await localDatabaseRequest.updateUserInfo(req.body,billList)
        // console.log(billList)
        // res.send("success").status(200)
        

    res.send("success").status(200)

    }
    catch(err){
        console.log(err)
        res.send("failed").status(400)
    }
})

app.post("/bookLabAppointment",async (req,res)=>{
    try{
    if(await checkUser(req.body["mobile"])){1
        const result = await liveHealthApiCall.labAppointment(req.body)
        if (result.code === "200"){
            console.log(result)
            res.code(200)
        }
        else{
            res.code(400)
        }
        res.send("user Exist").status(200)
    }
    else{
        // res.send("register new user").status(200)
        client.query("INSERT INTO apttestuser () VALUES ()")
    }}
    catch(e){
        console.log(e)
        res.send("there is a problem in processing request at this time").status(500)
    }
    
})

app.post("/login",async (req,res)=>{
    try{
    const result = await client.query("select * from apttestuser")
    console.log(result.rows)
    res.status(200).send("success")
    }
    catch(e){
        console.log(e)
        res.status(400).send("failed")
    }
})




// app.use()





app.post("/storeBill",(req,res)=>{
    console.log(req.body)
    res.json({"code":200})
})

app.post("/storeReport",async (req,res)=>{
    try{
     const result = await client.query(
        "INSERT INTO apttestreports VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",    [
            req.body["CentreReportId"],
            req.body["labId"],
            req.body["billId"],
            req.body["dictionaryId"],
            req.body["Report Id"],
            req.body["reportDate"],
            req.body["Patient Id"],
            req.body["labReportId"],
            req.body["Contact No"],
            req.body["testId"],
            req.body["reportBase64"]
        ])
    // console.log(result)
    res.status(200).send("successful")
    }catch(e){
        console.log(e);
        res.status(400).send("failed")
    }
})

app.get("/getReport",async(req,res)=>{
    try{
    const result = await client.query("SELECT * FROM apttestreports WHERE contact = $1",[req.query.contact])
    res.json(result.rows)
    }
    catch(e){
        console.log(e)
        res.status(400).send("failed")
    }
})

app.listen(process.env.PORT || 5000,()=>{
    console.log(process.env.PORT || 5000)
})