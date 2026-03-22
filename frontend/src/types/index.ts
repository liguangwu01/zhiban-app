export interface UserMemory {
  id: string
  userId: string
  updatedAt: Date
  profile: string
  recentEventsSummary: string
  behaviorMemory?: string  // 添加这个可选字段
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  inputType?: 'text' | 'voice' | 'image'
  actionTaken?: { type: string; data?: unknown }
  createdAt: Date
}
