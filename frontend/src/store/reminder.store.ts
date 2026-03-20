import { create } from 'zustand'
import type { ReminderNotification } from '../types/reminder'

// 重新导出，让其他文件可以从 store 里引用（保持兼容）
export type { ReminderNotification }

interface ReminderState {
  activeReminders: ReminderNotification[]
  addReminder: (r: ReminderNotification) => void
  dismissReminder: (reminderId: string) => void
  clearAll: () => void
}

export const useReminderStore = create<ReminderState>((set) => ({
  activeReminders: [],
  addReminder: (r) =>
    set((s) => ({
      activeReminders: s.activeReminders.find((x) => x.reminderId === r.reminderId)
        ? s.activeReminders
        : [r, ...s.activeReminders],
    })),
  dismissReminder: (reminderId) =>
    set((s) => ({
      activeReminders: s.activeReminders.filter((r) => r.reminderId !== reminderId),
    })),
  clearAll: () => set({ activeReminders: [] }),
}))
