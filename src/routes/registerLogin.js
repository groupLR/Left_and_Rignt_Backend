import bcrypt from "bcrypt" //加密密碼
import express from "express"
import jwt from "jsonwebtoken"
import prisma from "../configs/prisma.js"
import { z } from "zod"
import { v4 as uuidv4 } from "uuid"

const router = express.Router()
const SECRET_KEY = process.env.SECRET_KEY

//get 使用者 email 資料（共享購物車新增使用者時判斷用）
router.get("/email", async (_req, res) => {
  try {
    const rows = await prisma.users.findMany({
      select: {
        email: true,
      },
    })
    const userEmailList = rows.map((object) => object.email)
    res.json(userEmailList)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// get 使用者資料
router.get("/singleUserData", async (req, res) => {
  const { userId } = req.query
  try {
    const userData = await prisma.users.findUnique({
      where: {
        userId,
      },
    })
    res.json(userData)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

//get 個別資料
router.post("/find", async (req, res) => {
  try {
    //輸入email
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ message: "請提供電子信箱" })
    }
    //通過email查找訊息
    const row = await prisma.users.findUnique({
      where: { email: email },
    })
    if (!row) {
      return res.status(404).json({ message: "未找到用户" })
    }

    res.json(row.userId)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// zod 定義註冊 schema
const registerSchema = z.object({
  username: z.string().max(20, "使用者名稱不能超過20個字元"),
  email: z.string().email("請輸入正確的email"),
  gender: z.enum(["m", "f", "o"], {
    errorMap: () => ({ message: "請選擇有效性別" }),
  }),
  password: z.string().min(8, "密碼至少需要8個字元"),
  birthday: z
    .string()
    .refine((dateStr) => !isNaN(new Date(dateStr).getTime()), {
      message: "請輸入有效的生日日期",
    })
    .transform((dateStr) => new Date(dateStr)),
})

//驗證註冊 middleware
const validateRegister = (req, res, next) => {
  try {
    registerSchema.parse(req.body)
    next()
  } catch (error) {
    // zod 錯誤訊息格式化
    const formattedErrors = error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }))
    res.status(400).json({
      error: "驗證錯誤",
      details: formattedErrors,
    })
  }
}

//註冊
router.post("/register", validateRegister, async (req, res) => {
  try {
    const { username, email, password, gender, birthday } = req.body
    const hashPassword = await bcrypt.hash(password, 10) //密碼加密處理
    const newUserId = uuidv4()
    const birthdayDate = new Date(birthday).toISOString()

    const existingUser = await prisma.users.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(409).json({
        message: "用戶已存在",
      })
    } else {
      const user = await prisma.users.create({
        data: {
          userId: newUserId,
          username,
          email,
          password_hash: hashPassword,
          gender,
          birthday: birthdayDate,
        },
      })
      const token = jwt.sign(
        {
          userId: user.userId,
          userEmail: user.email,
        },
        SECRET_KEY,
        {
          //期限
          expiresIn: "1h",
        }
      )
      res.status(201).json({
        message: "註冊成功",
        token: token,
        newUser: user,
      })
    }
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "使用者已註冊" })
    }
    res.status(500).json({
      message: "伺服器錯誤",
      error: err.message,
      stack: err.stack,
    })
  }
})

//登入
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await prisma.users.findUnique({
      where: { email },
    })

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "帳號或密碼錯誤" })
    }
    const token = jwt.sign(
      {
        userId: user.userId,
        userEmail: user.email,
      },
      SECRET_KEY,
      {
        //期限
        expiresIn: "1h",
      }
    )

    res.status(200).json({
      message: "登入成功",
      token: token,
      user: user,
    })
  } catch (err) {
    res.status(500).json({ message: "伺服器錯誤", error: err.message })
  }
})
//驗證使用者
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ message: "沒提供token" })
  }
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "token無效" })
    }
    req.user = user
    next()
  })
}

router.get("/profile", authenticateToken, (req, res) => {
  res.json({ user: req.user })
})

export default router
