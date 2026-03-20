import type { ReminderNotification } from '../types/reminder'
import { useReminderStore } from '../store/reminder.store'
import { sendReminderAction } from '../hooks/useSocket'
import { MapPin, X } from 'lucide-react'

function ReminderCard({ reminder }: { reminder: ReminderNotification }) {
  const { dismissReminder } = useReminderStore()

  const handleAction = (action: string) => {
    if (action.includes('推迟')) {
      sendReminderAction(reminder.reminderId, 'snoozed', 15)
    } else if (action.includes('跳过')) {
      sendReminderAction(reminder.reminderId, 'skipped')
    } else {
      sendReminderAction(reminder.reminderId, 'confirmed')
    }
    dismissReminder(reminder.reminderId)
  }

  return (
    <div className="reminder-enter bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-80 max-w-full">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">⏰</span>
          <span className="font-semibold text-gray-900 text-sm">{reminder.title}</span>
        </div>
        <button
          onClick={() => dismissReminder(reminder.reminderId)}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <X size={16} />
        </button>
      </div>

      <p className="text-gray-600 text-sm mb-2 leading-relaxed">{reminder.content}</p>

      {reminder.locationName && (
        <div className="flex items-center gap-1 text-gray-400 text-xs mb-3">
          <MapPin size={12} />
          <span>{reminder.locationName}</span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {(reminder.actionSuggestions?.length
          ? reminder.actionSuggestions
          : ['✓ 知道了', '推迟15分钟']
        ).map((action) => (
          <button
            key={action}
            onClick={() => handleAction(action)}
            className="flex-1 min-w-0 py-2 px-3 bg-gray-100 hover:bg-primary-50 hover:text-primary-600 rounded-xl text-xs font-medium transition-colors truncate"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ReminderContainer() {
  const { activeReminders } = useReminderStore()
  if (activeReminders.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-h-screen overflow-y-auto pb-4">
      {activeReminders.map((r) => (
        <ReminderCard key={r.reminderId} reminder={r} />
      ))}
    </div>
  )
}
