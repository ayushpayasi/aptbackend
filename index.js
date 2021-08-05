const { Client } = require("pg");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const Razorpay = require("razorpay");
const upload = multer({ dest: "uploads/" });
const { uploadFile } = require("./s3");
const sgMail = require('@sendgrid/mail');



const app = express();

app.use(express.json());
app.use(cors());
sgMail.setApiKey(process.env.SENDGRID_API_KEY)


// mail client
const sendMail = async (to,text,template)=>{
  const msg = {
    to, // Change to your recipient
    from: 'info@aptdiagnostics.com', // Change to your verified sender
    subject: 'Sending with SendGrid is Fun',
    text,
    html:template,
  }

  sgMail.send(msg).then(() => {console.log('Email sent')}).catch((error) => {console.error(error)})

}

// db client
const client = new Client({
  user: process.env.DB_CLIENT_USER,
  host: process.env.DB_CLIENT_HOST,
  database: process.env.DB_CLIENT_DATABASE,
  password: process.env.DB_CLIENT_PASSWORD,
  port: 5432,
});

client.connect();

// sms client
const smsClient={
  sendOTP : async ()=>{const reuslt = await axios.post("http://api.pinnacle.in/index.php/sms/json")}

}




// payment gateway client
var razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEYID,
  key_secret: process.env.RAZORPAY_KEYSECRET
})


app.post("/makePaymentRazorpay", async (req,res)=>{
  try{  
    const currency = "INR"
    const amount = req.body.amount*100
    const response = await razorpay.orders.create({amount, currency})
    res.send(response).status(200)
  }catch(err){
    console.log(err)
    res.send(500)
  }
})


