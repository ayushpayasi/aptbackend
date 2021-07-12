const { Client } = require("pg");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const nodemailer = require("nodemailer");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const { uploadFile } = require("./s3");

const app = express();

app.use(express.json());
app.use(cors());

const client = new Client({
  user: "ayushpayasi",
  host: "apttestdb.cqgz43wq9ns0.ap-south-1.rds.amazonaws.com",
  database: "postgres",
  password: "Ayush123",
  port: 5432,
});

client.connect();

var transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "ayushpayasi@gmail.com",
    pass: "MH34k2909",
  },
});

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
  sendReportsMail: async (to, name) => {
    const mailOptions = {
      from: "ayushpayasi@gmail.com",
      to: `${to}`,
      subject: `Welcome to APT Diagnostics ${name}`,
      html: `<p>Welcome ${name}</p>`,
    };

    await transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.log(err);
      else console.log(info);
    });
  },
  sendOTP: async (to, name) => {},
};

const liveHealthApiRequest = {
  labAppointment: async (data) => {
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
    name: req.body["fullName"],
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
      1;
      const result = await liveHealthApiCall.labAppointment(req.body);
      if (result.code === "200") {
        res.code(200);
      } else {
        res.code(400);
      }
      res.send("user Exist").status(200);
    } else {
      // res.send("register new user").status(200)
      client.query("INSERT INTO apttestuser () VALUES ()");
    }
  } catch (e) {
    console.log(e);
    res
      .send("there is a problem in processing request at this time")
      .status(500);
  }
});

app.post("/login", async (req, res) => {
  try {
    const result = await client.query("select * from apttestuser");
    res.status(200).send("success");
  } catch (e) {
    console.log(e);
    res.status(400).send("failed");
  }
});

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
        req.body["testId"],
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
      `SELECT * FROM "aptpackages" WHERE "packageId" = $1`,
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
        let finalDict = {
          type: tempDict[0].testCategory,
          name: tempDict[0].testName,
          description: "",
          packagePrice: tempDict[0].testAmount,
          testsIncluded: tempDict[0].testList.map((item) => item.testName),
          preRequisites: [],
          idealFor: [],
          packageId: tempDict[0].testID,
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
    `SELECT * FROM "aptpackages" WHERE "packageId" = $1`,
    [req.query.Id]
  );
  res.json(result.rows);
});

app.get("/admin/getAllPackage", async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM "aptpackages"  ORDER BY "packageId"`
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
      `SELECT * FROM "aptpackages" WHERE "packageId" = $1`,
      [req.body.packageId]
    );
    if (check.rows.length < 1) {
      const result = await client.query(
        `INSERT INTO "aptpackages" ("packageId","type","name","description","packagePrice","testsIncluded","preRequisites","idealFor","isSpecial","image") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          req.body.packageId,
          req.body.type,
          req.body.name,
          req.body.description,
          req.body.packagePrice,
          JSON.parse(req.body.testsIncluded),
          JSON.parse(req.body.preRequisites),
          JSON.parse(req.body.idealFor),
          req.body.isSpecial,
          storeImage,
        ]
      );
    } else {
      const result = await client.query(
        `UPDATE "aptpackages" SET "packageId" = $1 ,"type" = $2 ,"name" = $3 ,"description" = $4,"packagePrice" = $5 ,"testsIncluded" = $6 ,"preRequisites" = $7 ,"idealFor" = $8, "isSpecial" = $9, "image"= $10 WHERE "packageId" = $11`,
        [
          req.body.packageId,
          req.body.type,
          req.body.name,
          req.body.description,
          req.body.packagePrice,
          JSON.parse(req.body.testsIncluded),
          JSON.parse(req.body.preRequisites),
          JSON.parse(req.body.idealFor),
          req.body.isSpecial,
          storeImage,
          req.body.packageId,
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
      `SELECT * FROM "apttests"  ORDER BY "testId"`
    );

    res.json(result.rows);
  } catch (e) {
    res.send("Internal Server Error").status(500);
  }
});

app.get("/admin/checkAndGetTestById", async (req, res) => {
  try {
    const result = await client.query(
      `SELECT * FROM "apttests" WHERE "testId" = $1`,
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
          type: tempDict[0].testCategory,
          name: tempDict[0].testName,
          description: "",
          price: tempDict[0].testAmount,
          details: "",
          testId: tempDict[0].testID,
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
        req.body["testId"],
        req.body["name"],
        req.body["description"],
        req.body["details"],
        req.body["imageLink"],
        req.body["sampleReportImage"],
        req.body["price"],
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
  { name: "testReport", maxCount: 1 },
  { name: "testImage", maxCount: 1 },
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
      `SELECT * FROM "apttests" WHERE "testId" = $1`,
      [req.body.testId]
    );
    if (check.rows.length < 1) {
      const result = await client.query(
        `INSERT INTO "apttests" ("testId","name","description","details","imageLink","sampleReportImage","price","isSpecial","type") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          req.body.testId,
          req.body.name,
          req.body.description,
          req.body.details,
          testImage,
          testReport,
          req.body.testPrice,
          req.body.isSpecial,
          req.body.type,
        ]
      );
    } else {
      const result = await client.query(
        `UPDATE "apttests" SET "testId" = $1 ,"name" = $2 ,"description"=$3,"details"=$4,"imageLink"=$5,"sampleReportImage"=$6,"price"=$7,"isSpecial"=$8,"type"=$9 WHERE "testId" = $10`,
        [
          req.body.testId,
          req.body.name,
          req.body.description,
          req.body.details,
          testImage,
          testReport,
          req.body.testPrice,
          req.body.isSpecial,
          req.body.type,
          req.body.testId,
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
const blogUpload = upload.fields([{name:"videoFile" , maxCount:1},{name:"images", maxCount:4}])
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


//Admin- Add blog
const insertBlogUpload = upload.fields([{name:"videoFile" , maxCount:1},{name:"images", maxCount:4}])
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
        req.body["testId"],
        req.body["name"],
        req.body["description"],
        req.body["details"],
        req.body["imageLink"],
        req.body["sampleReportImage"],
        req.body["price"],
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
        console.log("")
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
app.get("/coupon", async (req,res)=>{
    try{
        console.log(req.query.couponCode)
        const couponCode = parseInt(req.query.couponCode);
        const verifyCoupon =  await client.query(`SELECT * FROM "aptcoupons" WHERE "couponCode" = $1`,[couponCode])
        if(verifyCoupon.rows.length > 0) {
            const {couponPrice, giftedTests} = verifyCoupon.rows[0]

            res.status(200).json({
                message:"Valid Coupon Code",
                data : {
                    couponPrice,
                    giftedTests,
                    couponCode,
                }
            })
        }
        else if(verifyCoupon.rows.length === 0){
            res.status(400).json({
                message:"Invalid Coupon Code",
                data : 0
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


//Slot Booking --- Section

app.get("/slotBooking",async(req,res) => {

  try{
    const result = await client.query(`SELECT * FROM "aptSlots" WHERE "slotId" = $1`,[req.query.Id])
    if(result.status()===200){
      console.log("Success")
    }
  }catch(err){
    console.log("Failed")
  }
}) //652



app.listen(process.env.PORT || 5000,()=>{
    console.log(process.env.PORT || 5000)
})



