import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth.middleware'
import { notificationService } from '../services/notification.service'
import prisma from '../utils/db'

const router = Router()
router.use(authMiddleware)

// 获取 VAPID 公钥（前端订阅前调用）
router.get('/vapid-public-key', (_req, res) => {
  res.json({ success: true, data: { publicKey: notificationService.getVapidPublicKey() } })
})

// 保存浏览器推送订阅
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      subscription: z.object({
        endpoint: z.string(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      }),
    })
    const { subscription } = schema.parse(req.body)
    const userId = req.user!.userId

    await prisma.userPreference.upsert({
      where: { userId },
      update: { webPushSubscription: subscription as never },
      create: { userId, webPushSubscription: subscription as never },
    })

    res.json({ success: true })
  } catch (error) {
    res.status(400).json({ success: false, error: '订阅失败' })
  }
})

// 取消订阅
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    await prisma.userPreference.update({
      where: { userId },
      data: { webPushSubscription: null as never },
    })
    res.json({ success: true })
  } catch (error) {
    res.status(400).json({ success: false, error: '取消订阅失败' })
  }
})

// 设置勿扰时间
router.post('/do-not-disturb', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
      end: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    })
    const { start, end } = schema.parse(req.body)
    const userId = req.user!.userId

    await prisma.userPreference.upsert({
      where: { userId },
      update: { doNotDisturbStart: start, doNotDisturbEnd: end },
      create: { userId, doNotDisturbStart: start, doNotDisturbEnd: end },
    })

    res.json({ success: true })
  } catch (error) {
    res.status(400).json({ success: false, error: '设置失败' })
  }
})

export default router