app.post("/confirmGiftPayment",async(req,res)=>{
  try{
    const result = await client.query(`INSERT INTO "aptgifts" VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
    req.body.userName,
    req.body.userEmail,
    req.body.userContact,
    req.body.recieverName,
    req.body.recieverContact,
    req.body.recieverEmail,
    req.body.couponCode,
    req.body.couponAmount,
    req.body.giftedTestList
    ]) 

    res.json({
      code:200,
      data:"",
    })

  }catch(err){
    console.log(err)
    res.json({
      code:500,
      data:"",
    })
  }
})



const checks = {
  userExists: async (contact) => {
    try {
      const result = await client.query(
        `SELECT "userId" FROM apttestuser WHERE contact = $1`,
        [contact]
      );
      return result.rows.length;
    } catch (e) {
      console.log(e);
      return "failed";
    }
  },
};

const communication = {
  sendReportsMail: async (to, testName) => {
    const mailOptions = {
      from: "ayushpayasi@gmail.com",
      to: `${to}`,
      subject: `Welcome to APT Diagnostics ${testName}`,
      html: `<p>Welcome ${testName}</p>`,
    };

    await transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.log(err);
      else console.log(info);
    });
  },
  sendOTP: async (to, testName) => {},
};

const liveHealthApiRequest = {
  labAppointment: async (data) => {
    try {
      const response = await axios.post(
        "https://staging.livehealth.solutions/LHRegisterBillAPI/a6277e50-bc7d-11eb-aed7-0afba0d18fd2/",
        data
      );
      return { code: "200", data: response.data };
    } catch (err) {
      return { code: "400", data: err };
    }
  },
  homeAppointment: async (data) => {
    try {
      const response = await axios.post(
        "https://staging.livehealth.solutions/LHRegisterBillAPI/a6277e50-bc7d-11eb-aed7-0afba0d18fd2/",
        data
      );
      return { code: "200", data: response };
    } catch (err) {
      return { code: "400", data: err };
    }
  },
};

const localDatabaseRequest = {
  createNewUser: async (body) => {
    try {
      const response = await client.query(
        `INSERT INTO "apttestuser" ("contact") VALUES ($1)`,
        [body["mobile"]]
      );
      return true;
    } catch (err) {
      return false;
    }
  },
  getList: async (body) => {
    try {
      const response = await client.query(
        `SELECT "billList","appointmentList","reportList" FROM "apttestuser" WHERE "contact" = ($1) ;`,
        [body["mobile"]]
      );
      if (response.rows.length) {
        return { ...response.rows[0], contains: 1 };
      } else {
        return { contains: 0 };
      }
    } catch (e) {
      return { ...e, contains: 0 };
    }
  },
  updateUserInfo: async (body, billList) => {
    try {
      if ("billId" in body) {
        billList.push(body["billId"]);
      }
      const response = await client.query(
        `UPDATE "apttestuser" SET "userName" = ($1), "age" = ($2), "billlist" = ($3) WHERE "contact" = ($4) ;`,
        [body["fullName"], body["age"], billList, body["mobile"]]
      );
    } catch (err) {
      console.log(err);
    }
  },
};

app.post("/userCheck", async (req, res) => {
  if (await checks.userExists(req.body["mobile"])) {
    res.send("exists").status(200);
  } else {
    res.send("Do not exists").status(404);
  }
});

app.post("/createNewUser", async (req, res) => {
  // if (await localDatabaseRequest.createNewUser(req.body)){
  res.send("new User Creted").status(201);
  // }
  // else{
  // res.send("failed to create new user").status(500)
  // }
});

// unchecked
app.post("/updateUser", async (req, res) => {
  try {
    var billList = [];
    var appointmentList = [];
    var reportList = [];

    const list = await localDatabaseRequest.getList(req.body);
    if (list.contains) {
      billList = list.billList;
      appointmentList = list.appointmentList;
      reportList = list.reportList;
    }
    // address may not be present perform check
    const isUpdated = await client.query(
      `UPDATE "apttestuser" SET "dob" = $1,  "email" = $2 , "gender" = $3 , "address" = $4 , "city" = $5 , "pincode" = $6, "billList" = $7 , "reportList" = $8 ,"appointmentList" = $9, "userName" = $10 WHERE "contact" = $11 `,
      [
        req.body["dob"],
        req.body["email"],
        req.body["gender"],
        req.body["area"],
        req.body["city"],
        req.body["pincode"],
        billList,
        reportList,
        appointmentList,
        req.body["fullName"],
        req.body["mobile"],
      ]
    );
  } catch (err) {
    console.log(err);
    res.send("internal server error").status(500);
  }
});



app.post("/createAppointment/lab", async (req, res) => {
  const localSaveBody = {
    contact: req.body["mobile"],
    testName: req.body["fullName"],
    email: req.body["email"],
    age: req.body["age"],
    gender: req.body["gender"],
    area: req.body["area"],
    city: req.body["city"],
    pincode: req.body["pincode"],
  };

  if (await checks.userExists(req.body["mobile"])) {
    const billList = await localDatabaseRequest.getBillList(req.body["mobile"]);
    const response = await liveHealthApiRequest.labAppointment(req.body);
    if (response.code === "200") {
      const billId = response.data["billId"];
    } else {
      res.send("failed to book Appointment!").status(400);
    }

    localDatabaseRequest.updateUserInfo();
  } else {
  }
});

app.get("/priceList", async (req, res) => {
  try {
    const response = await axios.get(
      "https://staging.livehealth.solutions/getAllTestsAndProfiles/?token=a6277e50-bc7d-11eb-aed7-0afba0d18fd2"
    );
    const coupon = req.query.coupon;
    switch (coupon) {
      case "AYUSH":
        let test = [];
        response.data["testList"].forEach((item) => {
          let temp = item;
          temp.testAmount =
            parseFloat(item.testAmount) - parseFloat(item.testAmount) * 0.2;
          test.push(temp);
        });
        res.json([{ code: 200 }, test]);
        break;

      case "ANCHIT":
        let test2 = [];
        response.data["testList"].forEach((item) => {
          let temp = item;
          temp.testAmount =
            parseFloat(item.testAmount) - parseFloat(item.testAmount) * 0.5;
          test2.push(temp);
        });
        res.json([{ code: 200 }, test2]);
        break;

      case "4664684":
        response.data["profileTestList"].forEach((item) => {
          if (item.testID == 4664684) {
            res.json([{ code: 200 }, item["testList"]]);
          }
        });
        res.send(400);
        break;
      case "GYMFREAK":
        res.json([{ code: 200 }, response.data["testList"]]);
        break;
      default:
        res.json([{ code: 200 }, { ...response.data["testList"] }]);
        break;
    }
  } catch (err) {
    console.log(err);
    res.send("failed").status(200);
  }
});

app.post("/check", async (req, res) => {
  try {
    const billList = [];
    const reportList = [];
    const appointmentList = [];

    res.send("success").status(200);
  } catch (err) {
    console.log(err);
    res.send("failed").status(400);
  }
});




app.post("/bookLabAppointment", async (req, res) => {
  try {
    if (await checkUser(req.body["mobile"])) {
      const result = await liveHealthApiCall.labAppointment(req.body);
      if (result.code === "200") {
        res.code(200);
      } else {
        res.code(400);
      }
    } else {
      client.query("INSERT INTO apttestuser () VALUES ()");
    }
  } catch (e) {
    console.log(e);
    res
      .send("there is a problem in processing request at this time")
      .status(500);
  }
});



//booking utilities

const checkUserExist = async(data)=>{
  const response = await client.query(`SELECT * FROM "apttestuser" WHERE "contact" = $1`,[data.mobile])
  return response.rows[0]
}

const createNewUser = async(data)=>{
  const passdate = new Date(data.dob).getFullYear()
  const password = /^\S*/i.exec(data.fullName)[0].toLowerCase()+passdate
  const response = await client.query(`INSERT INTO "apttestuser" ("userName","dob","email","gender","appointmentList","billList","contact","address","userPassword") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
    data.fullName,
    data.dob,
    data.email,
    data.gender,
    data.appointmentList,
    data.billList,
    data.mobile,
    data.area,
    password
  ])
  return response.rowCount === 1
}

const updateExistingUser = async(data)=>{
  console.log(data)
  const response = await client.query(`UPDATE "apttestuser" SET "appointmentList" = $1 ,"billList" = $2 WHERE "contact" = $3`,[
    data.appointmentList,
    data.billList,
    data.mobile
  ])
  return response.rowCount === 1
}


const createNewUser2 = async(data)=>{
  const passdate = new Date(data.dob).getFullYear()
  const password = /^\S*/i.exec(data.fullName)[0].toLowerCase()+passdate
  const response = await client.query(`INSERT INTO "apttestuser" ("userName","dob","email","gender","appointmentList","billList","contact","address","userPassword","appointmentList","billList") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[
    data.fullName,
    data.dob,
    data.email,
    data.gender,
    data.appointmentList,
    data.billList,
    data.mobile,
    data.area,
    password,[],[]
  ])
  return response.rows[0]
}

const updateExistingUser2 = async(data)=>{
  const response = await client.query(`UPDATE "apttestuser" SET "appointmentList" = $1 ,"billList" = $2 WHERE "contact" = $3 returning *`,[
    data.appointmentList,
    data.billList,
    data.mobile
  ])
  return response.rows[0]
}



const findUserByFamilyId = async (data)=>{
  const result = await client.query(`SELECT * FROM "apttestuser" WHERE "familyId" = $1`,[data.familyId])
  return result.rows[0]
}



const isFamilyMemberExist = async(data)=>{
  const result = await client.query(`SELECT * FROM "memberslist" WHERE "familyId" = $1 AND "userName" = $2`,[
    data.familyId,
    data.fullName
  ])
  return result.rowCount === 1

}

const createFamilyMember = async(data)=>{
  const result = await client.query(`INSERT INTO "memberslist" ("userName" , "dob" , "address" , "gender" , "familyId") VALUES ($1 ,$2 ,$3 ,$4, $5)`,[
    data.fullName,
    data.dob,
    data.area,
    data.gender,
    data.familyId
  ])

  return result.rowCount == 1

}

const updateFamilyMember = async(data)=>{
  const result = await client.query(`UPDATE "memberslist" SET "address"=$1 ,"dob"=$2 WHERE "userName" = $3 AND "familyId" = $4`,[
    data.area,
    data.dob,
    data.fullName.trim(),
    data.familyId
  ])
  return result.rowCount == 1
}




// bookings APIs


app.post("/saveBeforeBooking",async(req,res)=>{
  try{
    const userData = await checkUserExist(req.body)
    if(userData !== undefined) //user exist
    {
      let billList = userData.billList
      let appointmentList = userData.appointmentList
      const data = {
        appointmentList,
        billList,
        mobile:req.body.mobile
      }

      const result = await updateExistingUser2(data)
        if(result !== undefined){res.json({code:"200",data:result})}
        else{res.json({code:"500"})}
    }
    else //user not exist
    {
      const data = {
        "mobile": req.body.mobile,
        "email": req.body.email,
        "fullName": req.body.fullName,
        "gender": req.body.gender,
        "area": req.body.area,
        "dob": req.body.dob,
        "billList":[],
        "appointmentList":[]
      }

      const result = await createNewUser2(data)
      if(result !== undefined){res.json({code:"200",data:result})}
      else{res.json({code:"500"})}
    }


  }catch(err){console.log(err);res.json({message:"internal server error!",code:"500"})}
})


app.post("/bookAppointment/lab",async(req,res)=>{
    try{
      console.log(req.body)
    let newBillId = ""
    let newAppointmentId = "" 
    const liveHealthResponse = await liveHealthApiRequest.labAppointment(req.body)
    if(liveHealthResponse.code === "200"){
      newBillId = liveHealthResponse.data.billId
      newAppointmentId = liveHealthResponse.data.appointmentId
    }
    else{
      console.log("________live health api error____________")
      console.error(liveHealthResponse.data)
      res.json({code:500,message:"error in livehealth api!"})
    }

  if(req.body.isMember){
    if(await isFamilyMemberExist(req.body)){
      await updateFamilyMember(req.body)
    }
    else{
      await createFamilyMember(req.body)
    }
    const userUpdateData = await checkUserExist(req.body)
    if(userUpdateData !== undefined){
      let appointmentList = userUpdateData.appointmentList
      let billList = userUpdateData.billList
      appointmentList.push(newAppointmentId)
      billList.push(newBillId)

      let data = {
        appointmentList,
        billList,
        mobile:userUpdateData.mobile
      }
      if(updateExistingUser(data)){
        if(await setSlot(req.body)){
        res.json({code:200,message:"booking done with member modification"})}
      }
      else{
        res.json({code:500,message:"Internal Server Error!"})
      }
    }
    else{
      res.json({code:500,message:"Internal Server Error!"})
    }
  }
  else{
    
    // console.log(req.body)
    const userData = await checkUserExist(req.body)
    if(userData !== undefined) //user exist
    {
      let billList = userData.billList
      let appointmentList = userData.appointmentList
      appointmentList.push(newAppointmentId)
      billList.push(newBillId)
      const data = {
        appointmentList,
        billList,
        mobile:req.body.mobile
      }

      if(await updateExistingUser(data)){
        if(await setSlot(req.body)){
       res.json({code:200,message:"existing user updated!"})}
      }
      else{
        res.json({code:400,message:"cant update existing user!"}) 
      }
    } 
    else //user not exist
    {
      const data = {
        "mobile": req.body.mobile,
        "email": req.body.email,
        "fullName": req.body.fullName,
        "gender": req.body.gender,
        "area": req.body.area,
        "dob": req.body.dob,
        "billList":[newBillId],
        "appointmentList":[newAppointmentId]
      }

      if(await createNewUser(data)){
        if(await setSlot(req.body)){
        res.json({code:200,message:"user created!"})}
      }
      else{
        res.json({code:500,message:"cant create new user!"})
      }
    }
  }
  
  }catch(err){console.log(err);res.json({code:500,message:"Internal Server Error!"})}
})


app.post("/bookAppointment/home",async(req,res)=>{
  try{
    console.log(req.body)
    let newBillId = ""
    let newAppointmentId = "" 
    const liveHealthResponse = await liveHealthApiRequest.homeAppointment(req.body)
    if(liveHealthResponse.code === "200"){
      newBillId = liveHealthResponse.data.billId
      newAppointmentId = liveHealthResponse.data.appointmentId
    }
    else{
      console.log("________live health api error____________")
      console.error(liveHealthResponse.data)
      res.json({code:500,message:"error in livehealth api!"})
    }

  if(req.body.isMember){
    if(await isFamilyMemberExist(req.body)){
      await updateFamilyMember(req.body)
    }
    else{
      await createFamilyMember(req.body)
    }
    const userUpdateData = await checkUserExist(req.body)
    if(userUpdateData !== undefined){
      let appointmentList = userUpdateData.appointmentList
      let billList = userUpdateData.billList
      appointmentList.push(newAppointmentId)
      billList.push(newBillId)
      console.log(billList,appointmentList)

      let data = {
        appointmentList,
        billList,
        mobile:userUpdateData.mobile
      }
      if(updateExistingUser(data)){
        if(await setSlot(req.body)){
          res.json({code:200,message:"booking done with member modification"})}
      }
      else{
        res.json({code:500,message:"Internal Server Error!"})
      }
    }
    else{
      res.json({code:500,message:"Internal Server Error!"})
    }
  }
  else{
    
    // console.log(req.body)
    const userData = await checkUserExist(req.body)
    if(userData !== undefined) //user exist
    {
      let billList = userData.billList
      let appointmentList = userData.appointmentList
      appointmentList.push(newAppointmentId)
      billList.push(newBillId)
      const data = {
        appointmentList,
        billList,
        mobile:req.body.mobile
      }

      if(await updateExistingUser(data)){
        if(await setSlot(req.body)){
          res.json({code:200,message:"existing user updated!"})}
      }
      else{
        res.json({code:400,message:"cant update existing user!"}) 
      }
    } 
    else //user not exist
    {
      const data = {
        "mobile": req.body.mobile,
        "email": req.body.email,
        "fullName": req.body.fullName,
        "gender": req.body.gender,
        "area": req.body.area,
        "dob": req.body.dob,
        "billList":[newBillId],
        "appointmentList":[newAppointmentId]
      }

      if(await createNewUser(data)){
        if(await setSlot(req.body)){
          res.json({code:200,message:"user created!"})}
      }
      else{
        res.json({code:500,message:"cant create new user!"})
      }
    }
  }
  
  }catch(err){console.log(err);res.json({code:500,message:"Internal Server Error!"})}
})



app.post("/login", async (req, res) => {
  try {
    const result = await client.query(`select "userName","dob","email","gender","address","familyId","contact" from "apttestuser" WHERE "contact"=$1 AND "userPassword" =$2`,[
      req.body.contact,req.body.password]);
    if(result.rowCount >0){
      res.json({code:200,data:result.rows[0]})
    } 
    else{
      res.json({code:400,data:null})
    }
  } catch (e) {
    console.log(e);
    res.json({code:500,data:null})
  }
});

app.post("/register",async (req,res)=>{
  try{
    if( (await checkUserExist(req.body)) === undefined){
      const result = await createNewUser2(req.body) 
      if(result !== undefined){
        res.json({code:200,data:result})
      }
      else{
        res.json({code:400,data:null})
      }
    }
    else{
      res.json({code:202,data:"user Already exists!"})
    }
  }catch(err){
    console.log(err)
    res.json({code:500,data:null})
  }
})

app.post("/getMemberDetails",async(req,res)=>{
  try{
    const result = await client.query(`SELECT * FROM "memberslist" WHERE "familyId" = $1`,[req.body.familyId])
    if(result.rowCount>0){
    res.json({code:200,data:result.rows})}
    else{
      res.json({code:202,data:result.rows})
    }
  }catch(err)
  {console.log(err);res.json({code:500,data:err})}
})


app.post("/storeBill", (req, res) => {
  res.json({ code: 200 });
});

app.post("/storeReport", async (req, res) => {
  try {
    const result = await client.query(
      "INSERT INTO apttestreports VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        req.body["CentreReportId"],
        req.body["labId"],
        req.body["billId"],
        req.body["dictionaryId"],
        req.body["Report Id"],
        req.body["reportDate"],
        req.body["Patient Id"],
        req.body["labReportId"],
        req.body["Contact No"],
        req.body["testID"],
        req.body["reportBase64"],
      ]
    );
    // console.log(result)
    res.status(200).send("successful");
  } catch (e) {
    console.log(e);
    res.status(400).send("failed");
  }
});

app.get("/getReport", async (req, res) => {
  try {
    const result = await client.query(
      "SELECT * FROM apttestreports WHERE contact = $1",
      [req.query.contact]
    );
    res.json(result.rows);
  } catch (e) {
    console.log(e);
    res.status(400).send("failed");
  }
});

//newly created for blog section
app.get("/getAllBlogs", async (req, res) => {
  try {
    const resultData = await client.query(
      `SELECT * FROM "aptblogs"  ORDER BY "blogId"`
    );
    if (resultData.rows.length > 0) {
      res.status(200).json({ data: resultData.rows});
    } else {
      res.send("Not Fetched");
    }
  } catch (err) {
    console.log(err);
    res.status(400).send("failed");
  }
});

// admin panel

app.get("/admin/dialogueBoxCheck", async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM "aptpackages" WHERE "testID" = $1`,
      [req.query.Id]
    );
    if (result.rows.length === 0) {
      const packageList = await axios.get(
        `https://staging.livehealth.solutions/getAllTestsAndProfiles/?token=a6277e50-bc7d-11eb-aed7-0afba0d18fd2`
      );
      const tempDict = await packageList.data.profileTestList.filter(
        (item) => item.testID == req.query.Id
      );
      if (tempDict.length === 0) {
        res.json({ status: 400, body: [] });
      } else {
        console.log(tempDict[0].integrationCode)
        let finalDict = {
          type: tempDict[0].integrationCode,
          testName: tempDict[0].testName,
          description: "",
          testAmount: tempDict[0].testAmount,
          testsIncluded: tempDict[0].testList.map((item) => item.testName),
          preRequisites: [],
          idealFor: [],
          testID: tempDict[0].testID,
          isSpecial: false,
        };
        res.json({ status: 200, body: finalDict });
      }
    } else {
      res.json({ status: 200, body: result.rows[0] });
    }
  } catch (e) {
    console.log(e);
    res.json({ status: 500 });
  }
});

