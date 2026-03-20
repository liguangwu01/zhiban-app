import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JwtPayload } from '../types'

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证 Token' })
  }

  const token = authHeader.substring(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JwtPayload
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ success: false, error: 'Token 无效或已过期' })
  }
}
