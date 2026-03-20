import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createServer } from 'http'
import { Server } from 'socket.io'
import prisma from './utils/db'
import redis from './utils/redis'
import logger from './utils/logger'
import pushRoutes from './routes/push.routes'
import { startReminderJob, startHabitRenewalJob } from './jobs/reminder.job'


import authRoutes from './routes/auth.routes'
import chatRoutes from './routes/chat.routes'
import eventsRoutes from './routes/events.routes'

const app = express()
const httpServer = createServer(app)

export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))


const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: '请求太频繁，请稍后再试' },
})
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: 'AI 接口请求太频繁' },
})

app.use('/api/auth', generalLimiter, authRoutes)
app.use('/api/chat', aiLimiter, chatRoutes)
app.use('/api/events', generalLimiter, eventsRoutes)
app.use('/api/push', generalLimiter, pushRoutes)

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redis.ping()
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch (error) {
    res.status(500).json({ status: 'error', error: String(error) })
  }
})

// WebSocket 连接处理
io.on('connection', (socket) => {
  logger.info('WebSocket connected', { socketId: socket.id })

  // 用户加入自己的房间（用于接收提醒推送）
  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`)
    logger.info('User joined room', { userId })
  })

  // 用户对提醒的操作（确认/推迟/跳过）
  socket.on('reminder:action', async (data: { reminderId: string; action: 'confirmed' | 'snoozed' | 'skipped'; snoozeMinutes?: number }) => {
    try {
      const updateData: Record<string, unknown> = {
        userAction: data.action,
        userActionAt: new Date(),
        status: data.action,
      }
      if (data.action === 'snoozed' && data.snoozeMinutes) {
        updateData.snoozeUntil = new Date(Date.now() + data.snoozeMinutes * 60 * 1000)
      }
      await prisma.reminder.update({
        where: { id: data.reminderId },
        data: updateData as never,
      })
      socket.emit('reminder:action:ack', { success: true, reminderId: data.reminderId })
    } catch (error) {
      socket.emit('reminder:action:ack', { success: false, error: String(error) })
    }
  })

  socket.on('disconnect', () => {
    logger.info('WebSocket disconnected', { socketId: socket.id })
  })
})


const PORT = process.env.PORT || 3001


httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`)
  logger.info(`📊 Health check: http://localhost:${PORT}/health`)

  startReminderJob()
  startHabitRenewalJob()
})

export default app