app.get("/admin/getPackageByType", async (req, res) => {
  const result = await client.query(
    `SELECT * FROM "aptpackages" WHERE type = $1`,
    [req.query.type]
  );
  res.json(result.rows);
});

app.get("/admin/getPackageById", async (req, res) => {
  const result = await client.query(
    `SELECT * FROM "aptpackages" WHERE "testID" = $1`,
    [req.query.Id]
  );
  res.json(result.rows);
});

app.get("/admin/getAllPackage", async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM "aptpackages"  ORDER BY "testID"`
    );

    res.status(200).json(result.rows);
  } catch (e) {
    res.send("Internal Server Error").status(500);
  }
});

app.post("/admin/postPackage", upload.single("image"), async (req, res) => {
  try {
    let storeImage = "";
    if (req.file === undefined) {
      storeImage = req.body.oldImg;
    } else {
      const uploadResult = await uploadFile(req.file);
      storeImage = uploadResult.Location;
    }
    const check = await client.query(
      `SELECT * FROM "aptpackages" WHERE "testID" = $1`,
      [req.body.testID]
    );
    if (check.rows.length < 1) {
      const result = await client.query(
        `INSERT INTO "aptpackages" ("testID","type","testName","description","testAmount","testsIncluded","preRequisites","idealFor","isSpecial","image") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          req.body.testID,
          req.body.type,
          req.body.testName,
          req.body.description,
          req.body.testAmount,
          JSON.parse(req.body.testsIncluded),
          JSON.parse(req.body.preRequisites),
          JSON.parse(req.body.idealFor),
          req.body.isSpecial,
          storeImage,
        ]
      );
    } else {
      const result = await client.query(
        `UPDATE "aptpackages" SET "testID" = $1 ,"type" = $2 ,"testName" = $3 ,"description" = $4,"testAmount" = $5 ,"testsIncluded" = $6 ,"preRequisites" = $7 ,"idealFor" = $8, "isSpecial" = $9, "image"= $10 WHERE "testID" = $11`,
        [
          req.body.testID,
          req.body.type,
          req.body.testName,
          req.body.description,
          req.body.testAmount,
          JSON.parse(req.body.testsIncluded),
          JSON.parse(req.body.preRequisites),
          JSON.parse(req.body.idealFor),
          req.body.isSpecial,
          storeImage,
          req.body.testID,
        ]
      );
    }
    res.send(200);
  } catch (err) {
    console.log(err);
    res.send(500);
  }
});

