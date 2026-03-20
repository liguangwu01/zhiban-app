import webpush from 'web-push'
import logger from '../utils/logger'

// 初始化 VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@zhiban.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export interface WebPushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  data?: Record<string, unknown>
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export class NotificationService {
  // 发送浏览器桌面推送
  async sendWebPush(subscription: PushSubscription, payload: WebPushPayload): Promise<boolean> {
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          icon: payload.icon || '/icon-192.png',
          badge: payload.badge || '/badge-72.png',
          data: payload.data || {},
          actions: [
            { action: 'confirm', title: '✓ 知道了' },
            { action: 'snooze', title: '推迟15分钟' },
          ],
        })
      )
      return true
    } catch (error) {
      // 订阅已失效（用户取消了通知权限）
      if ((error as { statusCode?: number }).statusCode === 410) {
        logger.warn('Web push subscription expired', { endpoint: subscription.endpoint })
      } else {
        logger.error('Web push send failed', { error })
      }
      return false
    }
  }

  // 获取 VAPID 公钥（前端订阅时需要）
  getVapidPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || ''
  }
}

export const notificationService = new NotificationService()
