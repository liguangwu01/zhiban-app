import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth.store'
import { useReminderStore } from '../store/reminder.store'
import toast from 'react-hot-toast'
import type { ReminderNotification } from '../types/reminder'

let socketInstance: Socket | null = null

export function useSocket() {
  const { user, isLoggedIn } = useAuthStore()
  const { addReminder } = useReminderStore()
  const initialized = useRef(false)

  useEffect(() => {
    if (!isLoggedIn || !user || initialized.current) return
    initialized.current = true

    socketInstance = io(import.meta.env.VITE_WS_URL, {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket'],
    })

    socketInstance.on('connect', () => {
      console.log('✅ WebSocket connected')
      socketInstance?.emit('join', user.id)
    })

    socketInstance.on('reminder:push', (data: ReminderNotification) => {
      addReminder(data)
      toast(`⏰ ${data.title}`, {
        duration: 5000,
        position: 'top-center',
        style: { background: '#0ea5e9', color: '#fff', fontWeight: 600 },
      })
    })

    socketInstance.on('disconnect', () => {
      console.log('WebSocket disconnected')
    })

    return () => {
      socketInstance?.disconnect()
      socketInstance = null
      initialized.current = false
    }
  }, [isLoggedIn, user, addReminder])

  return socketInstance
}

export function sendReminderAction(
  reminderId: string,
  action: 'confirmed' | 'snoozed' | 'skipped',
  snoozeMinutes?: number
) {
  socketInstance?.emit('reminder:action', { reminderId, action, snoozeMinutes })
}