// tests

app.get("/admin/getAllTests", async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM "apttests"  ORDER BY "testID"`
    );

    res.json(result.rows);
  } catch (e) {
    res.send("Internal Server Error").status(500);
  }
});

app.get("/admin/checkAndGetTestById", async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM "apttests" WHERE "testID" = $1`,
      [req.query.Id]
    );
    if (result.rows.length === 0) {
      const testList = await axios.get(
        `https://staging.livehealth.solutions/getAllTestsAndProfiles/?token=a6277e50-bc7d-11eb-aed7-0afba0d18fd2`
      );
      const tempDict = await testList.data.testList.filter(
        (item) => item.testID == req.query.Id
      );
      if (tempDict.length === 0) {
        res.json({ status: 400, body: [] });
      } else {
        let finalDict = {
          type: tempDict[0].integrationCode,
          testName: tempDict[0].testName,
          description: "",
          testAmount: tempDict[0].testAmount,
          details: "",
          testID: tempDict[0].testID,
          isSpecial: false,
          imageLink: "",
          sampleReportImage: "",
        };
        res.json({ status: 200, body: finalDict });
      }
    } else {
      res.json({ status: 200, body: result.rows[0] });
    }
  } catch (e) {
    console.log(e);
    res.json({ status: 500 });
  }
});

