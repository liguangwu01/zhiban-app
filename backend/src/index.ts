import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { Server } from 'socket.io'
import prisma from './utils/db'
import redis from './utils/redis'
import logger from './utils/logger'

const app = express()
const httpServer = createServer(app)

// Socket.IO 初始化
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

// 中间件
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// 健康检查
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redis.ping()
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
      },
    })
  } catch (error) {
    res.status(500).json({ status: 'error', error: String(error) })
  }
})

// WebSocket 连接
io.on('connection', (socket) => {
  logger.info('WebSocket client connected', { socketId: socket.id })

  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`)
    logger.info('User joined room', { userId, socketId: socket.id })
  })

  socket.on('disconnect', () => {
    logger.info('WebSocket client disconnected', { socketId: socket.id })
  })
})

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`)
  logger.info(`📊 Health check: http://localhost:${PORT}/health`)
})

export default app
