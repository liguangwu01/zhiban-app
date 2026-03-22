import OpenAI from 'openai'
import prisma from '../utils/db'
import logger from '../utils/logger'

const kimi = new OpenAI({
  apiKey: process.env.KIMI_API_KEY!,
  baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
})
const MODEL = process.env.KIMI_MODEL || 'kimi-k2'

// 行为记忆超过这个字符数，触发压缩
const COMPRESS_THRESHOLD = 500

// 三层记忆结构
export interface UserMemory {
  profile: string        // 第一层：永久记忆（用户画像、偏好、联系人）
  behaviorMemory: string // 第二层：行为记忆（从对话中学到的习惯）
  recentEvents: string   // 第三层：最近事件摘要（滚动窗口）
}

export class MemoryService {
  // ── 读取用户完整记忆（注入 System Prompt 前调用）──────────────────
  async getUserMemory(userId: string): Promise<UserMemory> {
    let memory = await prisma.userMemory.findUnique({ where: { userId } })

    if (!memory) {
      memory = await prisma.userMemory.create({ data: { userId } })
    }

    return {
      profile:        memory.profile,
      behaviorMemory: memory.behaviorMemory,
      recentEvents:   memory.recentEventsSummary,
    }
  }

  // ── 第一层：更新用户画像（AI 覆盖式更新）────────────────────────
  async updateProfile(userId: string, newProfile: string): Promise<void> {
    await prisma.userMemory.upsert({
      where:  { userId },
      update: { profile: newProfile },
      create: { userId, profile: newProfile },
    })
    logger.debug('User profile updated', { userId })
  }

  // ── 第二层：追加行为记忆（AI 发现新习惯时调用）──────────────────
  // 每条一行，最多保留 50 条，超出自动删最旧的
  async updateBehaviorMemory(userId: string, newItem: string): Promise<void> {
    const memory = await prisma.userMemory.findUnique({ where: { userId } })

    const lines = (memory?.behaviorMemory || '')
      .split('\n')
      .filter(Boolean)

    // 去重：如果已有非常相似的条目（完全相同），跳过
    const normalized = newItem.trim()
    if (lines.some(l => l.replace(/^- /, '') === normalized)) {
      logger.debug('Behavior memory item already exists, skipping', { userId, newItem })
      return
    }

    lines.push(`- ${normalized}`)
    if (lines.length > 50) lines.shift() // 超过50条删最旧

    const updated = lines.join('\n')

    await prisma.userMemory.upsert({
      where:  { userId },
      update: { behaviorMemory: updated },
      create: { userId, behaviorMemory: updated },
    })
    logger.debug('Behavior memory updated', { userId, newItem })

    // 超过阈值时异步压缩，不阻塞主流程
    if (updated.length > COMPRESS_THRESHOLD) {
      this.compressMemory(userId).catch(err =>
        logger.warn('compressMemory failed silently', { userId, err })
      )
    }
  }

  // ── 第二层：压缩行为记忆（碎片 → 结构化认知）───────────────────
  async compressMemory(userId: string): Promise<void> {
    const memory = await prisma.userMemory.findUnique({
      where:  { userId },
      select: { behaviorMemory: true },
    })

    if (!memory?.behaviorMemory || memory.behaviorMemory.length < COMPRESS_THRESHOLD) {
      return // 不够长，不压缩
    }

    logger.info('Compressing behavior memory', { userId, length: memory.behaviorMemory.length })

    try {
      const response = await kimi.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `你是一个观察者，负责整理一位秘书对主人的了解。

下面是秘书从日常对话中积累的碎片化观察记录。请把它们归纳成 3-6 条结构化认知，要求：
- 每条一句话，站在秘书视角（"他..."）
- 去掉重复和矛盾的，保留最有价值的洞察
- 按主题归类（沟通风格 / 出行习惯 / 工作节奏 / 偏好 / 其他）
- 只返回归纳后的内容，每条单独一行，不要加序号或标题`,
          },
          {
            role: 'user',
            content: memory.behaviorMemory,
          },
        ],
        temperature: 0.3,
      })

      const compressed = response.choices[0].message.content
      if (!compressed) return

      await prisma.userMemory.update({
        where: { userId },
        data:  { behaviorMemory: compressed },
      })

      logger.info('Behavior memory compressed', {
        userId,
        before: memory.behaviorMemory.length,
        after:  compressed.length,
      })
    } catch (err) {
      logger.error('compressMemory error', { userId, err })
    }
  }

  // ── 定时任务入口：压缩所有需要压缩的用户（供 cron job 调用）──────
  async compressAllUsers(): Promise<void> {
    const allMemories = await prisma.userMemory.findMany({
      select: { userId: true, behaviorMemory: true },
    })

    const targets = allMemories.filter(
      m => m.behaviorMemory && m.behaviorMemory.length > COMPRESS_THRESHOLD
    )

    logger.info(`compressAllUsers: ${targets.length} users need compression`)

    for (const m of targets) {
      await this.compressMemory(m.userId)
      await new Promise(resolve => setTimeout(resolve, 300)) // 避免并发打爆 API
    }
  }

  // ── 第三层：追加事件摘要（创建事件后调用）───────────────────────
  async appendEventSummary(userId: string, eventSummary: string): Promise<void> {
    const memory = await prisma.userMemory.findUnique({ where: { userId } })
    if (!memory) return

    const lines = memory.recentEventsSummary
      .split('\n')
      .filter(l => l.trim() && l !== '暂无历史事件')

    const newLine = `- ${new Date().toLocaleDateString('zh-CN')} ${eventSummary}`
    lines.unshift(newLine)

    await prisma.userMemory.update({
      where: { userId },
      data:  { recentEventsSummary: lines.slice(0, 20).join('\n') },
    })
  }

  // ── 对话历史：读取最近 N 轮 ──────────────────────────────────────
  async getRecentConversations(userId: string, sessionId: string, limit = 10) {
    const conversations = await prisma.conversationHistory.findMany({
      where:   { userId, sessionId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    })
    return conversations.reverse()
  }

  // ── 对话历史：保存一条 ───────────────────────────────────────────
  async saveConversation(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    inputType: 'text' | 'voice' | 'image' = 'text',
    functionCalls?: unknown
  ) {
    await prisma.conversationHistory.create({
      data: { userId, sessionId, role, content, inputType, functionCalls: functionCalls as never },
    })
  }
}

export const memoryService = new MemoryService()