app.get("/admin/getTests", async (req, res) => {
  try {
    const response = await client.query("SELECT * FROM apttests");

    res.send("worked").status(200);
  } catch (err) {
    console.log(err);
    res.send("failed").status(500);
  }
});

app.post("/admin/uploadTest", async (req, res) => {
  try {
    const response = await client.query(
      `INSERT INTO "apttests" VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        req.body["testID"],
        req.body["testName"],
        req.body["description"],
        req.body["details"],
        req.body["imageLink"],
        req.body["sampleReportImage"],
        req.body["testAmount"],
        req.body["faq"],
      ]
    );
    res.send("worked").status(200);
  } catch (err) {
    console.log(err);
    res.send("failed").status(500);
  }
});

const testUpload = upload.fields([
  { testName: "testReport", maxCount: 1 },
  { testName: "testImage", maxCount: 1 },
]);
app.post("/admin/postTest", testUpload, async (req, res) => {
  try {
    let testReport = "";
    let testImage = "";
    if (req.files.testReport === undefined) {
      testReport = req.body.oldTestReport;
    } else {
      const uploadResult = await uploadFile(req.files.testReport[0]);
      testReport = uploadResult.Location;
    }
    if (req.files.testImage === undefined) {
      testImage = req.body.oldTestImage;
    } else {
      const uploadResult = await uploadFile(req.files.testImage[0]);
      testImage = uploadResult.Location;
    }

    const check = await client.query(
      `SELECT * FROM "apttests" WHERE "testID" = $1`,
      [req.body.testID]
    );
    if (check.rows.length < 1) {
      const result = await client.query(
        `INSERT INTO "apttests" ("testID","testName","description","details","imageLink","sampleReportImage","testAmount","isSpecial","type") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          req.body.testID,
          req.body.testName,
          req.body.description,
          req.body.details,
          testImage,
          testReport,
          req.body.testAmount,
          req.body.isSpecial,
          req.body.type,
        ]
      );
    } else {
      const result = await client.query(
        `UPDATE "apttests" SET "testID" = $1 ,"testName" = $2 ,"description"=$3,"details"=$4,"imageLink"=$5,"sampleReportImage"=$6,"testAmount"=$7,"isSpecial"=$8,"type"=$9 WHERE "testID" = $10`,
        [
          req.body.testID,
          req.body.testName,
          req.body.description,
          req.body.details,
          testImage,
          testReport,
          req.body.testAmount,
          req.body.isSpecial,
          req.body.type,
          req.body.testID,
        ]
      );
    }
    res.send(200);
  } catch (err) {
    console.log(err);
    res.send(500);
  }
});

