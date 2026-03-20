import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  username: string
  email: string
  fullName: string | null
  timezone: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isLoggedIn: boolean
  login: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoggedIn: false,
      login: (user, accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        set({ user, accessToken, refreshToken, isLoggedIn: true })
      },
      logout: () => {
        localStorage.clear()
        set({ user: null, accessToken: null, refreshToken: null, isLoggedIn: false })
      },
    }),
    { name: 'auth-storage', partialize: (s) => ({ user: s.user, isLoggedIn: s.isLoggedIn }) }
  )
)
