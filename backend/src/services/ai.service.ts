import OpenAI from 'openai'
import prisma from '../utils/db'
import { memoryService } from './memory.service'
import logger from '../utils/logger'
import {
  AIProcessResult,
  CreateEventParams,
  CreateHabitParams,
  CreateLongTermParams,
  ClarifyParams,
} from '../types'

// Kimi 兼容 OpenAI SDK
const kimi = new OpenAI({
  apiKey: process.env.KIMI_API_KEY!,
  baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
})

// ==================== System Prompt ====================
function buildSystemPrompt(
  userMemory: { profile: string; recentEvents: string },
  currentTime: string,
  timezone: string
): string {
  return `你是智伴，一个专业的 AI 私人秘书。你的主人是一个忙碌的中年人，你的职责是帮他管理日程、设置提醒、记住重要的事。

## 当前时间
${currentTime}（时区：${timezone}）

## 用户记忆档案
${userMemory.profile}

## 最近事件记录
${userMemory.recentEvents}

---

## 你的工作方式

**像真人秘书一样思考，不像日历软件一样执行。**

当用户说一件事，你要思考：
1. 这是什么类型的事？（一次性事件 / 每日习惯 / 远期计划）
2. 关键信息是否完整？（时间、地点、人物）
3. 用户可能会忘记什么？（准备材料、提前出发、预约）
4. 什么时候提醒最合适？（不是固定规则，是情境判断）
5. 这件事和用户记忆中的哪些信息有关？

## 提醒时机决策原则（核心）

❌ 禁止使用固定规则：如"提前30分钟"、"提前1小时"
✅ 必须基于情境动态决定：

**外出会议/出行**：
- 提醒时机 = 预估交通时间 + 用户习惯缓冲（默认10分钟）+ 准备时间
- 如果用户没有提供出发地，用记忆中的常用出发地
- 提醒内容要包含：几点出发、大概交通时间、需要带什么

**健康习惯**：
- 绑定用户的作息锚点（饭后、起床后、睡前）
- 提醒内容简洁，支持一键确认

**远期事件**：
- 生成完整提醒链（T-30天、T-7天、T-1天、T-0天、T+1天）
- 每个节点的内容要具体，不是模板

## 追问原则
- 只追问真正影响执行的关键信息
- 一次最多问1个问题，不要让用户填表
- 能从记忆中推断的，不要问

## 记忆更新原则
- 每次对话后，如果发现了新的用户偏好、新的联系人、新的习惯，调用 update_memory 更新
- 更新时保持 Markdown 格式，只修改相关部分，不要删除已有信息

## Few-shot 示例

**示例1 - 外出会议（信息不全）**
用户："下周三上午11点去张总公司开会"
思考：外出会议，需要交通时间。地点不够具体。
行动：调用 clarify_input，问"张总公司大概在哪个区？方便我帮你算出发时间"

**示例2 - 信息完整的外出会议**
用户："下周三上午11点去张总公司开会，他在浦东新区陆家嘴"
思考：外出会议，地点明确。从记忆中用户常在朝阳区出发，打车约50分钟。需要提前1小时出发，加上准备时间，9:30提醒出发。
行动：调用 create_event，设置两个提醒：前一天晚上提醒准备材料，当天9:30提醒出发

**示例3 - 健康习惯**
用户："每天提醒我吃鱼油"
思考：每日习惯，需要绑定作息时间。
行动：调用 clarify_input，问"你一般几点吃早饭？我帮你设在饭后提醒"

**示例4 - 远期事件**
用户："3个月后去体检"
思考：远期事件，需要生成提醒链。体检需要提前预约、前一天禁食。
行动：调用 create_long_term_event，生成完整提醒链

**示例5 - 内部会议（无需交通）**
用户："明天下午3点部门例会，3楼会议室"
思考：内部会议，无需交通时间，提前15分钟提醒即可。
行动：直接调用 create_event，设置明天14:45提醒

**示例6 - 查询日程**
用户："我明天有什么安排？"
行动：调用 query_events 查询明天的事件

## 输出要求
- 必须通过 Function Calling 输出结构化指令
- 同时生成一句自然语言确认（userFacingConfirmation），语气像真人秘书，简洁亲切
- 禁止只输出纯文本而不调用任何工具（查询结果除外）`
}

