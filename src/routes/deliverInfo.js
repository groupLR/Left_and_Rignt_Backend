import express from "express"
import prisma from "../configs/prisma.js"

const router = express.Router()

router.get("/getDeliverInfo", async (req, res) => {
  const { uid } = req.headers

  try {
    // 根據 UID 查詢 users 資料表中的 userId

    const user = await prisma.users.findUnique({
      where: {
        userId: uid,
      },
      select: {
        id: true,
        userId: true,
      },
    })

    if (!user) {
      return res.status(404).send("使用者未找到")
    }

    // 查找 deliver 資料表中的相關紀錄
    let deliveryInfo = await prisma.deliver.findMany({
      where: {
        owner: user.userId,
      },
    })

    // 如果 deliver 資料表沒有找到紀錄，新增一筆資料
    if (deliveryInfo.length === 0) {
      const newDeliver = await prisma.deliver.create({
        data: {
          owner: user.userId,
        },
      })

      // 將新插入的紀錄設置為返回值
      deliveryInfo = [newDeliver]
    }

    return res.json(deliveryInfo)
  } catch (err) {
    console.error("查詢或插入失敗:", err)
    return res.status(500).send("伺服器錯誤")
  }
})

export default router
