import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import prisma from '../utils/db'
import { JwtPayload } from '../types'

export class AuthService {
  // 注册
  async register(username: string, email: string, password: string, fullName?: string) {
    // 检查用户是否已存在
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    })
    if (existing) {
      throw new Error(existing.email === email ? '该邮箱已被注册' : '该用户名已被使用')
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 12)

    // 创建用户（同时初始化关联数据）
    const user = await prisma.$transaction(async (trx) => {
      const newUser = await trx.user.create({
        data: { username, email, passwordHash, fullName },
      })

      // 初始化用户偏好
      await trx.userPreference.create({
        data: { userId: newUser.id },
      })

      // 初始化用户记忆（空白模板）
      await trx.userMemory.create({
        data: { userId: newUser.id },
      })

      // 初始化用户洞察
      await trx.userInsight.create({
        data: {
          userId: newUser.id,
          learningDataExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      })

      return newUser
    })

    const tokens = await this.generateTokens(user.id, user.email)
    return { user: this.sanitizeUser(user), ...tokens }
  }

  // 登录
  async login(emailOrUsername: string, password: string) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrUsername }, { username: emailOrUsername }],
        deletedAt: null,
        isActive: true,
      },
    })

    if (!user) throw new Error('用户不存在')

    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) throw new Error('密码错误')

    // 更新最后登录时间
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    })

    const tokens = await this.generateTokens(user.id, user.email)
    return { user: this.sanitizeUser(user), ...tokens }
  }

  // 刷新 Token
  async refreshToken(refreshToken: string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    })

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new Error('无效的 Refresh Token')
    }

    // 撤销旧 token（单次使用）
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const tokens = await this.generateTokens(stored.userId, stored.user.email)
    return tokens
  }

  // 生成 Token 对
  private async generateTokens(userId: string, email: string) {
    const payload: JwtPayload = { userId, email }

    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '2h',
    })

    const refreshToken = uuidv4()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天

    await prisma.refreshToken.create({
      data: { userId, token: refreshToken, expiresAt },
    })

    return { accessToken, refreshToken }
  }

  // 去掉敏感字段
  private sanitizeUser(user: { id: string; username: string; email: string; fullName: string | null; timezone: string }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      timezone: user.timezone,
    }
  }
}

export const authService = new AuthService()
