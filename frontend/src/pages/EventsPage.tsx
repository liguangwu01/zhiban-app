import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, Clock, MapPin } from 'lucide-react'
import api from '../lib/api'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'

interface Event {
  id: string
  title: string
  eventCategory: string
  eventType: string
  startTime: string | null
  locationName: string | null
  status: string
  reminders: Array<{ id: string; triggerAt: string; content: string; status: string }>
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const fetchEvents = async () => {
    try {
      const { data } = await api.get('/api/events')
      setEvents(data.data)
    } catch {
      toast.error('获取日程失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEvents() }, [])

  const deleteEvent = async (id: string) => {
    if (!confirm('确定删除这个日程吗？')) return
    try {
      await api.delete(`/api/events/${id}`)
      setEvents((prev) => prev.filter((e) => e.id !== id))
      toast.success('已删除')
    } catch {
      toast.error('删除失败')
    }
  }

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = { temporary: '📅 日程', habit: '🔄 习惯', long_term: '🎯 计划' }
    return map[cat] || cat
  }

  const categoryColor = (cat: string) => {
    const map: Record<string, string> = {
      temporary: 'bg-blue-50 text-blue-700 border-blue-100',
      habit: 'bg-green-50 text-green-700 border-green-100',
      long_term: 'bg-purple-50 text-purple-700 border-purple-100',
    }
    return map[cat] || 'bg-gray-50 text-gray-700'
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-gray-900">我的日程</h1>
        <span className="ml-auto text-sm text-gray-400">{events.length} 项</span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12 text-gray-400">加载中...</div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <span className="text-4xl mb-3">📭</span>
            <p className="text-sm">还没有日程，去和智伴说说你的安排吧</p>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryColor(event.eventCategory)}`}>
                      {categoryLabel(event.eventCategory)}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 text-sm mb-1">{event.title}</h3>
                  {event.startTime && (
                    <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                      <Clock size={12} />
                      <span>{dayjs(event.startTime).format('MM月DD日 HH:mm')}</span>
                    </div>
                  )}
                  {event.locationName && (
                    <div className="flex items-center gap-1 text-gray-500 text-xs">
                      <MapPin size={12} />
                      <span>{event.locationName}</span>
                    </div>
                  )}
                  {/* 提醒列表 */}
                  {event.reminders.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {event.reminders.slice(0, 2).map((r) => (
                        <div key={r.id} className="flex items-center gap-1 text-xs text-gray-400">
                          <span>⏰</span>
                          <span>{dayjs(r.triggerAt).format('MM-DD HH:mm')}</span>
                          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                            r.status === 'sent' ? 'bg-green-100 text-green-600' :
                            r.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>{r.status === 'pending' ? '待发送' : r.status === 'sent' ? '已发送' : r.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteEvent(event.id)}
                  className="p-2 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-colors ml-2"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
