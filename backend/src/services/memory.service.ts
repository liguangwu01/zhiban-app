import prisma from '../utils/db'
import logger from '../utils/logger'

export class MemoryService {
  // 读取用户完整记忆（用于注入 System Prompt）
  async getUserMemory(userId: string): Promise<{ profile: string; recentEvents: string }> {
    let memory = await prisma.userMemory.findUnique({ where: { userId } })

    if (!memory) {
      // 首次使用，创建空白记忆
      memory = await prisma.userMemory.create({
        data: { userId },
      })
    }

    return {
      profile: memory.profile,
      recentEvents: memory.recentEventsSummary,
    }
  }

  // AI 更新用户画像（每次对话后调用）
  async updateProfile(userId: string, newProfile: string): Promise<void> {
    await prisma.userMemory.upsert({
      where: { userId },
      update: { profile: newProfile },
      create: { userId, profile: newProfile },
    })
    logger.debug('User profile memory updated', { userId })
  }

  // 追加事件摘要到记忆
  async appendEventSummary(userId: string, eventSummary: string): Promise<void> {
    const memory = await prisma.userMemory.findUnique({ where: { userId } })
    if (!memory) return

    // 解析现有摘要，保留最近20条
    const lines = memory.recentEventsSummary
      .split('\n')
      .filter((l) => l.trim() && l !== '暂无历史事件')

    const newLine = `- ${new Date().toLocaleDateString('zh-CN')} ${eventSummary}`
    lines.unshift(newLine) // 最新的放最前面

    const updated = lines.slice(0, 20).join('\n') // 最多保留20条

    await prisma.userMemory.update({
      where: { userId },
      data: { recentEventsSummary: updated },
    })
  }

  // 获取最近N轮对话（用于 AI 上下文）
  async getRecentConversations(userId: string, sessionId: string, limit = 10) {
    const conversations = await prisma.conversationHistory.findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return conversations.reverse() // 时间正序
  }

  // 保存对话记录
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