// blogs

app.get("/admin/getAllBlogs", async (req,res)=>{
    try{
        const result = await client.query(`SELECT * FROM "aptblogs"  ORDER BY "blogId"`)
        res.json(result.rows)
        
        }
    catch(e){
        console.log(e)
        res.send("Internal Server Error").status(500)
        }
})

app.get("/admin/checkAndGetBlogById",async (req,res)=>{
    try{
        const result = await client.query(`SELECT * FROM "aptblogs" WHERE "blogId" = $1`,[req.query.Id])
        if(result.rows.length ==1){
            res.send(result.rows).status(200)
        }
        else{
            res.send("Invalid Id").status(400)
        }
        
    }
    catch(err){
        console.log(err)
        res.send("Internal Server Error").status(500)
    }

})

//Admin - Update Blog
const blogUpload = upload.fields([{testName:"videoFile" , maxCount:1},{testName:"images", maxCount:4}])
app.post("/admin/postBlog",blogUpload, async (req,res)=>{

    try{
        let images =[]
        let videoFile =""
        let authorImage = ""

        // console.log(req.files)
        // console.log(req.body)
        if(req.files !== undefined) {
            
            if(req.files.images !== undefined){
                for(var file of req.files.images){
                    const result = await uploadFile(file)
                    images.push(result.Location)
                }
            }
            else{ images = JSON.parse(req.body.imagesLink)}
            if(req.files.authorImage !== undefined){
                const result = await uploadFile(req.files.authorImage[0])
                authorImage = result.Location
            }
            else{
                authorImage = req.body.oldAuthorImage
            }
            if(req.files.videoFile !== undefined){
                const result = await uploadFile(req.files.videoFile[0])
                videoFile = result.Location
            }
            else{
                videoFile = req.body.oldVideoLink
            }
        }
        const checkExist = await client.query(`SELECT * FROM "aptblogs" WHERE "blogId" = $1`,[req.body.blogId])
        // console.log(checkExist)
        if(checkExist.rows.length > 0){
            const uploadResult = await client.query(`UPDATE "aptblogs" SET "author" = $1, "content" = $2, "heading" = $3, "subHeading" = $4, "authorThumbnail" = $5, "isVideoBlog" = $6, "videoLink" = $7, "imagesLinks" = $8 where "blogId" = $9 returning *`,[
                req.body.author,
                req.body.content,
                req.body.blogHeading,
                req.body.blogSubHeading,
                authorImage,
                req.body.isVideoBlog,
                videoFile,
                images,
                req.body.blogId
            ])
            console.log(uploadResult.rows[0])
            res.send(uploadResult.rows[0]).status(200)
        }
        else{
            const uploadResult = await client.query(`UPDATE "aptblogs" SET "author" = $1, "content" = $2, "heading" = $3, "subHeading" = $4, "authorThumbnail" = $5, "isVideoBlog" = $6, "videoLink" = $7, "imagesLinks" = $8 where "blogId" = $9 returning *`,[
            req.body.author,
            req.body.content,
            req.body.blogHeading,
            req.body.blogSubHeading,
            authorImage,
            req.body.isVideoBlog,
            videoFile,
            images,
            req.body.blogId
        ])
        console.log(uploadResult.rows[0])
        res.send(uploadResult.rows[0]).status(200)
    }}
    catch(err){
        console.log(err)
        res.send("Internal Server Error").status(500)
    }
})


app.post("quickLogin",async(req,res)=>{
  try{
    const result = await client.query(`SELECT * FROM "apttestuser" WHERE "contact" = $1`,[req.body.contact])
    res.json({code:200,data:result.rows[0]})
  }catch(err){console.log(err)
  res.json({code:500,data:err})}
})