// ==================== Function Definitions ====================
const FUNCTIONS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_event',
      description: '创建一次性日程事件（会议、出行、工作等）',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '事件标题' },
          rawInput: { type: 'string', description: '用户原始输入，原文保存' },
          eventType: { type: 'string', enum: ['meeting', 'travel', 'work', 'personal'], description: '事件类型' },
          startTime: { type: 'string', description: 'ISO 8601 格式的开始时间' },
          endTime: { type: 'string', description: 'ISO 8601 格式的结束时间（可选）' },
          locationName: { type: 'string', description: '地点名称' },
          locationAddress: { type: 'string', description: '详细地址（如已知）' },
          participants: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                relationship: { type: 'string' },
              },
            },
          },
          preparationItems: { type: 'array', items: { type: 'string' }, description: '需要准备的事项' },
          importance: { type: 'string', enum: ['high', 'medium', 'low'] },
          reminderPlan: {
            type: 'array',
            description: 'AI 决定的提醒计划，每条包含绝对触发时间和情境化内容',
            items: {
              type: 'object',
              properties: {
                triggerAt: { type: 'string', description: 'ISO 8601 格式的绝对触发时间' },
                content: { type: 'string', description: '情境化的提醒内容' },
                actionSuggestions: { type: 'array', items: { type: 'string' } },
              },
              required: ['triggerAt', 'content'],
            },
          },
          userFacingConfirmation: { type: 'string', description: '向用户展示的自然语言确认' },
        },
        required: ['title', 'rawInput', 'eventType', 'startTime', 'reminderPlan', 'userFacingConfirmation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_habit_reminder',
      description: '创建每日/每周重复的健康习惯提醒',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          rawInput: { type: 'string' },
          frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          daysOfWeek: { type: 'array', items: { type: 'integer' }, description: '0=周日,1=周一...6=周六' },
          preferredTime: { type: 'string', description: 'HH:MM 格式' },
          timeAnchor: { type: 'string', description: "时间锚点，如'早饭后'、'睡前'" },
          notificationStyle: { type: 'string', enum: ['minimal', 'normal'] },
          trackCompletion: { type: 'boolean' },
          userFacingConfirmation: { type: 'string' },
        },
        required: ['name', 'rawInput', 'frequency', 'preferredTime', 'userFacingConfirmation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_long_term_event',
      description: '创建远期事件，并自动生成分阶段提醒链',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          rawInput: { type: 'string' },
          targetDate: { type: 'string', description: 'ISO 8601 格式' },
          category: { type: 'string', enum: ['health', 'work', 'finance', 'personal'] },
          reminderChain: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                triggerDaysBefore: { type: 'integer' },
                triggerTime: { type: 'string', description: 'HH:MM' },
                message: { type: 'string' },
                actionSuggestions: { type: 'array', items: { type: 'string' } },
              },
              required: ['triggerDaysBefore', 'triggerTime', 'message'],
            },
          },
          checkList: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item: { type: 'string' },
                dueDaysBefore: { type: 'integer' },
              },
            },
          },
          userFacingConfirmation: { type: 'string' },
        },
        required: ['title', 'rawInput', 'targetDate', 'reminderChain', 'userFacingConfirmation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clarify_input',
      description: '当关键信息缺失时，向用户提问。每次只问最重要的1个问题。',
      parameters: {
        type: 'object',
        properties: {
          missingInfo: { type: 'string', enum: ['time', 'location', 'frequency', 'person', 'other'] },
          question: { type: 'string', description: '自然语言问题，语气亲切' },
          options: { type: 'array', items: { type: 'string' }, description: '可选项（如适用）' },
        },
        required: ['missingInfo', 'question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_events',
      description: '查询用户的日程事件',
      parameters: {
        type: 'object',
        properties: {
          timeRangeStart: { type: 'string', description: 'ISO 8601' },
          timeRangeEnd: { type: 'string', description: 'ISO 8601' },
          keywords: { type: 'array', items: { type: 'string' } },
          userFacingConfirmation: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_memory',
      description: '更新用户记忆档案。当发现新的用户偏好、联系人、习惯时调用。',
      parameters: {
        type: 'object',
        properties: {
          updatedProfile: {
            type: 'string',
            description: '完整的更新后的用户画像 Markdown 文本（保持原有格式，只修改相关部分）',
          },
          newEventSummary: {
            type: 'string',
            description: '本次新增事件的一行摘要，如"与张总会议（上海浦东）"',
          },
        },
      },
    },
  },
]

// ==================== 执行工具调用 ====================
async function executeFunctionCall(
  userId: string,
  funcName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    switch (funcName) {
      case 'create_event': {
        const params = args as unknown as CreateEventParams
        const event = await prisma.$transaction(async (trx) => {
          const newEvent = await trx.event.create({
            data: {
              userId,
              title: params.title,
              rawInput: params.rawInput,
              eventCategory: 'temporary',
              eventType: params.eventType,
              startTime: params.startTime ? new Date(params.startTime) : undefined,
              endTime: params.endTime ? new Date(params.endTime) : undefined,
              locationName: params.locationName,
              locationAddress: params.locationAddress,
              participants: params.participants as never,
              preparationItems: params.preparationItems as never,
              aiContext: { importance: params.importance || 'medium' } as never,
            },
          })

          // 创建提醒计划
          if (params.reminderPlan?.length) {
            await trx.reminder.createMany({
              data: params.reminderPlan.map((r) => ({
                eventId: newEvent.id,
                userId,
                triggerAt: new Date(r.triggerAt),
                content: r.content,
                actionSuggestions: (r.actionSuggestions || []) as never,
                idempotencyKey: `${newEvent.id}_${new Date(r.triggerAt).getTime()}`,
              })),
            })
          }

          return newEvent
        })

        // 更新记忆中的事件摘要
        const summary = `${params.title}${params.locationName ? `（${params.locationName}）` : ''}`
        await memoryService.appendEventSummary(userId, summary)

        return { success: true, data: { eventId: event.id, reminderCount: params.reminderPlan?.length || 0 } }
      }

      case 'create_habit_reminder': {
        const params = args as unknown as CreateHabitParams
        const event = await prisma.event.create({
          data: {
            userId,
            title: params.name,
            rawInput: params.rawInput,
            eventCategory: 'habit',
            eventType: 'health',
            recurrence: {
              frequency: params.frequency,
              daysOfWeek: params.daysOfWeek,
              preferredTime: params.preferredTime,
              timeAnchor: params.timeAnchor,
              notificationStyle: params.notificationStyle || 'minimal',
              trackCompletion: params.trackCompletion !== false,
            } as never,
          },
        })

        // 为习惯创建未来7天的提醒
        await scheduleHabitReminders(userId, event.id, params)

        return { success: true, data: { eventId: event.id } }
      }

      case 'create_long_term_event': {
        const params = args as unknown as CreateLongTermParams
        const targetDate = new Date(params.targetDate)

        const event = await prisma.$transaction(async (trx) => {
          const newEvent = await trx.event.create({
            data: {
              userId,
              title: params.title,
              rawInput: params.rawInput,
              eventCategory: 'long_term',
              targetDate,
              aiContext: { category: params.category } as never,
              checkList: params.checkList as never,
            },
          })

          // 根据提醒链创建具体提醒
          const reminders = params.reminderChain
            .map((r) => {
              const triggerDate = new Date(targetDate)
              triggerDate.setDate(triggerDate.getDate() - r.triggerDaysBefore)
              const [hours, minutes] = r.triggerTime.split(':').map(Number)
              triggerDate.setHours(hours, minutes, 0, 0)

              if (triggerDate > new Date()) {
                return {
                  eventId: newEvent.id,
                  userId,
                  triggerAt: triggerDate,
                  content: r.message,
                  actionSuggestions: (r.actionSuggestions || []) as never,
                  idempotencyKey: `${newEvent.id}_${triggerDate.getTime()}`,
                }
              }
              return null
            })
            .filter(Boolean) as never[]

          if (reminders.length) {
            await trx.reminder.createMany({ data: reminders })
          }

          return newEvent
        })

        const summary = `${params.title}（${targetDate.toLocaleDateString('zh-CN')}）`
        await memoryService.appendEventSummary(userId, summary)

        return { success: true, data: { eventId: event.id } }
      }

      case 'query_events': {
        const { timeRangeStart, timeRangeEnd, keywords } = args as {
          timeRangeStart?: string
          timeRangeEnd?: string
          keywords?: string[]
        }

        const where: Record<string, unknown> = { userId, deletedAt: null }

        if (timeRangeStart || timeRangeEnd) {
          where.startTime = {
            ...(timeRangeStart && { gte: new Date(timeRangeStart) }),
            ...(timeRangeEnd && { lte: new Date(timeRangeEnd) }),
          }
        }

        if (keywords?.length) {
          where.OR = keywords.map((k) => ({ title: { contains: k, mode: 'insensitive' } }))
        }

        const events = await prisma.event.findMany({
          where: where as never,
          orderBy: { startTime: 'asc' },
          take: 20,
          include: { reminders: { where: { status: 'pending', deletedAt: null } } },
        })

        return { success: true, data: events }
      }

      case 'update_memory': {
        const { updatedProfile, newEventSummary } = args as {
          updatedProfile?: string
          newEventSummary?: string
        }

        if (updatedProfile) {
          await memoryService.updateProfile(userId, updatedProfile)
        }
        if (newEventSummary) {
          await memoryService.appendEventSummary(userId, newEventSummary)
        }

        return { success: true, data: { updated: true } }
      }

      case 'clarify_input': {
        // 追问不需要执行，直接返回问题
        return { success: true, data: args }
      }

      default:
        return { success: false, error: `未知工具: ${funcName}` }
    }
  } catch (error) {
    logger.error('Function call execution error', { funcName, error })
    return { success: false, error: String(error) }
  }
}

// 为习惯提醒生成未来7天的提醒记录
async function scheduleHabitReminders(
  userId: string,
  eventId: string,
  params: CreateHabitParams
): Promise<void> {
  const [hours, minutes] = params.preferredTime.split(':').map(Number)
  const reminders = []

  for (let i = 0; i < 7; i++) {
    const triggerAt = new Date()
    triggerAt.setDate(triggerAt.getDate() + i)
    triggerAt.setHours(hours, minutes, 0, 0)

    if (triggerAt <= new Date()) continue

    // 检查是否是指定的星期
    if (params.daysOfWeek?.length) {
      const dayOfWeek = triggerAt.getDay()
      if (!params.daysOfWeek.includes(dayOfWeek)) continue
    }

    reminders.push({
      eventId,
      userId,
      triggerAt,
      content: `⏰ 该${params.name}了${params.timeAnchor ? `（${params.timeAnchor}）` : ''}`,
      actionSuggestions: ['✓ 已完成', '跳过今天', '推迟15分钟'] as never,
      idempotencyKey: `${eventId}_habit_${triggerAt.getTime()}`,
    })
  }

  if (reminders.length) {
    await prisma.reminder.createMany({ data: reminders as never })
  }
}

// ==================== 主入口：处理用户消息 ====================
export class AIService {
  async processMessage(
    userId: string,
    sessionId: string,
    userMessage: string,
    inputType: 'text' | 'voice' | 'image' = 'text',
    imageBase64?: string // 图片输入时传入
  ): Promise<AIProcessResult> {
    // 1. 读取用户记忆
    const userMemory = await memoryService.getUserMemory(userId)

    // 2. 读取最近对话历史
    const recentConversations = await memoryService.getRecentConversations(userId, sessionId, 10)

    // 3. 获取用户时区
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    })
    const timezone = user?.timezone || 'Asia/Shanghai'
    const currentTime = new Date().toLocaleString('zh-CN', { timeZone: timezone })

    // 4. 构建消息列表
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: buildSystemPrompt(userMemory, currentTime, timezone),
      },
      // 注入最近对话历史
      ...recentConversations.map((c) => ({
        role: c.role as 'user' | 'assistant',
        content: c.content,
      })),
    ]

    // 5. 构建当前用户消息（支持图片）
    if (imageBase64 && inputType === 'image') {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
          {
            type: 'text',
            text: userMessage || '请识别图片中的日程信息，帮我添加到日历',
          },
        ],
      })
    } else {
      messages.push({ role: 'user', content: userMessage })
    }

    // 6. 保存用户消息到历史
    await memoryService.saveConversation(userId, sessionId, 'user', userMessage, inputType)

    // 7. 调用 Kimi AI
    logger.debug('Calling Kimi AI', { userId, sessionId, messageCount: messages.length })

    const response = await kimi.chat.completions.create({
      model: process.env.KIMI_MODEL || 'moonshot-v1-8k',
      messages,
      tools: FUNCTIONS,
      tool_choice: 'auto',
      temperature: 0.3, // 低温度，更稳定
    })

    const choice = response.choices[0]
    const assistantMessage = choice.message

    // 8. 处理 Function Call
    let result: AIProcessResult = {
      reply: '',
      requiresClarification: false,
      memoryUpdated: false,
    }

    if (assistantMessage.tool_calls?.length) {
      const toolCall = assistantMessage.tool_calls[0]
      const funcName = toolCall.function.name
      const funcArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>

      logger.info('AI function call', { funcName, userId })

      const execResult = await executeFunctionCall(userId, funcName, funcArgs)

      if (funcName === 'clarify_input') {
        const clarifyArgs = funcArgs as ClarifyParams
        result.reply = clarifyArgs.question
        result.requiresClarification = true
        result.actionTaken = { type: 'clarification', data: clarifyArgs }
      } else if (funcName === 'query_events') {
        // 查询结果需要让 AI 生成自然语言回复
        const queryData = execResult.data
        const summaryResponse = await kimi.chat.completions.create({
          model: process.env.KIMI_MODEL || 'moonshot-v1-8k',
          messages: [
            ...messages,
            { role: 'assistant', content: null, tool_calls: assistantMessage.tool_calls } as never,
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(queryData),
            },
          ],
          temperature: 0.3,
        })
        result.reply = summaryResponse.choices[0].message.content || '查询完成'
        result.actionTaken = { type: 'query', data: queryData }
      } else if (funcName === 'update_memory') {
        result.reply = '好的，我已经记住了。'
        result.memoryUpdated = true
        result.actionTaken = { type: 'memory_updated' }
      } else {
        // create_event / create_habit / create_long_term
        const confirmation = (funcArgs as { userFacingConfirmation?: string }).userFacingConfirmation
        result.reply = confirmation || '好的，已为你安排好了。'
        result.actionTaken = {
          type: funcName === 'create_event'
            ? 'event_created'
            : funcName === 'create_habit_reminder'
            ? 'habit_created'
            : 'long_term_created',
          data: execResult.data,
        }
        result.functionCall = { name: funcName, arguments: funcArgs }
      }
    } else {
      // 纯文本回复（一般不应该发生，但做兜底）
      result.reply = assistantMessage.content || '我理解了，请问还有什么需要安排的吗？'
    }

    // 9. 保存 AI 回复到历史
    await memoryService.saveConversation(
      userId,
      sessionId,
      'assistant',
      result.reply,
      'text',
      result.functionCall
    )

    return result
  }
}

export const aiService = new AIService()
