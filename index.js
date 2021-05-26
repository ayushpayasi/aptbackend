const { Client } = require('pg');
const express = require("express")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json());


// const client = new Client({
//     user: 'ayushpayasi@apttest2',
//     host: 'apttest2.postgres.database.azure.com',
//     database: 'postgres',
//     password: 'Ayush@123',
//     port: 5432,
//     sslmode:"require",
//     ssl:true
// });
// client.connect()


const client = new Client({
    user: 'ayushpayasi',
    host: 'apttestdb.cqgz43wq9ns0.ap-south-1.rds.amazonaws.com',
    database: 'postgres',
    password: 'Ayush123',
    port: 5432
})
client.connect()

const checkUser = async (contact)=>{
    try{
    const result = await client.query(`SELECT "userId" FROM apttestuser WHERE contact = $1`,[contact])
    return result.rows
    }
    catch(e){
        console.log(e)
        return "failed"
    }
}


app.post("/bookLabAppointment",async (req,res)=>{
    console.log(await checkUser(req.body["mobile"]))
    res.send("check").status(200)
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
    console.log(result)
    res.status(200).send("test")
    }catch(e){
        console.log(e);
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
    console.log("listening on port 5000")
})