//Admin- Add blog
const insertBlogUpload = upload.fields([{testName:"videoFile" , maxCount:1},{testName:"images", maxCount:4}])
app.post("/admin/insertBlog",insertBlogUpload, async (req,res)=>{
    try{
        let images =[]
        let videoFile =""

        if(req.files !== undefined){
        if(req.files.images !== undefined){
            for(var file of req.files.images){
                const result = await uploadFile(file)
                images.push(result.Location)
            }
        }
        else{ images = null}
        if(req.files.authorImage !== undefined){
            const result = await uploadFile(req.files.authorImage[0])
            authorImage = result.Location
        }
        else{
            authorImage = null
        }
        if(req.files.videoFile !== undefined){
            const result = await uploadFile(req.files.videoFile[0])
            videoFile = result.Location
        }
        else{
            videoFile = null
        }}
        const insertResult = await client.query(`INSERT INTO "aptblogs" ("author","content","heading","subHeading","authorThumbnail","isVideoBlog","videoLink","imagesLinks") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[
            req.body.author,
            req.body.content,
            req.body.blogHeading,
            req.body.blogSubHeading,
            authorImage,
            req.body.isVideoBlog,
            videoFile,
            images
        ])
        console.log(insertResult)
        res.send(insertResult.rows[0]).status(200)
        }
    catch(err){
        console.log(err)
        res.send("Internal Server Error").status(500)
    }
})


app.post("/admin/uploadTest",async (req,res)=>{
    try{
    const response = await client.query(`INSERT INTO "apttests" VALUES ($1,$2,$3,$4,$5,$6)`,[
        req.body["testID"],
        req.body["testName"],
        req.body["description"],
        req.body["details"],
        req.body["imageLink"],
        req.body["sampleReportImage"],
        req.body["testAmount"],
        req.body["faq"],
        
    ])
    res.send("worked").status(200)
    }
    catch (err){
        console.log(err)
        res.send("failed").status(500)
    }
})
//Admin - insertBlogContent
app.post("/admin/insertBlogContent", async (req,res) => {
    console.log("done")
    try {
        console.log(req.body)
        const uploadResult = await client.query(`UPDATE "aptblogs" SET "content" = $1 where "blogId" = $2 returning *`,[
            req.body.insertContentData,
            req.body.blogId
        ])
        
        res.status(200).json({status : "success"})
    }
    catch(err) {
        console.log(err)
        res.send("Internal Server Error").status(500)
    }
})

//getAllBlogs
app.get("/allblogs", async(req, res) => {
    try{
        const result = await client.query(`SELECT * FROM "aptblogs"  ORDER BY "blogId"`)
        // console.log(result.rows)
        if(result.rows.length > 0) {
            res.status(200).json({
                status : "Success",
                data : result.rows
            })
        }
        else {
            res.status(500).json({
                status : "fail",
                message : "Data not found"
            })
        }
        }
    catch(e){
        console.log(e)
        res.send("Internal Server Error").status(500)
        }
})

//For Coupons
// modification required
app.post("/giftCoupon", async (req,res)=>{
    try{
        const verifyCoupon =  await client.query(`SELECT "giftedTestList" ,"couponAmount" , "couponCode" FROM "aptgifts" WHERE "couponCode" = $1 AND "isValid" = 'true' `,[req.body.coupon])
        console.log(verifyCoupon)
        if(verifyCoupon.rows.length > 0) {
            res.json({
                code:200,
                data : verifyCoupon.rows[0]
            })
        }
        else if(verifyCoupon.rows.length === 0){
            res.status(400).json({
                code:400,
                message:"Invalid Coupon Code",
                data : null
            })
        }
        }
    catch(err) {
        console.log(err)
        res.status(500).json({
            message : "Internal Error || Server issue",
            data:0
        })
    }
}
)


// apply coupon
app.get("/applyCoupon", async (req,res)=>{
  try{
      console.log(req.query.coupon)
      const verifyCoupon =  await client.query(`SELECT * FROM "aptcoupons" WHERE "couponCode" = $1`,[req.query.coupon])
      if(verifyCoupon.rows.length > 0) {
        res.json({
          discount:parseInt(verifyCoupon.rows[0].couponPrice),
          code:200
        })
      }else{
        res.json({
          code:400
            })
      }
    }catch(err){
      console.log(err)
      res.json({
        code:500
          })
}
})

// getAllCoupons
app.get("/getAllCoupons",async(req,res)=>{
  try{
    const response = await client.query(`SELECT * FROM "aptcoupons"`)
    res.send(response.rows).status(200)
  }catch(err){
    console.log(err)
    res.status(500)
  }
})

// addCoupons
app.post("/uploadCoupon",async(req,res)=>{
  try{
    const result = await client.query(`INSERT INTO "aptcoupons" VALUES ($1,$2)`,[req.body.couponCode,req.body.couponPrice])
    res.send("ok").sendStatus(200)
  }catch(err){
    console.log(err)
    res.send("failed").sendStatus(500)
  }
})

// index Page

app.get("/getCovidTests", async(req,res)=>{
  try{
    const response = await client.query(`SELECT * FROM "apttests"  WHERE "isSpecial" = true AND "type" = 'Other Services'`)
    const data = response.rows
    res.send({code:200,data}).status(200)
  }
  catch(e){
    console.log(e)
    res.send().status(500)
  }
})

app.get("/getPackages", async(req,res)=>{
  try{
    const response = await client.query(`SELECT * FROM "aptpackages"  WHERE "isSpecial" = 'true' `)
    const data = response.rows
    res.send({code:200,data}).status(200)
  }
  catch(e){
    console.log(e)
    res.send().status(500)
  }
})

app.get("/getAllFeaturedTests",async(req,res)=>{
  try{
    const response = await client.query(`SELECT * FROM "apttests"  WHERE "isSpecial" = 'true'`)
    const data = response.rows
    res.send({code:200,data}).status(200)
  }
  catch(e){
    console.log(e)
    res.send().status(500)
  }
})




app.post("/testAPI",async(req,res)=>{
  await setSlot(req.body)
  res.send("ok")
})

//Slot Booking --- Section
// input format mm-dd-yyyy

app.post("/slotBooking",async(req,res) => {
  try{
    const result = await client.query(`SELECT * FROM "aptbookings" WHERE "slot"::DATE = $1`,[req.body.slot])
    var decryptSlot = {7:"slot1",8:"slot2",9:"slot3",10:"slot4",11:"slot5",12:"slot6",13:"slot7",14:"slot8",15:"slot9",16:"slot10",17:"slot11",18:"slot12",19:"slot13",20:"slot14",21:"slot15"}
    var slots = {slot1:0,slot2:0,slot3:0,slot4:0,slot5:0,slot6:0,slot7:0,slot8:0,slot9:0,slot10:0,slot11:0,slot12:0,slot13:0,slot14:0,slot15:0}
    for (var a of result.rows){
      slots[decryptSlot[new Date(a.slot).getUTCHours()]]++
    }
    res.json(slots)
  }catch(err){
    console.log(err)
    res.sendStatus(500)
  }
})

// set slot

const setSlot = async (data)=>{
  console.log(data)
  try{
    const result = await client.query(`INSERT INTO "aptbookings" VALUES ($1,$2)`,[data.mobile,data.slotTime])
    console.log(result)
    return true

  }catch(err){
    console.log(err)
    return false
  }
}

// manage flebo

app.get("/getFlebo",async (req,res)=>{
  try{
    // sendMail()
    const result = await client.query(`SELECT * FROM "aptutils"`)
    res.status(200).json(result.rows[0])
  }
  catch(err){
    console.log(err)
    res.status(500)
  }
})


app.post("/setFlebo",async (req,res)=>{
  try{
    const result = await client.query(`UPDATE "aptutils" SET "flebo" = $1 WHERE "flebo" = $2 `,[req.body.newFlebo,req.body.currFlebo])
    res.sendStatus(200)
  }
  catch(err){
    console.log(err)
    res.sendStatus(500)
  }
})


// admin - fetch subscribers email
app.get("/admin/getSubscribers",async(req,res)=>{
  try{
    const result = await client.query(`SELECT * FROM "aptsubscribers"`)
    if(result.rows.length > 0 ){
      res.json(result.rows).status(200)
    }
    else{
      res.json({"data":"nodata"}).status(400)
    }
  }catch(err){
    console.log(err)
    res.status(500)
  }
}) 

// admin - fetch users email
app.get("/admin/fetchUserList",async(req,res)=>{
  try{
    const result = await client.query(`SELECT "userName" , "email" FROM "apttestuser"`)
    if(result.rows.length > 0){
      res.json(result.rows).status(200)
    }else{
      res.json({"data":"nodata"}).status(400)
    }
  }catch(err){
    console.log(err)
    res.status(500)
  }
}) 


// post feedback/complaint

app.post("/postFeedback",upload.single("attachment"),async(req,res)=>{
  try{  
    console.log(req.body)
  let attachment = "";
  if (req.file === undefined) {
    attachment = "";
  } else {
    const uploadResult = await uploadFile(req.file);
    attachment = uploadResult.Location;
  }
  console.log("here")
    const result = await client.query(`INSERT INTO "aptquery" VALUES ($1,$2,$3,$4,$5,$6)`,[req.body.testName,req.body.email,req.body.type,req.body.contact,req.body.query,attachment])
      res.send("worked").status(200)
  }catch(err){
    console.log(err)
    res.status(500)
  }
}) 

// post contactus
app.post("/postContactus",async(req,res)=>{
  try{  
    console.log(req.body)
    const result = await client.query(`INSERT INTO "aptcontactus" VALUES ($1,$2,$3,$4,$5)`,[req.body.testName,req.body.email,req.body.contact,req.body.queryType,req.body.queryDescription])
      res.send("worked").status(200)
  }catch(err){
    console.log(err)
    res.status(500)
  }
}) 

// fetchFeedbacks
app.get("/admin/fetchFeedbacks",async(req,res)=>{
  try{
    const result = await client.query(`SELECT * FROM "aptquery"`)
    if(result.rows.length > 0){
      res.json({data:result.rows}).status(200)
    }
    else{
      res.josn({data:"no data"}).status(400)
    }
  }
  catch(err){
    console.log(err)
    res.send("failed").status(500)
  }
})

// fetch Contactus
app.get("/admin/fetchContactus",async(req,res)=>{
  try{
    const result = await client.query(`SELECT * FROM "aptcontactus"`)
    if(result.rows.length > 0){
      res.json({data:result.rows}).status(200)
    }
    else{
      res.josn({data:"no data"}).status(400)
    }
  }
  catch(err){
    console.log(err)
    res.send("failed").status(500)
  }

})

app.post("/requestCallback", async (req,res)=>{
  try{
    console.log(req.body)
    const response = await client.query(`INSERT INTO "callbackrequests" VALUES ($1 , $2)`,[req.body.name,req.body.contactNumber])
    res.json({code:200})
  }catch(err){
    console.log(err)
    res.json({code:500})
  }
})





app.listen(process.env.PORT || 5000,()=>{
    console.log(process.env.PORT || 5000)
})



