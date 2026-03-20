export interface ReminderNotification {
    reminderId: string
    eventId: string
    title: string
    content: string
    locationName?: string
    actionSuggestions: string[]
    triggeredAt: string
  }
  