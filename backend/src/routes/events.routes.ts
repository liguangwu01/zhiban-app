import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import prisma from '../utils/db'

const router = Router()
router.use(authMiddleware)

// 获取事件列表
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const { start, end, category } = req.query

    const where: Record<string, unknown> = { userId, deletedAt: null }

    if (start || end) {
      where.startTime = {
        ...(start && { gte: new Date(start as string) }),
        ...(end && { lte: new Date(end as string) }),
      }
    }

    if (category) where.eventCategory = category

    const events = await prisma.event.findMany({
      where: where as never,
      orderBy: { startTime: 'asc' },
      include: {
        reminders: {
          where: { status: 'pending', deletedAt: null },
          orderBy: { triggerAt: 'asc' },
        },
      },
    })

    res.json({ success: true, data: events })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取事件失败' })
  }
})

// 获取单个事件
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
      include: { reminders: { orderBy: { triggerAt: 'asc' } } },
    })

    if (!event) return res.status(404).json({ success: false, error: '事件不存在' })
    res.json({ success: true, data: event })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取事件失败' })
  }
})

// 软删除事件
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    await prisma.event.updateMany({
      where: { id: req.params.id, userId },
      data: { deletedAt: new Date() },
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

export default router
