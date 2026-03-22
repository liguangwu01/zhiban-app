// JWT Payload
export interface JwtPayload {
  userId: string
  email: string
  iat?: number
  exp?: number
}

// AI Function Call 返回的结构
export interface AIFunctionCall {
  name: string
  arguments: Record<string, unknown>
}

// AI 处理结果
export interface AIProcessResult {
  reply: string                    // 给用户看的自然语言回复
  functionCall?: AIFunctionCall    // AI 调用的工具
  actionTaken?: {
    // ✅ 改动1：新增 'event_updated'
    type: 'event_created' | 'event_updated' | 'habit_created' | 'long_term_created' | 'query' | 'clarification' | 'memory_updated'
    data?: unknown
  }
  requiresClarification: boolean
  memoryUpdated: boolean           // 本次对话是否更新了记忆
}

// 创建事件的参数
export interface CreateEventParams {
  title: string
  rawInput: string
  eventType: string
  startTime?: string
  endTime?: string
  locationName?: string
  locationAddress?: string
  participants?: Array<{ name: string; relationship?: string }>
  preparationItems?: string[]
  importance?: string
  reminderPlan: Array<{
    triggerAt: string
    content: string
    actionSuggestions?: string[]
  }>
  userFacingConfirmation: string
}

// 创建习惯提醒的参数
export interface CreateHabitParams {
  name: string
  rawInput: string
  frequency: 'daily' | 'weekly' | 'monthly'
  daysOfWeek?: number[]
  preferredTime: string
  timeAnchor?: string
  notificationStyle?: 'minimal' | 'normal'
  trackCompletion?: boolean
  userFacingConfirmation: string
}

// 创建远期事件的参数
export interface CreateLongTermParams {
  title: string
  rawInput: string
  targetDate: string
  category: string
  reminderChain: Array<{
    triggerDaysBefore: number
    triggerTime: string
    message: string
    actionSuggestions?: string[]
  }>
  checkList?: Array<{ item: string; dueDaysBefore?: number }>
  userFacingConfirmation: string
}

// 追问参数
export interface ClarifyParams {
  missingInfo: string
  question: string
  options?: string[]
}

// 更新记忆参数
export interface UpdateMemoryParams {
  profileUpdate?: string    // 对 profile 的更新描述
  newEventSummary?: string  // 新增的事件摘要
}

// Express Request 扩展（携带用户信息）
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export interface UserMemory {
  id: string
  userId: string
  updatedAt: Date
  profile: string
  recentEventsSummary: string
  behaviorMemory?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  inputType?: 'text' | 'voice' | 'image'
  actionTaken?: { type: string; data?: unknown }
  createdAt: Date
}
