import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { Send, Mic, MicOff, Camera, LogOut, Calendar } from 'lucide-react'
import { useAuthStore } from '../store/auth.store'
import api from '../lib/api'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
dayjs.locale('zh-cn')

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  inputType?: 'text' | 'voice' | 'image'
  actionTaken?: { type: string; data?: unknown }
  createdAt: Date
}

const SESSION_ID = uuidv4()

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好！我是智伴，你的 AI 私人秘书 👋\n\n你可以直接告诉我要安排什么，比如：\n• "明天下午3点部门例会"\n• "每天提醒我吃鱼油"\n• "下周三去上海见张总"',
      createdAt: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 发送消息
  const sendMessage = useCallback(async (
    content: string,
    inputType: 'text' | 'voice' | 'image' = 'text',
    imageBase64?: string
  ) => {
    if (!content.trim() && !imageBase64) return
    setLoading(true)

    // 添加用户消息到界面
    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content: content || '📷 [图片]',
      inputType,
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    try {
      const { data } = await api.post('/api/chat/message', {
        message: content,
        sessionId: SESSION_ID,
        inputType,
        ...(imageBase64 && { imageBase64 }),
      })

      const aiMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: data.data.reply,
        actionTaken: data.data.actionTaken,
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch {
      toast.error('AI 响应失败，请重试')
      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: 'system', content: '⚠️ 网络异常，请重试', createdAt: new Date() },
      ])
    } finally {
      setLoading(false)
    }
  }, [])

  // 语音输入
  const toggleRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast.error('你的浏览器不支持语音输入，请使用 Chrome')
      return
    }

    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      sendMessage(transcript, 'voice')
    }
    recognition.onerror = () => {
      toast.error('语音识别失败，请重试')
      setIsRecording(false)
    }
    recognition.onend = () => setIsRecording(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
    toast('🎤 正在聆听...', { duration: 3000 })
  }

  // 图片输入
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      sendMessage('请识别图片中的日程信息，帮我添加到日历', 'image', base64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // 消息气泡渲染
  const renderMessage = (msg: Message) => {
    const isUser = msg.role === 'user'
    const isSystem = msg.role === 'system'

    if (isSystem) {
      return (
        <div key={msg.id} className="flex justify-center my-2">
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{msg.content}</span>
        </div>
      )
    }

    return (
      <div key={msg.id} className={`flex message-enter ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm mr-2 flex-shrink-0 mt-1">
            🤖
          </div>
        )}
        <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
          <div
            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              isUser
                ? 'bg-primary-600 text-white rounded-br-sm'
                : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm'
            }`}
          >
            {msg.content}
          </div>
          {/* 操作成功标签 */}
          {msg.actionTaken && msg.actionTaken.type !== 'clarification' && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <span>✓</span>
              {msg.actionTaken.type === 'event_created' && '日程已创建'}
              {msg.actionTaken.type === 'habit_created' && '习惯提醒已设置'}
              {msg.actionTaken.type === 'long_term_created' && '远期计划已记录'}
              {msg.actionTaken.type === 'query' && '查询完成'}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {dayjs(msg.createdAt).format('HH:mm')}
            {msg.inputType === 'voice' && ' 🎤'}
            {msg.inputType === 'image' && ' 📷'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-500 flex items-center justify-center text-white">
            🤖
          </div>
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">智伴</h1>
            <p className="text-xs text-green-500">● 在线</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/events')}
            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
            title="日程列表"
          >
            <Calendar size={20} />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            title="退出登录"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map(renderMessage)}
        {loading && (
          <div className="flex justify-start mb-3 message-enter">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm mr-2 flex-shrink-0">
              🤖
            </div>
            <div className="bg-white shadow-sm border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 safe-area-bottom">
        <div className="flex items-end gap-2">
          {/* 图片上传 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors flex-shrink-0"
          >
            <Camera size={20} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          {/* 文字输入框 */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            placeholder="告诉我要安排什么..."
            rows={1}
            className="flex-1 resize-none bg-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 max-h-32"
            style={{ lineHeight: '1.5' }}
          />

          {/* 语音 / 发送 */}
          {input.trim() ? (
            <button
              onClick={() => sendMessage(input)}
              disabled={loading}
              className="p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
            >
              <Send size={20} />
            </button>
          ) : (
            <button
              onClick={toggleRecording}
              className={`p-3 rounded-xl transition-all flex-shrink-0 ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'
              }`}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
