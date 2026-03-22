import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware } from '../middleware/auth.middleware'
import { aiService } from '../services/ai.service'
import { memoryService } from '../services/memory.service'
import logger from '../utils/logger'

const router = Router()
router.use(authMiddleware)

// 主对话接口
router.post('/message', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      message: z.string().max(2000),
      sessionId: z.string().optional(),
      inputType: z.enum(['text', 'voice', 'image']).default('text'),
      imageBase64: z.string().optional(), // 图片输入
    })

    const body = schema.parse(req.body)
    const userId = req.user!.userId
    const sessionId = body.sessionId || uuidv4()

    logger.info('Chat message received', { userId, sessionId, inputType: body.inputType })

    const result = await aiService.processMessage(
      userId,
      sessionId,
      body.message,
      body.inputType,
      body.imageBase64
    )

    res.json({
      success: true,
      data: {
        sessionId,
        reply: result.reply,
        actionTaken: result.actionTaken,
        requiresClarification: result.requiresClarification,
        memoryUpdated: result.memoryUpdated,
      },
    })
  } catch (error) {
    logger.error('Chat message error', { error })
    const msg = error instanceof Error ? error.message : 'AI 处理失败'
    res.status(500).json({ success: false, error: msg })
  }
})

// 获取对话历史
router.get('/history/:sessionId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId as string
    const { sessionId } = req.params
    const conversations = await memoryService.getRecentConversations(userId, sessionId, 50)
    res.json({ success: true, data: conversations })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取历史失败' })
  }
})

// 获取用户记忆（调试用）
router.get('/memory', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const memory = await memoryService.getUserMemory(userId)
    res.json({ success: true, data: memory })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取记忆失败' })
  }
})

export default router
