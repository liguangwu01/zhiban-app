import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { authService } from '../services/auth.service'

const router = Router()

// 注册
router.post('/register', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      username: z.string().min(2).max(20),
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().optional(),
    })
    const body = schema.parse(req.body)
    const result = await authService.register(body.username, body.email, body.password, body.fullName)
    res.status(201).json({ success: true, data: result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '注册失败'
    res.status(400).json({ success: false, error: msg })
  }
})

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      emailOrUsername: z.string(),
      password: z.string(),
    })
    const body = schema.parse(req.body)
    const result = await authService.login(body.emailOrUsername, body.password)
    res.json({ success: true, data: result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '登录失败'
    res.status(401).json({ success: false, error: msg })
  }
})

// 刷新 Token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body)
    const tokens = await authService.refreshToken(refreshToken)
    res.json({ success: true, data: tokens })
  } catch (error) {
    res.status(401).json({ success: false, error: 'Token 刷新失败' })
  }
})

export default router
