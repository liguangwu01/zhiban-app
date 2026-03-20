import schedule from 'node-schedule'
import prisma from '../utils/db'
import { io } from '../index'
import { notificationService } from '../services/notification.service'
import logger from '../utils/logger'

// 每分钟扫描一次到期提醒
export function startReminderJob() {
  schedule.scheduleJob('* * * * *', async () => {
    try {
      const now = new Date()
      const oneMinuteLater = new Date(now.getTime() + 60 * 1000)

      // 查找所有到期且未发送的提醒
      const dueReminders = await prisma.reminder.findMany({
        where: {
          status: 'pending',
          triggerAt: { gte: now, lte: oneMinuteLater },
          deletedAt: null,
          retryCount: { lt: 3 },
        },
        include: {
          event: { select: { title: true, eventCategory: true, locationName: true } },
          user: {
            select: {
              id: true,
              preferences: {
                select: {
                  webPushSubscription: true,
                  doNotDisturbStart: true,
                  doNotDisturbEnd: true,
                  notificationMethods: true,
                },
              },
            },
          },
        },
      })

      if (dueReminders.length === 0) return

      logger.info(`Processing ${dueReminders.length} due reminders`)

      for (const reminder of dueReminders) {
        try {
          // 检查勿扰模式
          if (isInDoNotDisturb(reminder.user.preferences?.doNotDisturbStart, reminder.user.preferences?.doNotDisturbEnd)) {
            logger.info('Reminder skipped - Do Not Disturb', { reminderId: reminder.id })
            continue
          }

          // 检查推迟状态
          if (reminder.status === 'snoozed' && reminder.snoozeUntil && reminder.snoozeUntil > now) {
            continue
          }

          const methods = (reminder.user.preferences?.notificationMethods as string[]) || ['in_app']
          const sentMethods: string[] = []

          // 1. App 内推送（WebSocket）
          if (methods.includes('in_app')) {
            const sent = await sendInAppNotification(reminder)
            if (sent) sentMethods.push('in_app')
          }

          // 2. 浏览器桌面推送
          if (methods.includes('web_push') && reminder.user.preferences?.webPushSubscription) {
            const sent = await notificationService.sendWebPush(
              reminder.user.preferences.webPushSubscription as never,
              {
                title: `⏰ ${reminder.event.title}`,
                body: reminder.content,
                data: {
                  reminderId: reminder.id,
                  eventId: reminder.eventId,
                  actionSuggestions: reminder.actionSuggestions,
                },
              }
            )
            if (sent) sentMethods.push('web_push')
          }

          // 更新提醒状态为已发送
          await prisma.reminder.update({
            where: { id: reminder.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
              platformResponse: { methods: sentMethods } as never,
            },
          })

          logger.info('Reminder sent', { reminderId: reminder.id, methods: sentMethods })
        } catch (error) {
          // 失败重试计数
          await prisma.reminder.update({
            where: { id: reminder.id },
            data: {
              retryCount: { increment: 1 },
              errorMessage: String(error),
            },
          })
          logger.error('Reminder send failed', { reminderId: reminder.id, error })
        }
      }
    } catch (error) {
      logger.error('Reminder job error', { error })
    }
  })

  logger.info('⏰ Reminder job started (runs every minute)')
}

// 通过 WebSocket 发送 App 内通知
async function sendInAppNotification(reminder: {
  id: string
  eventId: string
  userId: string
  content: string
  actionSuggestions: unknown
  event: { title: string; locationName: string | null }
}): Promise<boolean> {
  try {
    io.to(`user:${reminder.userId}`).emit('reminder:push', {
      reminderId: reminder.id,
      eventId: reminder.eventId,
      title: reminder.event.title,
      content: reminder.content,
      locationName: reminder.event.locationName,
      actionSuggestions: reminder.actionSuggestions || ['✓ 知道了', '推迟15分钟'],
      triggeredAt: new Date().toISOString(),
    })
    return true
  } catch (error) {
    logger.error('WebSocket push failed', { error })
    return false
  }
}

// 检查是否在勿扰时间段
function isInDoNotDisturb(startTime?: string | null, endTime?: string | null): boolean {
  if (!startTime || !endTime) return false

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  // 处理跨午夜的情况（如 22:00 - 08:00）
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

// 习惯提醒续期 Job（每天凌晨1点，为习惯事件补充未来7天的提醒）
export function startHabitRenewalJob() {
  schedule.scheduleJob('0 1 * * *', async () => {
    logger.info('Running habit renewal job')
    try {
      const habitEvents = await prisma.event.findMany({
        where: { eventCategory: 'habit', status: 'active', deletedAt: null },
      })

      for (const event of habitEvents) {
        const recurrence = event.recurrence as {
          preferredTime: string
          frequency: string
          daysOfWeek?: number[]
          timeAnchor?: string
        } | null

        if (!recurrence?.preferredTime) continue

        const [hours, minutes] = recurrence.preferredTime.split(':').map(Number)

        // 检查未来7天内是否已有足够的提醒
        const futureReminders = await prisma.reminder.count({
          where: {
            eventId: event.id,
            status: 'pending',
            triggerAt: { gte: new Date() },
          },
        })

        // 如果未来提醒少于3条，补充到7天
        if (futureReminders < 3) {
          const newReminders = []
          for (let i = 1; i <= 7; i++) {
            const triggerAt = new Date()
            triggerAt.setDate(triggerAt.getDate() + i)
            triggerAt.setHours(hours, minutes, 0, 0)

            if (recurrence.daysOfWeek?.length) {
              if (!recurrence.daysOfWeek.includes(triggerAt.getDay())) continue
            }

            const key = `${event.id}_habit_${triggerAt.getTime()}`
            newReminders.push({
              eventId: event.id,
              userId: event.userId,
              triggerAt,
              content: `⏰ 该${event.title}了${recurrence.timeAnchor ? `（${recurrence.timeAnchor}）` : ''}`,
              actionSuggestions: ['✓ 已完成', '跳过今天', '推迟15分钟'] as never,
              idempotencyKey: key,
            })
          }

          if (newReminders.length) {
            await prisma.reminder.createMany({
              data: newReminders as never,
              skipDuplicates: true, // 避免重复插入
            })
            logger.info(`Renewed ${newReminders.length} reminders for habit: ${event.title}`)
          }
        }
      }
    } catch (error) {
      logger.error('Habit renewal job error', { error })
    }
  })

  logger.info('🔄 Habit renewal job started (runs daily at 1:00 AM)')
}
