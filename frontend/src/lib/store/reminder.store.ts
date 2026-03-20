import { create } from 'zustand'

export interface ReminderNotification {
  reminderId: string
  eventId: string
  title: string
  content: string
  locationName?: string
  actionSuggestions: string[]
  triggeredAt: string
}

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
    set((s) => ({ activeReminders: s.activeReminders.filter((r) => r.reminderId !== reminderId) })),
  clearAll: () => set({ activeReminders: [] }),
}))
